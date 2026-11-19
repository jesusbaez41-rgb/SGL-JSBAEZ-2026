const { QueryTypes } = require('sequelize');
const { sequelize, Equipo, Laboratorio } = require('../../models');
const { recordAuditEvent } = require('../audit/audit.service');
const meshcentral = require('./meshcentral.service');
const logger = require('../../utils/logger');

const MAC_PATTERN = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function normalizeMac(value) {
  const raw = String(value || '')
    .trim()
    .replace(/-/g, ':')
    .toUpperCase();
  return MAC_PATTERN.test(raw) && raw !== '00:00:00:00:00:00' ? raw : null;
}

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeIp(value) {
  const ip = String(value || '').trim();
  return ip || null;
}

function ipv4ToInt(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    result = ((result << 8) + octet) >>> 0;
  }
  return result;
}

function ipInCidr(ip, cidr) {
  const [network, prefixRaw] = String(cidr || '').split('/');
  const prefix = Number(prefixRaw);
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);

  if (ipInt === null || netInt === null) return false;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
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

  const labId = req && req.query ? req.query.laboratorio_id : null;
  if (labId) {
    where += ' AND e.laboratorio_id = :labId';
    replacements.labId = labId;
  }

  let docenteJoin = '';
  if (req && req.user && req.user.rol === 'DOCENTE') {
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

async function fetchLocalRows(req, id = null) {
  const { sql, replacements } = buildSelect(req, id);
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

function buildMeshIndex(devices) {
  const byNode = new Map();
  const byMac = new Map();
  const byHost = new Map();

  for (const device of devices || []) {
    if (device.nodeid) byNode.set(device.nodeid, device);
    if (device.mac_address) byMac.set(device.mac_address, device);
    if (device.hostname) byHost.set(device.hostname, device);
  }

  return { byNode, byMac, byHost };
}

async function loadMeshDevices() {
  const configured =
    typeof meshcentral.isConfigured === 'function' ? meshcentral.isConfigured() : true;
  if (!configured) return { devices: null, error: null, configured: false };

  try {
    return { devices: await meshcentral.fetchDevices(), error: null, configured: true };
  } catch (err) {
    logger.warn('No se pudo consultar MeshCentral para el inventario', { error: err.message });
    return { devices: null, error: err, configured: true };
  }
}

async function mergeMesh(rows, meshState = null) {
  if (!rows || rows.length === 0) return rows;

  const state = meshState || (await loadMeshDevices());
  const { byNode, byMac, byHost } = buildMeshIndex(state.devices);

  for (const row of rows) {
    row.usuario_actual = row.usuario_nombre
      ? `${row.usuario_nombre} (${row.usuario_uid})`
      : null;
    delete row.usuario_uid;
    delete row.usuario_nombre;

    if (state.error) {
      // CA-09: si MeshCentral no responde, no se muestra un estado obsoleto.
      row.estado = 'DESCONOCIDO';
      row.usuario_actual = null;
      row.mesh_source = 'LOCAL';
      row.mesh_error = true;
      row.mesh_encontrado = false;
      continue;
    }

    if (!state.devices) {
      row.mesh_source = 'LOCAL';
      row.mesh_error = false;
      row.mesh_encontrado = false;
      continue;
    }

    const device =
      (row.mesh_agent_id && byNode.get(row.mesh_agent_id)) ||
      (row.mac_address && byMac.get(normalizeMac(row.mac_address))) ||
      byHost.get(String(row.hostname || '').toLowerCase());

    if (device) {
      row.estado = device.estado || row.estado;
      row.ip_address = device.ip_address || row.ip_address;
      row.ultimo_reporte = device.ultimo_reporte || row.ultimo_reporte;
      row.usuario_actual = device.usuario_actual || row.usuario_actual;
      row.osdesc = device.osdesc || null;
      row.mesh_source = 'MESHCENTRAL';
      row.mesh_error = false;
      row.mesh_encontrado = true;
    } else {
      row.estado = 'DESCONOCIDO';
      row.mesh_source = 'LOCAL';
      row.mesh_error = false;
      row.mesh_encontrado = false;
    }
  }

  return rows;
}

async function list(req) {
  const rows = await fetchLocalRows(req);
  return mergeMesh(rows);
}

async function get(req, id) {
  const rows = await fetchLocalRows(req, id);
  if (rows.length === 0) {
    throw httpError(404, 'Equipo no encontrado.', 'EQUIPO_NO_ENCONTRADO');
  }
  const merged = await mergeMesh(rows);
  return merged[0];
}

async function ensureLab(laboratorioId) {
  const lab = await Laboratorio.findByPk(laboratorioId);
  if (!lab) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');
  return lab;
}

async function listLabsForInference() {
  if (typeof Laboratorio.findAll === 'function') {
    return Laboratorio.findAll({
      attributes: ['id', 'nombre', 'subred'],
      order: [['nombre', 'ASC']],
    });
  }
  return sequelize.query(
    'SELECT id, nombre, subred FROM laboratorio ORDER BY nombre ASC',
    { type: QueryTypes.SELECT },
  );
}

function labForIp(ip, labs) {
  if (!ip) return null;

  const candidates = (labs || [])
    .filter((lab) => ipInCidr(ip, lab.subred))
    .sort((a, b) => {
      const prefixA = Number(String(a.subred).split('/')[1] || 0);
      const prefixB = Number(String(b.subred).split('/')[1] || 0);
      return prefixB - prefixA;
    });

  return candidates[0] || null;
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

function applyDeviceChanges(equipo, device) {
  const changes = {};

  if (device.nodeid && equipo.mesh_agent_id !== device.nodeid) {
    changes.mesh_agent_id = device.nodeid;
  }
  if (device.estado && equipo.estado !== device.estado) {
    changes.estado = device.estado;
  }
  if (device.ip_address && equipo.ip_address !== device.ip_address) {
    changes.ip_address = device.ip_address;
  }

  const mac = normalizeMac(device.mac_address);
  if (mac && normalizeMac(equipo.mac_address) !== mac) {
    changes.mac_address = mac;
  }

  if (device.ultimo_reporte) {
    const report = new Date(device.ultimo_reporte);
    if (!Number.isNaN(report.getTime())) {
      const current = equipo.ultimo_reporte ? new Date(equipo.ultimo_reporte).getTime() : null;
      if (current !== report.getTime()) changes.ultimo_reporte = report;
    }
  }

  return changes;
}

async function syncFromMesh(req, { laboratorioId = null, background = false } = {}) {
  const state = await loadMeshDevices();

  if (state.error) {
    logger.error('Sincronización MeshCentral fallida', { error: state.error.message });
    throw httpError(502, 'No se pudo consultar MeshCentral.', 'MESH_ERROR');
  }
  if (!state.devices) {
    throw httpError(503, 'MeshCentral no está configurado.', 'MESH_NO_CONFIGURADO');
  }

  const requestedLab = laboratorioId ? await ensureLab(laboratorioId) : null;
  const labs = requestedLab ? [requestedLab] : await listLabsForInference();
  const equipos = await Equipo.findAll();

  const byNode = new Map();
  const byMac = new Map();
  const byHost = new Map();
  for (const equipo of equipos) {
    if (equipo.mesh_agent_id) byNode.set(equipo.mesh_agent_id, equipo);
    const mac = normalizeMac(equipo.mac_address);
    if (mac) byMac.set(mac, equipo);
    if (equipo.hostname) byHost.set(normalizeHostname(equipo.hostname), equipo);
  }

  const summary = {
    creados: 0,
    actualizados: 0,
    total: state.devices.length,
    sin_laboratorio: 0,
    sin_mac: 0,
    sin_hostname: 0,
    errores: 0,
    detalle: [],
  };

  for (const device of state.devices) {
    const hostname = normalizeHostname(device.hostname);
    const mac = normalizeMac(device.mac_address);

    if (!hostname) {
      summary.sin_hostname += 1;
      summary.detalle.push({ nodeid: device.nodeid, motivo: 'SIN_HOSTNAME' });
      continue;
    }

    let equipo =
      (device.nodeid && byNode.get(device.nodeid)) ||
      (mac && byMac.get(mac)) ||
      byHost.get(hostname) ||
      null;

    try {
      if (!equipo) {
        if (!mac) {
          summary.sin_mac += 1;
          summary.detalle.push({ hostname, motivo: 'SIN_MAC' });
          continue;
        }

        const lab = requestedLab || labForIp(device.ip_address, labs);
        if (!lab) {
          summary.sin_laboratorio += 1;
          summary.detalle.push({ hostname, ip: device.ip_address, motivo: 'SIN_LABORATORIO' });
          continue;
        }

        const created = await Equipo.create({
          mac_address: mac,
          hostname,
          ip_address: normalizeIp(device.ip_address),
          laboratorio_id: lab.id,
          estado: device.estado || 'DESCONOCIDO',
          mesh_agent_id: device.nodeid || null,
          ultimo_reporte: device.ultimo_reporte ? new Date(device.ultimo_reporte) : null,
        });

        equipo = created;
        summary.creados += 1;
        byMac.set(mac, created);
        byHost.set(hostname, created);
        if (device.nodeid) byNode.set(device.nodeid, created);
        continue;
      }

      const macOwner = mac ? byMac.get(mac) : null;
      if (macOwner && macOwner.id !== equipo.id) {
        summary.errores += 1;
        summary.detalle.push({ hostname, motivo: 'MAC_EN_OTRO_EQUIPO', mac });
        continue;
      }

      const changes = applyDeviceChanges(equipo, device);
      if (Object.keys(changes).length > 0) {
        await equipo.update(changes);
        summary.actualizados += 1;
      }
    } catch (err) {
      summary.errores += 1;
      summary.detalle.push({ hostname, motivo: err.code || 'ERROR_SYNC', error: err.message });
      logger.error('No se pudo sincronizar un equipo con MeshCentral', {
        hostname,
        error: err.message,
      });
    }
  }

  if (summary.detalle.length > 50) {
    summary.detalle = summary.detalle.slice(0, 50);
  }

  // Las corridas automaticas sin cambios no generan ruido en la auditoria.
  if (!(background && summary.creados === 0 && summary.actualizados === 0)) {
    await recordAuditEvent(req, {
      accion: 'ACTUALIZAR',
      entidad: 'equipo',
      entidadId: null,
      detalle: {
        operacion: 'SINCRONIZAR',
        origen: background ? 'SISTEMA' : 'USUARIO',
        automatico: background,
        source: 'MESHCENTRAL',
      laboratorio_id: requestedLab ? requestedLab.id : null,
      creados: summary.creados,
      actualizados: summary.actualizados,
      total: summary.total,
      sin_laboratorio: summary.sin_laboratorio,
        sin_mac: summary.sin_mac,
        errores: summary.errores,
      },
    });
  }

  return summary;
}

async function sync(req) {
  const laboratorioId = req && req.body ? req.body.laboratorio_id : null;
  return syncFromMesh(req, { laboratorioId: laboratorioId || null, background: false });
}

async function refresh(req, id) {
  const equipo = await Equipo.findByPk(id);
  if (!equipo) throw httpError(404, 'Equipo no encontrado.', 'EQUIPO_NO_ENCONTRADO');

  const state = await loadMeshDevices();

  if (state.error || !state.devices) {
    await equipo.update({ estado: 'DESCONOCIDO' });
    await recordAuditEvent(req, {
      accion: 'ACTUALIZAR',
      entidad: 'equipo',
      entidadId: equipo.id,
      detalle: {
        source: 'MESHCENTRAL',
        refresh: true,
        error: state.error ? state.error.message : 'MESH_NO_CONFIGURADO',
        estado: 'DESCONOCIDO',
      },
    });

    const rows = await fetchLocalRows(req, id);
    const merged = await mergeMesh(rows, state);
    return { ...merged[0], mesh_encontrado: false };
  }

  const { byNode, byMac, byHost } = buildMeshIndex(state.devices);
  const device =
    (equipo.mesh_agent_id && byNode.get(equipo.mesh_agent_id)) ||
    (equipo.mac_address && byMac.get(normalizeMac(equipo.mac_address))) ||
    byHost.get(normalizeHostname(equipo.hostname)) ||
    null;

  if (!device) {
    await equipo.update({ estado: 'DESCONOCIDO' });
    await recordAuditEvent(req, {
      accion: 'ACTUALIZAR',
      entidad: 'equipo',
      entidadId: equipo.id,
      detalle: { source: 'MESHCENTRAL', refresh: true, encontrado: false },
    });

    const rows = await fetchLocalRows(req, id);
    const merged = await mergeMesh(rows, state);
    return { ...merged[0], mesh_encontrado: false };
  }

  const changes = applyDeviceChanges(equipo, device);
  if (Object.keys(changes).length > 0) {
    await equipo.update(changes);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'equipo',
    entidadId: equipo.id,
    detalle: {
      source: 'MESHCENTRAL',
      refresh: true,
      encontrado: true,
      campos: Object.keys(changes),
    },
  });

  const rows = await fetchLocalRows(req, id);
  const merged = await mergeMesh(rows, state);
  return { ...merged[0], mesh_encontrado: true };
}

module.exports = {
  list,
  get,
  create,
  update,
  sync,
  syncFromMesh,
  refresh,
  // Exportadas para pruebas y reutilización interna.
  normalizeMac,
  ipInCidr,
  labForIp,
};
