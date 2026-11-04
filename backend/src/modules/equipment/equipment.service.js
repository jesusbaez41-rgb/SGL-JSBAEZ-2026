const { QueryTypes } = require('sequelize');
const { sequelize, Equipo, Laboratorio } = require('../../models');
const { recordAuditEvent } = require('../audit/audit.service');
const meshcentral = require('./meshcentral.service');
const logger = require('../../utils/logger');

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function normalizeMac(value) {
  return String(value || '')
    .trim()
    .replace(/-/g, ':')
    .toUpperCase();
}

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeIp(value) {
  const ip = String(value || '').trim();
  return ip || null;
}

function translateDbError(err) {
  if (err.status) return err;
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors && err.errors[0] ? err.errors[0].path : '';
    if (field === 'mac_address') {
      return httpError(409, 'La MAC ya está registrada en otro equipo.', 'MAC_DUPLICADA');
    }
    if (field === 'hostname') {
      return httpError(409, 'El hostname ya está registrado en otro equipo.', 'HOSTNAME_DUPLICADO');
    }
    if (field === 'mesh_agent_id') {
      return httpError(409, 'El identificador de MeshCentral ya está asignado.', 'MESH_DUPLICADO');
    }
    return httpError(409, 'El equipo ya está registrado.', 'EQUIPO_DUPLICADO');
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return httpError(400, 'El laboratorio indicado no existe.', 'LAB_NO_ENCONTRADO');
  }
  return httpError(500, 'No se pudo guardar el equipo.', 'DB_ERROR');
}

function buildSelect(req, id = null) {
  const replacements = {};
  let where = '';

  if (id) {
    where += ' AND e.id = :id';
    replacements.id = id;
  }

  let docenteJoin = '';
  if (req.user.rol === 'DOCENTE') {
    docenteJoin = `
      AND EXISTS (
        SELECT 1
          FROM sesion_activa s2
          JOIN membresia_grupo m
            ON m.usuario_id = s2.usuario_id
           AND m.activa = TRUE
          JOIN asignacion_docente a
            ON a.grupo_id = m.grupo_id
         WHERE s2.equipo_id = e.id
           AND s2.activa = TRUE
           AND a.docente_id = :docenteId
      )
    `;
    replacements.docenteId = req.user.id;
  }

  return {
    replacements,
    sql: `
      SELECT e.id,
             e.mac_address,
             e.hostname,
             e.ip_address,
             e.laboratorio_id,
             l.nombre AS laboratorio_nombre,
             e.estado,
             e.mesh_agent_id,
             e.ultimo_reporte,
             ses.usuario_uid,
             ses.usuario_nombre
        FROM equipo e
        JOIN laboratorio l ON l.id = e.laboratorio_id
        LEFT JOIN LATERAL (
          SELECT u.uid AS usuario_uid,
                 u.nombre_completo AS usuario_nombre
            FROM sesion_activa s
            JOIN usuario u ON u.id = s.usuario_id
           WHERE s.equipo_id = e.id
             AND s.activa = TRUE
           ORDER BY s.hora_inicio DESC
           LIMIT 1
        ) ses ON TRUE
       WHERE 1 = 1
       ${where}
       ${docenteJoin}
       ORDER BY e.hostname ASC
    `,
  };
}

async function mergeMesh(rows) {
  if (!rows || rows.length === 0) return rows;

  let devices = null;
  try {
    devices = await meshcentral.fetchDevices();
  } catch (err) {
    logger.warn('No se pudo consultar MeshCentral para el inventario', { error: err.message });
  }

  const byNode = new Map();
  const byHost = new Map();
  for (const device of devices || []) {
    if (device.nodeid) byNode.set(device.nodeid, device);
    if (device.hostname) byHost.set(device.hostname, device);
  }

  for (const row of rows) {
    row.usuario_actual = row.usuario_nombre
      ? `${row.usuario_nombre} (${row.usuario_uid})`
      : null;
    delete row.usuario_uid;
    delete row.usuario_nombre;

    const device =
      (row.mesh_agent_id && byNode.get(row.mesh_agent_id)) ||
      byHost.get(String(row.hostname || '').toLowerCase());

    if (device) {
      row.estado = device.estado || row.estado;
      row.ip_address = device.ip_address || row.ip_address;
      row.ultimo_reporte = device.ultimo_reporte || row.ultimo_reporte;
      row.usuario_actual = device.usuario_actual || row.usuario_actual;
      row.mesh_source = 'MESHCENTRAL';
    } else {
      row.mesh_source = 'LOCAL';
    }
  }

  return rows;
}

async function list(req) {
  const { sql, replacements } = buildSelect(req);
  const rows = await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return mergeMesh(rows);
}

async function get(req, id) {
  const { sql, replacements } = buildSelect(req, id);
  const rows = await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  if (rows.length === 0) {
    throw httpError(404, 'Equipo no encontrado.', 'EQUIPO_NO_ENCONTRADO');
  }
  return mergeMesh(rows)[0];
}

async function ensureLab(laboratorioId) {
  const lab = await Laboratorio.findByPk(laboratorioId);
  if (!lab) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');
  return lab;
}

async function create(req, payload) {
  const lab = await ensureLab(payload.laboratorio_id);
  const mac = normalizeMac(payload.mac_address);
  const hostname = normalizeHostname(payload.hostname);
  const ip = normalizeIp(payload.ip_address);

  const [dupMac, dupHost] = await Promise.all([
    Equipo.findOne({ where: { mac_address: mac } }),
    Equipo.findOne({ where: { hostname } }),
  ]);
  if (dupMac) throw httpError(409, 'La MAC ya está registrada en otro equipo.', 'MAC_DUPLICADA');
  if (dupHost) throw httpError(409, 'El hostname ya está registrado en otro equipo.', 'HOSTNAME_DUPLICADO');

  let equipo;
  try {
    equipo = await Equipo.create({
      mac_address: mac,
      hostname,
      ip_address: ip,
      laboratorio_id: lab.id,
      estado: 'DESCONOCIDO',
      mesh_agent_id: payload.mesh_agent_id ? String(payload.mesh_agent_id).trim() : null,
    });
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'CREAR',
    entidad: 'equipo',
    entidadId: equipo.id,
    detalle: { mac, hostname, ip, laboratorio_id: lab.id, laboratorio: lab.nombre },
  });

  return { ...equipo.toJSON(), laboratorio_nombre: lab.nombre, usuario_actual: null, mesh_source: 'LOCAL' };
}

async function update(req, id, payload) {
  const equipo = await Equipo.findByPk(id);
  if (!equipo) throw httpError(404, 'Equipo no encontrado.', 'EQUIPO_NO_ENCONTRADO');

  const changes = {};

  if (payload.mac_address !== undefined) {
    const mac = normalizeMac(payload.mac_address);
    const dup = await Equipo.findOne({ where: { mac_address: mac } });
    if (dup && dup.id !== equipo.id) {
      throw httpError(409, 'La MAC ya está registrada en otro equipo.', 'MAC_DUPLICADA');
    }
    changes.mac_address = mac;
  }

  if (payload.hostname !== undefined) {
    const hostname = normalizeHostname(payload.hostname);
    const dup = await Equipo.findOne({ where: { hostname } });
    if (dup && dup.id !== equipo.id) {
      throw httpError(409, 'El hostname ya está registrado en otro equipo.', 'HOSTNAME_DUPLICADO');
    }
    changes.hostname = hostname;
  }

  if (payload.ip_address !== undefined) {
    changes.ip_address = normalizeIp(payload.ip_address);
  }

  if (payload.laboratorio_id !== undefined) {
    const lab = await ensureLab(payload.laboratorio_id);
    changes.laboratorio_id = lab.id;
  }

  if (payload.mesh_agent_id !== undefined) {
    changes.mesh_agent_id = payload.mesh_agent_id ? String(payload.mesh_agent_id).trim() : null;
  }

  if (Object.keys(changes).length === 0) {
    return get(req, id);
  }

  try {
    await equipo.update(changes);
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'equipo',
    entidadId: equipo.id,
    detalle: { campos: Object.keys(changes), actual: changes },
  });

  return get(req, id);
}

async function sync(req) {
  let devices;
  try {
    devices = await meshcentral.fetchDevices();
  } catch (err) {
    throw httpError(502, `No se pudo consultar MeshCentral: ${err.message}`, 'MESH_ERROR');
  }
  if (!devices) {
    throw httpError(503, 'MeshCentral no está configurado.', 'MESH_NO_CONFIGURADO');
  }

  const equipos = await Equipo.findAll();
  const byNode = new Map();
  const byHost = new Map();
  for (const device of devices) {
    if (device.nodeid) byNode.set(device.nodeid, device);
    if (device.hostname) byHost.set(device.hostname, device);
  }

  let actualizados = 0;
  for (const equipo of equipos) {
    const device =
      (equipo.mesh_agent_id && byNode.get(equipo.mesh_agent_id)) ||
      byHost.get(String(equipo.hostname).toLowerCase());
    if (!device) continue;

    const changes = {};
    if (device.nodeid && !equipo.mesh_agent_id) changes.mesh_agent_id = device.nodeid;
    if (device.estado && device.estado !== equipo.estado) changes.estado = device.estado;
    if (device.ip_address && device.ip_address !== equipo.ip_address) changes.ip_address = device.ip_address;
    if (device.ultimo_reporte) changes.ultimo_reporte = new Date(device.ultimo_reporte);

    if (Object.keys(changes).length > 0) {
      await equipo.update(changes);
      actualizados += 1;
    }
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'equipo',
    entidadId: null,
    detalle: { source: 'MESHCENTRAL', actualizados, total: equipos.length },
  });

  return { actualizados, total: equipos.length };
}

async function refresh(req, id) {
  const equipo = await Equipo.findByPk(id);
  if (!equipo) throw httpError(404, 'Equipo no encontrado.', 'EQUIPO_NO_ENCONTRADO');

  let devices;
  try {
    devices = await meshcentral.fetchDevices();
  } catch (err) {
    throw httpError(502, `No se pudo consultar MeshCentral: ${err.message}`, 'MESH_ERROR');
  }
  if (!devices) {
    throw httpError(503, 'MeshCentral no está configurado.', 'MESH_NO_CONFIGURADO');
  }

  const device =
    devices.find((d) => equipo.mesh_agent_id && d.nodeid === equipo.mesh_agent_id) ||
    devices.find((d) => d.hostname === String(equipo.hostname).toLowerCase());

  if (!device) {
    const row = await get(req, id);
    return { ...row, mesh_encontrado: false };
  }

  const changes = {};
  if (device.nodeid && !equipo.mesh_agent_id) changes.mesh_agent_id = device.nodeid;
  if (device.estado && device.estado !== equipo.estado) changes.estado = device.estado;
  if (device.ip_address && device.ip_address !== equipo.ip_address) changes.ip_address = device.ip_address;
  if (device.ultimo_reporte) changes.ultimo_reporte = new Date(device.ultimo_reporte);

  if (Object.keys(changes).length > 0) {
    await equipo.update(changes);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'equipo',
    entidadId: equipo.id,
    detalle: { source: 'MESHCENTRAL', refresh: true, campos: Object.keys(changes) },
  });

  const row = await get(req, id);
  return { ...row, mesh_encontrado: true };
}

module.exports = { list, get, create, update, sync, refresh };
