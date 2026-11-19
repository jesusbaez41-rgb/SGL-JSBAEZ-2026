const { Op } = require('sequelize');
const {
  EventoAutenticacion,
  Auditoria,
  Usuario,
  Laboratorio,
  Equipo,
  sequelize,
} = require('../../models');
const { clientIp, userAgent } = require('../../utils/request');
const logger = require('../../utils/logger');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value) {
  const text = String(value || '').trim();
  return UUID_PATTERN.test(text) ? text : null;
}

/**
 * Registra un evento de autenticación (HU-COM-14, CA-12).
 * Nunca debe romper el flujo principal: si falla la auditoría, se loguea el error.
 */
async function recordAuthEvent(req, { usuarioId = null, uid, rol = null, accion, resultado, detalle = null }) {
  try {
    await EventoAutenticacion.create({
      usuario_id: usuarioId,
      uid_intentado: String(uid || 'desconocido').slice(0, 64),
      rol: rol ? String(rol).slice(0, 32) : null,
      accion,
      resultado,
      ip_origen: clientIp(req),
      user_agent: userAgent(req),
      detalle,
    });
  } catch (err) {
    logger.error('No se pudo registrar evento de autenticación', {
      accion,
      uid,
      error: err.message,
    });
  }
}

/**
 * Registra una acción crítica de negocio en AUDITORIA (RN-010).
 * La tabla es inmutable (triggers de BD + rol de aplicación limitado).
 */
async function recordAuditEvent(req, {
  accion,
  entidad,
  entidadId = null,
  detalle = null,
  laboratorioId = null,
  equipoId = null,
}) {
  try {
    if (!req || !req.user || !req.user.id) {
      logger.error('Auditoría sin usuario actor', { accion, entidad, entidadId });
      return;
    }

    const data = detalle && typeof detalle === 'object' && !Array.isArray(detalle) ? detalle : {};
    const laboratorio =
      uuidOrNull(laboratorioId) ||
      uuidOrNull(data.laboratorio_id) ||
      (entidad === 'laboratorio' ? uuidOrNull(entidadId) : null);
    const equipo =
      uuidOrNull(equipoId) ||
      uuidOrNull(data.equipo_id) ||
      (entidad === 'equipo' ? uuidOrNull(entidadId) : null);

    await Auditoria.create({
      usuario_id: req.user.id,
      accion,
      entidad_afectada: entidad,
      entidad_id: entidadId,
      detalle,
      ip_origen: clientIp(req),
      laboratorio_id: laboratorio,
      equipo_id: equipo,
      inmutable: true,
    });
  } catch (err) {
    logger.error('No se pudo registrar la auditoría de negocio', {
      accion,
      entidad,
      entidadId,
      error: err.message,
    });
  }
}

async function listAuthEvents({ limit = 100, offset = 0 } = {}) {
  return EventoAutenticacion.findAll({
    attributes: [
      'id',
      'usuario_id',
      'uid_intentado',
      'rol',
      'accion',
      'resultado',
      'ip_origen',
      'detalle',
      'fecha_evento',
    ],
    order: [['fecha_evento', 'DESC']],
    limit,
    offset,
  });
}

/**
 * Consulta el registro de auditoría de acciones administrativas (HU-COM-12).
 *
 * Filtros disponibles: acción, entidad, usuario (uid o nombre), laboratorio,
 * equipo, rango de fechas y búsqueda libre en acción/entidad/detalle/usuario.
 */
async function listAuditLogs({
  limit = 50,
  offset = 0,
  accion,
  entidad,
  usuario,
  laboratorioId,
  equipoId,
  desde,
  hasta,
  q,
  excluirSincronizacion = false,
} = {}) {
  const filtros = [];

  if (accion) filtros.push({ accion });
  if (entidad) filtros.push({ entidad_afectada: entidad });
  if (laboratorioId) filtros.push({ laboratorio_id: laboratorioId });
  if (equipoId) filtros.push({ equipo_id: equipoId });

  if (desde || hasta) {
    const rango = {};
    if (desde) rango[Op.gte] = desde;
    if (hasta) rango[Op.lte] = hasta;
    filtros.push({ fecha_evento: rango });
  }

  if (usuario) {
    filtros.push({
      [Op.or]: [
        { '$usuario.uid$': { [Op.iLike]: '%' + usuario + '%' } },
        { '$usuario.nombre_completo$': { [Op.iLike]: '%' + usuario + '%' } },
      ],
    });
  }

  if (excluirSincronizacion) {
    filtros.push(
      sequelize.where(sequelize.cast(sequelize.col('Auditoria.detalle'), 'text'), {
        [Op.notILike]: '%SINCRONIZAR%',
      }),
    );
  }

  if (q) {
    filtros.push({
      [Op.or]: [
        { entidad_afectada: { [Op.iLike]: '%' + q + '%' } },
        { accion: { [Op.iLike]: '%' + q + '%' } },
        sequelize.where(sequelize.cast(sequelize.col('Auditoria.detalle'), 'text'), {
          [Op.iLike]: '%' + q + '%',
        }),
        { '$usuario.uid$': { [Op.iLike]: '%' + q + '%' } },
        { '$usuario.nombre_completo$': { [Op.iLike]: '%' + q + '%' } },
      ],
    });
  }

  const resultado = await Auditoria.findAndCountAll({
    where: filtros.length ? { [Op.and]: filtros } : {},
    include: [
      {
        model: Usuario,
        as: 'usuario',
        attributes: ['id', 'uid', 'nombre_completo', 'rol'],
      },
      {
        model: Laboratorio,
        as: 'laboratorio',
        attributes: ['id', 'nombre'],
      },
      {
        model: Equipo,
        as: 'equipo',
        attributes: ['id', 'hostname'],
      },
    ],
    order: [
      ['fecha_evento', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: resultado.rows,
    total: resultado.count,
    limit,
    offset,
  };
}

module.exports = {
  recordAuthEvent,
  recordAuditEvent,
  listAuthEvents,
  listAuditLogs,
};
