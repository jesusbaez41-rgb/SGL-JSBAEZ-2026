const { recordAuthEvent } = require('../modules/audit/audit.service');

/**
 * HU-COM-14 / CA-08:
 * - Si falta el permiso, responde 403.
 * - Registra el acceso denegado con usuario, rol, IP y fecha (CA-12).
 */
function requirePermission(permission) {
  return async function rbacMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado', code: 'NO_AUTENTICADO' });
    }

    if (!req.user.permisos.includes(permission)) {
      await recordAuthEvent(req, {
        usuarioId: req.user.id,
        uid: req.user.uid,
        rol: req.user.rol,
        accion: 'ACCESO_DENEGADO',
        resultado: 'FALLO',
        detalle: {
          permiso_requerido: permission,
          metodo: req.method,
          ruta: req.originalUrl,
        },
      });
      return res.status(403).json({ error: 'Acceso denegado', code: 'ACCESO_DENEGADO' });
    }

    return next();
  };
}

function requireRole(...roles) {
  return async function roleMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado', code: 'NO_AUTENTICADO' });
    }

    if (!roles.includes(req.user.rol)) {
      await recordAuthEvent(req, {
        usuarioId: req.user.id,
        uid: req.user.uid,
        rol: req.user.rol,
        accion: 'ACCESO_DENEGADO',
        resultado: 'FALLO',
        detalle: {
          roles_requeridos: roles,
          metodo: req.method,
          ruta: req.originalUrl,
        },
      });
      return res.status(403).json({ error: 'Acceso denegado', code: 'ACCESO_DENEGADO' });
    }

    return next();
  };
}

module.exports = { requirePermission, requireRole };
