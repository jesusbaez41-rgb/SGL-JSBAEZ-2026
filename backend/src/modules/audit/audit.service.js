const { EventoAutenticacion, Auditoria } = require('../../models');
const { clientIp, userAgent } = require('../../utils/request');
const logger = require('../../utils/logger');

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
 * La tabla es inmutable (trigger de BD) y exige un usuario existente.
 */
async function recordAuditEvent(req, { accion, entidad, entidadId = null, detalle = null }) {
  try {
    if (!req || !req.user || !req.user.id) {
      logger.error('Auditoría sin usuario actor', { accion, entidad, entidadId });
      return;
    }

    await Auditoria.create({
      usuario_id: req.user.id,
      accion,
      entidad_afectada: entidad,
      entidad_id: entidadId,
      detalle,
      ip_origen: clientIp(req),
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

module.exports = { recordAuthEvent, recordAuditEvent, listAuthEvents };
