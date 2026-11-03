const { QueryTypes } = require('sequelize');
const { sequelize, Usuario, SesionWeb } = require('../../models');
const { recordAuditEvent, recordAuthEvent } = require('../audit/audit.service');
const ldap = require('../auth/ldap.service');
const logger = require('../../utils/logger');
const { ROLES } = require('./users.validators');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_ATTRIBUTES = [
  'id',
  'uid',
  'email',
  'nombre_completo',
  'rol',
  'activo',
  'ultimo_login',
  'created_at',
  'updated_at',
];

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function assertValidId(id) {
  if (!UUID_PATTERN.test(String(id || ''))) {
    throw httpError(400, 'Identificador de usuario inválido.', 'ID_INVALIDO');
  }
}

function normalizeUid(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeNombre(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function toPublic(user) {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    nombre_completo: user.nombre_completo,
    rol: user.rol,
    activo: Boolean(user.activo),
    ultimo_login: user.ultimo_login || null,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
  };
}

function translateLdapError(err) {
  if (err.status) return err;

  const code = err.code;
  if (code === 'LDAP_SERVICE_UNAVAILABLE') {
    return httpError(503, 'El servicio de directorio no está disponible.', code);
  }
  if (code === 'ENTRY_ALREADY_EXISTS') {
    return httpError(409, 'La cuenta ya existe en Samba AD.', code);
  }
  if (code === 'NOT_FOUND') {
    return httpError(404, 'La cuenta no existe en Samba AD.', code);
  }
  if (code === 'INSUFFICIENT_ACCESS') {
    return httpError(502, 'Samba AD rechazó la operación por permisos insuficientes.', code);
  }
  if (code === 'LDAP_CONSTRAINT' || code === 'LDAP_UNWILLING') {
    return httpError(
      400,
      'Samba AD rechazó los datos enviados. Revise el nombre y la contraseña.',
      code,
    );
  }

  return httpError(502, 'No se pudo sincronizar con Samba AD.', code || 'LDAP_ERROR');
}

function translateDbError(err, fallbackMessage) {
  if (err.status) return err;

  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors && err.errors[0] ? err.errors[0].path : '';
    if (field === 'email') {
      return httpError(409, 'El correo ya está registrado.', 'EMAIL_DUPLICADO');
    }
    return httpError(409, 'El identificador de usuario ya está registrado.', 'UID_DUPLICADO');
  }

  return httpError(500, fallbackMessage || 'No se pudo guardar el usuario.', 'DB_ERROR');
}

/**
 * RN-017: el docente solo puede consultar estudiantes de sus grupos.
 */
async function ensureActorCanRead(req, userId) {
  if (req.user.rol !== 'DOCENTE') return;

  const rows = await sequelize.query(
    `
    SELECT 1
      FROM usuario u
      JOIN membresia_grupo m
        ON m.usuario_id = u.id
       AND m.activa = TRUE
      JOIN asignacion_docente a
        ON a.grupo_id = m.grupo_id
     WHERE u.id = :userId
       AND u.rol = 'ESTUDIANTE'
       AND a.docente_id = :docenteId
     LIMIT 1
    `,
    {
      replacements: { userId, docenteId: req.user.id },
      type: QueryTypes.SELECT,
    },
  );

  if (rows.length === 0) {
    await recordAuthEvent(req, {
      usuarioId: req.user.id,
      uid: req.user.uid,
      rol: req.user.rol,
      accion: 'ACCESO_DENEGADO',
      resultado: 'FALLO',
      detalle: {
        motivo: 'USUARIO_FUERA_DE_SUS_GRUPOS',
        usuario_objetivo: userId,
        ruta: req.originalUrl,
      },
    });
    throw httpError(403, 'Acceso denegado', 'ACCESO_DENEGADO');
  }
}

async function list(req) {
  // Docente: solo estudiantes de los grupos que tiene asignados (RN-017).
  if (req.user.rol === 'DOCENTE') {
    return sequelize.query(
      `
      SELECT DISTINCT
             u.id,
             u.uid,
             u.email,
             u.nombre_completo,
             u.rol,
             u.activo,
             u.ultimo_login,
             u.created_at
        FROM usuario u
        JOIN membresia_grupo m
          ON m.usuario_id = u.id
         AND m.activa = TRUE
        JOIN asignacion_docente a
          ON a.grupo_id = m.grupo_id
       WHERE a.docente_id = :docenteId
         AND u.rol = 'ESTUDIANTE'
       ORDER BY u.nombre_completo ASC
      `,
      {
        replacements: { docenteId: req.user.id },
        type: QueryTypes.SELECT,
      },
    );
  }

  const users = await Usuario.findAll({
    attributes: PUBLIC_ATTRIBUTES,
    order: [['nombre_completo', 'ASC']],
  });
  return users.map(toPublic);
}

async function get(req, id) {
  assertValidId(id);
  await ensureActorCanRead(req, id);

  const user = await Usuario.findByPk(id, { attributes: PUBLIC_ATTRIBUTES });
  if (!user) {
    throw httpError(404, 'Usuario no encontrado.', 'USUARIO_NO_ENCONTRADO');
  }

  return toPublic(user);
}

async function assertNoDuplicates({ uid, email, excludeId = null, excludeDn = null }) {
  if (uid) {
    const existing = await Usuario.findOne({ where: { uid } });
    if (existing && existing.id !== excludeId) {
      throw httpError(409, 'El identificador de usuario ya está registrado.', 'UID_DUPLICADO');
    }

    const ad = await ldap.findUserByUid(uid);
    if (ad && ad.dn !== excludeDn) {
      throw httpError(
        409,
        'El identificador de usuario ya existe en Samba AD.',
        'UID_DUPLICADO_AD',
      );
    }
  }

  if (email) {
    const existing = await Usuario.findOne({ where: { email } });
    if (existing && existing.id !== excludeId) {
      throw httpError(409, 'El correo ya está registrado.', 'EMAIL_DUPLICADO');
    }

    const ad = await ldap.findUserByEmail(email);
    if (ad && ad.dn !== excludeDn) {
      throw httpError(409, 'El correo ya existe en Samba AD.', 'EMAIL_DUPLICADO_AD');
    }
  }
}

/**
 * CA-01/CA-03/CA-04: crea primero en Samba AD y luego en PostgreSQL.
 * Si la escritura en BD falla, elimina la cuenta del directorio.
 */
async function create(req, payload) {
  const uid = normalizeUid(payload.uid);
  const email = normalizeEmail(payload.email);
  const nombre = normalizeNombre(payload.nombre_completo);
  const rol = String(payload.rol || '').trim();

  if (!ROLES.includes(rol)) {
    throw httpError(400, 'Rol inválido.', 'ROL_INVALIDO');
  }

  let ldapUser;
  try {
    await assertNoDuplicates({ uid, email });
    ldapUser = await ldap.createUser({
      uid,
      nombre,
      email,
      password: payload.password,
    });
  } catch (err) {
    throw translateLdapError(err);
  }

  let user;
  try {
    user = await Usuario.create({
      uid,
      email,
      nombre_completo: nombre,
      rol,
      activo: true,
      samba_sid: ldapUser.sid,
      samba_dn: ldapUser.dn,
    });
  } catch (err) {
    // Compensación: no dejar una cuenta huérfana en Samba AD.
    try {
      await ldap.deleteUser(ldapUser.dn);
    } catch (cleanupError) {
      logger.error('No se pudo revertir la cuenta creada en Samba AD', {
        dn: ldapUser.dn,
        error: cleanupError.message,
      });
    }
    throw translateDbError(err, 'No se pudo registrar el usuario en la base de datos.');
  }

  await recordAuditEvent(req, {
    accion: 'CREAR',
    entidad: 'usuario',
    entidadId: user.id,
    detalle: { uid, email, rol, samba_dn: ldapUser.dn },
  });

  return toPublic(user);
}

/**
 * CA-01/CA-04: sincroniza metadatos, estado y contraseña con Samba AD.
 * El uid es inmutable para no romper el DN ni las referencias existentes.
 */
async function update(req, id, payload) {
  assertValidId(id);
  const user = await Usuario.findByPk(id);
  if (!user) {
    throw httpError(404, 'Usuario no encontrado.', 'USUARIO_NO_ENCONTRADO');
  }

  if (payload.uid !== undefined && normalizeUid(payload.uid) !== user.uid) {
    throw httpError(
      400,
      'El identificador de usuario no se puede modificar.',
      'UID_INMUTABLE',
    );
  }

  const changes = {};
  let nombre = null;
  let email = null;
  let password = null;
  let enabled;

  if (payload.nombre_completo !== undefined) {
    const normalized = normalizeNombre(payload.nombre_completo);
    if (normalized !== user.nombre_completo) {
      changes.nombre_completo = normalized;
      nombre = normalized;
    }
  }

  if (payload.email !== undefined) {
    const normalized = normalizeEmail(payload.email);
    if (normalized !== user.email) {
      changes.email = normalized;
      email = normalized;
    }
  }

  if (payload.rol !== undefined && payload.rol !== user.rol) {
    if (!ROLES.includes(payload.rol)) {
      throw httpError(400, 'Rol inválido.', 'ROL_INVALIDO');
    }
    changes.rol = payload.rol;
  }

  if (payload.activo !== undefined && Boolean(payload.activo) !== Boolean(user.activo)) {
    changes.activo = Boolean(payload.activo);
    enabled = changes.activo;
  }

  if (payload.password !== undefined && payload.password !== null && payload.password !== '') {
    password = payload.password;
  }

  if (Object.keys(changes).length === 0 && !password) {
    return toPublic(user);
  }

  const previous = {
    nombre_completo: user.nombre_completo,
    email: user.email,
    activo: user.activo,
  };

  try {
    if (email) {
      await assertNoDuplicates({ email, excludeId: user.id, excludeDn: user.samba_dn });
    }
    await ldap.updateUser(user.samba_dn, {
      nombre,
      email,
      password,
      enabled,
    });
  } catch (err) {
    throw translateLdapError(err);
  }

  try {
    await user.update(changes);
  } catch (err) {
    // Compensación best-effort del directorio.
    try {
      await ldap.updateUser(user.samba_dn, {
        nombre: previous.nombre_completo,
        email: previous.email,
        enabled: previous.activo,
      });
    } catch (rollbackError) {
      logger.error('No se pudo revertir la actualización en Samba AD', {
        dn: user.samba_dn,
        error: rollbackError.message,
      });
    }
    throw translateDbError(err, 'No se pudo actualizar el usuario.');
  }

  // CA-14 de HU-COM-14: al desactivar, cerrar sesiones activas.
  if (changes.activo === false) {
    await SesionWeb.update(
      { revocada_en: new Date(), motivo_revocacion: 'USUARIO_DESACTIVADO' },
      { where: { usuario_id: user.id, revocada_en: null } },
    );
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'usuario',
    entidadId: user.id,
    detalle: {
      campos: Object.keys(changes),
      cambio_password: Boolean(password),
      anterior: {
        nombre_completo: previous.nombre_completo,
        email: previous.email,
        activo: previous.activo,
      },
      actual: {
        nombre_completo: user.nombre_completo,
        email: user.email,
        rol: user.rol,
        activo: Boolean(user.activo),
      },
    },
  });

  return toPublic(user);
}

async function setStatus(req, id, activo) {
  return update(req, id, { activo });
}

module.exports = {
  list,
  get,
  create,
  update,
  setStatus,
};
