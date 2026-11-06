const crypto = require('crypto');
const { Op } = require('sequelize');
const env = require('../../config/env');
const { Usuario, SesionWeb } = require('../../models');
const { getPermissions, isWebRole } = require('../../config/permissions');
const { sign } = require('../../utils/jwt');
const { clientIp, userAgent } = require('../../utils/request');
const { recordAuthEvent } = require('../audit/audit.service');
const ldap = require('./ldap.service');

function authError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function findUserByUid(uid) {
  return Usuario.findOne({
    where: {
      uid: { [Op.iLike]: uid },
    },
  });
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function isLocked(user, now) {
  return Boolean(user.bloqueado_hasta && new Date(user.bloqueado_hasta) > now);
}

async function registerFailedAttempt(user, now) {
  if (!user) return;

  const attempts = Number(user.intentos_fallidos || 0) + 1;
  const update = { intentos_fallidos: attempts };

  if (attempts >= env.authMaxAttempts) {
    update.bloqueado_hasta = addMinutes(now, env.authLockMinutes);
    update.intentos_fallidos = 0;
  }

  await user.update(update);
}

/**
 * Login web (HU-COM-14).
 * 1. Verifica bloqueo temporal.
 * 2. Valida credenciales contra Samba AD (LDAPS).
 * 3. Exige usuario registrado, activo y con rol web habilitado.
 * 4. Crea sesión revocable y firma JWT con uid, rol y permisos.
 */
async function login({ uid, password }, req) {
  const loginUid = String(uid || '').trim();
  const now = new Date();
  const user = await findUserByUid(loginUid);

  // CA-09: bloqueo tras N intentos fallidos.
  if (user && isLocked(user, now)) {
    await recordAuthEvent(req, {
      usuarioId: user.id,
      uid: loginUid,
      rol: user.rol,
      accion: 'LOGIN_BLOQUEADO',
      resultado: 'FALLO',
      detalle: {
        motivo: 'BLOQUEO_TEMPORAL',
        bloqueado_hasta: user.bloqueado_hasta,
      },
    });
    throw authError(
      401,
      'No se pudo iniciar sesión. Verifique sus credenciales o intente más tarde.',
      'CUENTA_BLOQUEADA',
    );
  }

  let ldapUser;
  try {
    ldapUser = await ldap.authenticate(loginUid, password);
  } catch (err) {
    if (err.code === 'LDAP_SERVICE_UNAVAILABLE') {
      await recordAuthEvent(req, {
        usuarioId: user ? user.id : null,
        uid: loginUid,
        rol: user ? user.rol : null,
        accion: 'AUTH_NO_DISPONIBLE',
        resultado: 'FALLO',
        detalle: { motivo: 'LDAP_SERVICE_UNAVAILABLE' },
      });
      throw authError(
        503,
        'Servicio de autenticación no disponible. Intente más tarde.',
        'AUTH_NO_DISPONIBLE',
      );
    }

    // CA-09: mensaje genérico, sin revelar si el usuario existe.
    await registerFailedAttempt(user, now);
    await recordAuthEvent(req, {
      usuarioId: user ? user.id : null,
      uid: loginUid,
      rol: user ? user.rol : null,
      accion: 'LOGIN_FALLIDO',
      resultado: 'FALLO',
      detalle: { motivo: err.code || 'CREDENCIALES_INVALIDAS' },
    });
    throw authError(401, 'Usuario o contraseña incorrectos', 'CREDENCIALES_INVALIDAS');
  }

  // CA-14: usuario sin registro/rol en la plataforma.
  if (!user) {
    await recordAuthEvent(req, {
      usuarioId: null,
      uid: loginUid,
      rol: null,
      accion: 'SIN_ROL',
      resultado: 'FALLO',
      detalle: { motivo: 'USUARIO_NO_REGISTRADO_EN_BD' },
    });
    throw authError(403, 'No tiene acceso a la plataforma web.', 'SIN_ACCESO');
  }

  if (!user.activo) {
    await recordAuthEvent(req, {
      usuarioId: user.id,
      uid: user.uid,
      rol: user.rol,
      accion: 'USUARIO_INACTIVO',
      resultado: 'FALLO',
    });
    throw authError(403, 'Su cuenta está inactiva. Contacte al administrador.', 'USUARIO_INACTIVO');
  }

  // CA-04: solo Admin Académico, Admin Técnico y Docente.
  if (!isWebRole(user.rol)) {
    await recordAuthEvent(req, {
      usuarioId: user.id,
      uid: user.uid,
      rol: user.rol,
      accion: 'ROL_NO_HABILITADO',
      resultado: 'FALLO',
      detalle: { motivo: 'ROL_SIN_ACCESO_WEB' },
    });
    throw authError(403, 'Su rol no tiene acceso al panel web.', 'ROL_NO_HABILITADO');
  }

  // Defensa extra: el DN del AD debe coincidir con el registrado en la BD.
  if (user.samba_dn && ldapUser.dn && user.samba_dn.toLowerCase() !== ldapUser.dn.toLowerCase()) {
    await recordAuthEvent(req, {
      usuarioId: user.id,
      uid: user.uid,
      rol: user.rol,
      accion: 'LOGIN_FALLIDO',
      resultado: 'FALLO',
      detalle: { motivo: 'DN_NO_COINCIDE' },
    });
    throw authError(403, 'No tiene acceso a la plataforma web.', 'SIN_ACCESO');
  }

  await user.update({
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    ultimo_login: now,
  });

  const permisos = getPermissions(user.rol);
  const jti = crypto.randomUUID();
  const expiraEn = new Date(now.getTime() + env.jwtExpiresMs);

  const session = await SesionWeb.create({
    jti,
    usuario_id: user.id,
    rol: user.rol,
    ip_origen: clientIp(req),
    user_agent: userAgent(req),
    creada_en: now,
    ultima_actividad: now,
    expira_en: expiraEn,
  });

  const token = sign({
    sub: user.uid,
    uid: user.uid,
    nombre: user.nombre_completo,
    email: user.email,
    rol: user.rol,
    permisos,
    jti,
  });

  await recordAuthEvent(req, {
    usuarioId: user.id,
    uid: user.uid,
    rol: user.rol,
    accion: 'LOGIN',
    resultado: 'EXITO',
    detalle: { jti },
  });

  return {
    token,
    user: {
      id: user.id,
      uid: user.uid,
      nombre: user.nombre_completo,
      email: user.email,
      rol: user.rol,
    },
    permissions: permisos,
    session: {
      id: session.id,
      jti,
      expiresAt: expiraEn.toISOString(),
      idleMinutes: env.sessionIdleMinutes,
    },
  };
}

async function logout(req) {
  if (req.session && !req.session.revocada_en) {
    await req.session.update({
      revocada_en: new Date(),
      motivo_revocacion: 'LOGOUT',
    });
  }

  await recordAuthEvent(req, {
    usuarioId: req.user.id,
    uid: req.user.uid,
    rol: req.user.rol,
    accion: 'LOGOUT',
    resultado: 'EXITO',
    detalle: { jti: req.user.jti },
  });

  return { ok: true };
}

function me(req) {
  return {
    user: {
      id: req.user.id,
      uid: req.user.uid,
      nombre: req.user.nombre,
      email: req.user.email,
      rol: req.user.rol,
    },
    permissions: req.user.permisos,
    session: {
      jti: req.user.jti,
      expiresAt: req.session.expira_en,
      idleMinutes: env.sessionIdleMinutes,
    },
  };
}

function heartbeat(req) {
  return {
    ok: true,
    session: {
      jti: req.user.jti,
      expiresAt: req.session.expira_en,
      idleMinutes: env.sessionIdleMinutes,
    },
  };
}

module.exports = { login, logout, me, heartbeat };
