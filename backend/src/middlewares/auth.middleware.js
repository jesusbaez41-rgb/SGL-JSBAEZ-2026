const { verify } = require('../utils/jwt');
const env = require('../config/env');
const { Usuario, SesionWeb } = require('../models');
const { getPermissions, isWebRole } = require('../config/permissions');
const { recordAuthEvent } = require('../modules/audit/audit.service');

function unauthorized(res, message, code) {
  return res.status(401).json({ error: message, code });
}

/**
 * HU-COM-14 / CA-13:
 * - Valida firma y expiración del JWT.
 * - Comprueba que la sesión siga activa en BD (CA-10).
 * - Aplica expiración por inactividad (CA-11).
 * - Rechaza usuarios inactivos o con rol no habilitado (CA-14).
 */
module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return unauthorized(res, 'Token requerido', 'TOKEN_REQUERIDO');
  }

  let payload;
  try {
    payload = verify(token);
  } catch {
    return unauthorized(res, 'Token inválido o expirado', 'TOKEN_INVALIDO');
  }

  if (!payload.jti) {
    return unauthorized(res, 'Token inválido', 'TOKEN_INVALIDO');
  }

  try {
    const session = await SesionWeb.findOne({ where: { jti: payload.jti } });
    if (!session) {
      return unauthorized(res, 'Sesión inválida', 'SESION_INVALIDA');
    }

    const now = new Date();

    // CA-10: logout o revocación explícita.
    if (session.revocada_en) {
      return unauthorized(res, 'Sesión cerrada', 'SESION_REVOCADA');
    }

    // CA-03: expiración absoluta del token.
    if (new Date(session.expira_en) <= now) {
      await session.update({ revocada_en: now, motivo_revocacion: 'EXPIRACION' });
      await recordAuthEvent(req, {
        usuarioId: session.usuario_id,
        uid: payload.uid || payload.sub,
        rol: payload.rol,
        accion: 'SESION_EXPIRADA',
        resultado: 'FALLO',
        detalle: { motivo: 'EXPIRACION_ABSOLUTA', jti: payload.jti },
      });
      return unauthorized(res, 'Sesión expirada', 'SESION_EXPIRADA');
    }

    // CA-11: expiración por inactividad.
    const idleMs = env.sessionIdleMinutes * 60000;
    const lastActivity = new Date(session.ultima_actividad).getTime();
    if (now.getTime() - lastActivity > idleMs) {
      await session.update({ revocada_en: now, motivo_revocacion: 'INACTIVIDAD' });
      await recordAuthEvent(req, {
        usuarioId: session.usuario_id,
        uid: payload.uid || payload.sub,
        rol: payload.rol,
        accion: 'SESION_EXPIRADA',
        resultado: 'FALLO',
        detalle: { motivo: 'INACTIVIDAD', jti: payload.jti },
      });
      return unauthorized(res, 'Sesión expirada por inactividad', 'SESION_EXPIRADA');
    }

    const user = await Usuario.findByPk(session.usuario_id);
    if (!user) {
      await session.update({ revocada_en: now, motivo_revocacion: 'USUARIO_ELIMINADO' });
      return unauthorized(res, 'Sesión inválida', 'SESION_INVALIDA');
    }

    // CA-14: usuario desactivado después del login.
    if (!user.activo) {
      await session.update({ revocada_en: now, motivo_revocacion: 'USUARIO_INACTIVO' });
      await recordAuthEvent(req, {
        usuarioId: user.id,
        uid: user.uid,
        rol: user.rol,
        accion: 'USUARIO_INACTIVO',
        resultado: 'FALLO',
        detalle: { jti: payload.jti, motivo: 'DESACTIVADO_EN_SESION' },
      });
      return res.status(403).json({
        error: 'Su cuenta está inactiva. Contacte al administrador.',
        code: 'USUARIO_INACTIVO',
      });
    }

    // CA-04/CA-14: rol retirado o no habilitado para el panel web.
    if (!isWebRole(user.rol)) {
      await session.update({ revocada_en: now, motivo_revocacion: 'ROL_NO_HABILITADO' });
      await recordAuthEvent(req, {
        usuarioId: user.id,
        uid: user.uid,
        rol: user.rol,
        accion: 'ROL_NO_HABILITADO',
        resultado: 'FALLO',
        detalle: { jti: payload.jti, motivo: 'ROL_CAMBIADO' },
      });
      return res.status(403).json({
        error: 'Su rol no tiene acceso al panel web.',
        code: 'ROL_NO_HABILITADO',
      });
    }

    // Renovar actividad como máximo una vez por minuto para no saturar la BD.
    if (now.getTime() - lastActivity > 60000) {
      await session.update({ ultima_actividad: now });
    }

    req.user = {
      id: user.id,
      uid: user.uid,
      nombre: user.nombre_completo,
      email: user.email,
      rol: user.rol,
      permisos: getPermissions(user.rol),
      jti: payload.jti,
    };
    req.session = session;

    return next();
  } catch (err) {
    return next(err);
  }
};
