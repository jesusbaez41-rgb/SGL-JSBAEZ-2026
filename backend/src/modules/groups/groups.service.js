const { Op } = require('sequelize');
const {
  Grupo,
  Usuario,
  MembresiaGrupo,
  AsignacionDocente,
} = require('../../models');
const { recordAuditEvent } = require('../audit/audit.service');
const ldap = require('../auth/ldap.service');
const logger = require('../../utils/logger');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_USER_ATTRIBUTES = ['id', 'uid', 'email', 'nombre_completo', 'rol', 'activo'];
const USER_ATTRIBUTES = [...PUBLIC_USER_ATTRIBUTES, 'samba_dn'];

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function assertValidId(id) {
  if (!UUID_PATTERN.test(String(id || ''))) {
    throw httpError(400, 'Identificador inválido.', 'ID_INVALIDO');
  }
}

function normalizeCodigo(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDescripcion(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function toPublicUser(user) {
  if (!user) return null;
  const data = user.toJSON ? user.toJSON() : user;
  return {
    id: data.id,
    uid: data.uid,
    email: data.email,
    nombre_completo: data.nombre_completo,
    rol: data.rol,
    activo: Boolean(data.activo),
  };
}

function toGroupSummary(group, counts = {}) {
  const data = group.toJSON ? group.toJSON() : group;
  return {
    id: data.id,
    codigo: data.codigo,
    descripcion: data.descripcion || null,
    samba_sid: data.samba_sid || null,
    samba_dn: data.samba_dn || null,
    created_at: data.created_at || null,
    estudiantes: counts.estudiantes || 0,
    docentes: counts.docentes || 0,
  };
}

function translateLdapError(err) {
  if (err.status) return err;

  const code = err.code;
  if (code === 'LDAP_SERVICE_UNAVAILABLE') {
    return httpError(503, 'El servicio de directorio no está disponible.', code);
  }
  if (code === 'ENTRY_ALREADY_EXISTS') {
    return httpError(409, 'El grupo ya existe en Samba AD.', 'CODIGO_DUPLICADO_AD');
  }
  if (code === 'NOT_FOUND') {
    return httpError(404, 'El grupo no existe en Samba AD.', code);
  }
  if (code === 'INSUFFICIENT_ACCESS') {
    return httpError(502, 'Samba AD rechazó la operación por permisos insuficientes.', code);
  }
  if (code === 'LDAP_CONSTRAINT' || code === 'LDAP_UNWILLING') {
    return httpError(400, 'Samba AD rechazó los datos enviados.', code);
  }

  return httpError(502, 'No se pudo sincronizar con Samba AD.', code || 'LDAP_ERROR');
}

function translateDbError(err) {
  if (err.status) return err;

  if (err.name === 'SequelizeUniqueConstraintError') {
    return httpError(409, 'El código del grupo ya está registrado.', 'CODIGO_DUPLICADO');
  }

  return httpError(500, 'No se pudo guardar el grupo.', 'DB_ERROR');
}

async function findGroupOrThrow(id) {
  assertValidId(id);
  const group = await Grupo.findByPk(id);
  if (!group) throw httpError(404, 'Grupo no encontrado.', 'GRUPO_NO_ENCONTRADO');
  return group;
}

async function findUserOrThrow(id) {
  assertValidId(id);
  const user = await Usuario.findByPk(id, { attributes: USER_ATTRIBUTES });
  if (!user) throw httpError(404, 'Usuario no encontrado.', 'USUARIO_NO_ENCONTRADO');
  return user;
}

async function countsFor(grupoId) {
  const [estudiantes, docentes] = await Promise.all([
    MembresiaGrupo.count({ where: { grupo_id: grupoId, activa: true } }),
    AsignacionDocente.count({ where: { grupo_id: grupoId } }),
  ]);
  return { estudiantes, docentes };
}

async function assertNoDuplicateCode(codigo) {
  const existing = await Grupo.findOne({ where: { codigo } });
  if (existing) {
    throw httpError(409, 'El código del grupo ya está registrado.', 'CODIGO_DUPLICADO');
  }

  let adGroup;
  try {
    adGroup = await ldap.findGroupByCode(codigo);
  } catch (err) {
    throw translateLdapError(err);
  }

  if (adGroup) {
    throw httpError(409, 'El código del grupo ya existe en Samba AD.', 'CODIGO_DUPLICADO_AD');
  }
}

async function ensureActorCanRead(req, group) {
  if (!req.user || req.user.rol !== 'DOCENTE') return;

  const assignment = await AsignacionDocente.findOne({
    where: { docente_id: req.user.id, grupo_id: group.id },
  });
  if (!assignment) {
    throw httpError(403, 'No tiene acceso a este grupo.', 'ACCESO_DENEGADO');
  }
}

async function list(req) {
  let where = {};

  // RN-017: el docente solo ve los grupos que tiene asignados.
  if (req.user && req.user.rol === 'DOCENTE') {
    const assignments = await AsignacionDocente.findAll({
      where: { docente_id: req.user.id },
      attributes: ['grupo_id'],
    });
    const ids = assignments.map((assignment) => assignment.grupo_id);
    if (ids.length === 0) return [];
    where = { id: { [Op.in]: ids } };
  }

  const groups = await Grupo.findAll({ where, order: [['codigo', 'ASC']] });

  return Promise.all(
    groups.map(async (group) => {
      const counts = await countsFor(group.id);
      return toGroupSummary(group, counts);
    }),
  );
}

async function get(req, id) {
  const group = await findGroupOrThrow(id);
  await ensureActorCanRead(req, group);

  const memberships = await MembresiaGrupo.findAll({
    where: { grupo_id: group.id, activa: true },
    include: [
      {
        model: Usuario,
        as: 'usuario',
        attributes: PUBLIC_USER_ATTRIBUTES,
      },
    ],
    order: [['fecha_asignacion', 'ASC']],
  });

  const assignments = await AsignacionDocente.findAll({
    where: { grupo_id: group.id },
    include: [
      {
        model: Usuario,
        as: 'docente',
        attributes: PUBLIC_USER_ATTRIBUTES,
      },
    ],
    order: [['fecha_asignacion', 'ASC']],
  });

  return {
    id: group.id,
    codigo: group.codigo,
    descripcion: group.descripcion || null,
    samba_sid: group.samba_sid || null,
    samba_dn: group.samba_dn || null,
    created_at: group.created_at || null,
    estudiantes: memberships
      .map((membership) => toPublicUser(membership.usuario))
      .filter(Boolean),
    docentes: assignments
      .map((assignment) => toPublicUser(assignment.docente))
      .filter(Boolean),
  };
}

async function create(req, payload) {
  const codigo = normalizeCodigo(payload.codigo);
  const descripcion = normalizeDescripcion(payload.descripcion);

  await assertNoDuplicateCode(codigo);

  let ldapGroup;
  try {
    ldapGroup = await ldap.createGroup({ codigo, descripcion });
  } catch (err) {
    throw translateLdapError(err);
  }

  let group;
  try {
    group = await Grupo.create({
      codigo,
      descripcion: descripcion || null,
      samba_sid: ldapGroup.sid,
      samba_dn: ldapGroup.dn,
    });
  } catch (err) {
    try {
      await ldap.deleteGroup(ldapGroup.dn);
    } catch (cleanupError) {
      logger.error('No se pudo revertir el grupo creado en Samba AD', {
        dn: ldapGroup.dn,
        error: cleanupError.message,
      });
    }
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'CREAR',
    entidad: 'grupo',
    entidadId: group.id,
    detalle: { codigo, descripcion, samba_dn: ldapGroup.dn },
  });

  return toGroupSummary(group, { estudiantes: 0, docentes: 0 });
}

async function update(req, id, payload) {
  const group = await findGroupOrThrow(id);

  if (payload.codigo !== undefined && normalizeCodigo(payload.codigo) !== group.codigo) {
    throw httpError(400, 'El código del grupo no se puede modificar.', 'CODIGO_INMUTABLE');
  }

  let descripcion;
  if (payload.descripcion !== undefined) {
    const normalized = normalizeDescripcion(payload.descripcion);
    if (normalized !== (group.descripcion || '')) {
      descripcion = normalized;
    }
  }

  if (descripcion === undefined) {
    return toGroupSummary(group, await countsFor(group.id));
  }

  const previous = group.descripcion || null;

  try {
    await ldap.updateGroup(group.samba_dn, { descripcion });
  } catch (err) {
    throw translateLdapError(err);
  }

  try {
    await group.update({ descripcion: descripcion || null });
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'grupo',
    entidadId: group.id,
    detalle: { campos: ['descripcion'], anterior: previous, actual: descripcion },
  });

  return toGroupSummary(group, await countsFor(group.id));
}

async function remove(req, id) {
  const group = await findGroupOrThrow(id);
  const counts = await countsFor(group.id);

  try {
    if (group.samba_dn) {
      await ldap.deleteGroup(group.samba_dn);
    }
  } catch (err) {
    throw translateLdapError(err);
  }

  try {
    await group.destroy();
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ELIMINAR',
    entidad: 'grupo',
    entidadId: id,
    detalle: {
      codigo: group.codigo,
      estudiantes_liberados: counts.estudiantes,
      docentes_liberados: counts.docentes,
      usuarios_conservados: true,
    },
  });

  return {
    id,
    codigo: group.codigo,
    deleted: true,
    estudiantes_liberados: counts.estudiantes,
    docentes_liberados: counts.docentes,
  };
}

async function addStudent(req, id, payload) {
  const group = await findGroupOrThrow(id);
  const user = await findUserOrThrow(payload.usuario_id);

  if (user.rol !== 'ESTUDIANTE') {
    throw httpError(
      400,
      'Solo los estudiantes pueden ser miembros de un grupo.',
      'SOLO_ESTUDIANTES',
    );
  }
  if (!group.samba_dn) {
    throw httpError(400, 'El grupo no tiene DN en Samba AD.', 'GRUPO_SIN_DN');
  }
  if (!user.samba_dn) {
    throw httpError(400, 'El estudiante no tiene DN en Samba AD.', 'USUARIO_SIN_DN');
  }

  const existing = await MembresiaGrupo.findOne({
    where: { usuario_id: user.id, grupo_id: group.id },
  });

  if (existing && existing.activa) {
    return { created: false, grupo: await get(req, group.id) };
  }

  try {
    await ldap.addGroupMember(group.samba_dn, user.samba_dn);
  } catch (err) {
    throw translateLdapError(err);
  }

  try {
    if (existing) {
      await existing.update({ activa: true, fecha_asignacion: new Date() });
    } else {
      await MembresiaGrupo.create({
        usuario_id: user.id,
        grupo_id: group.id,
        activa: true,
      });
    }
  } catch (err) {
    try {
      await ldap.removeGroupMember(group.samba_dn, user.samba_dn);
    } catch (cleanupError) {
      logger.error('No se pudo revertir la membresía en Samba AD', {
        groupDn: group.samba_dn,
        userDn: user.samba_dn,
        error: cleanupError.message,
      });
    }
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'grupo',
    entidadId: group.id,
    detalle: {
      accion: 'AGREGAR_ESTUDIANTE',
      usuario_id: user.id,
      uid: user.uid,
    },
  });

  return { created: true, grupo: await get(req, group.id) };
}

async function removeStudent(req, id, userId) {
  const group = await findGroupOrThrow(id);
  const user = await findUserOrThrow(userId);

  const membership = await MembresiaGrupo.findOne({
    where: { usuario_id: user.id, grupo_id: group.id, activa: true },
  });

  if (!membership) {
    return { removed: false, grupo: await get(req, group.id) };
  }

  if (group.samba_dn && user.samba_dn) {
    try {
      await ldap.removeGroupMember(group.samba_dn, user.samba_dn);
    } catch (err) {
      throw translateLdapError(err);
    }
  }

  try {
    await membership.update({ activa: false });
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'grupo',
    entidadId: group.id,
    detalle: {
      accion: 'REMOVER_ESTUDIANTE',
      usuario_id: user.id,
      uid: user.uid,
    },
  });

  return { removed: true, grupo: await get(req, group.id) };
}

async function addTeacher(req, id, payload) {
  const group = await findGroupOrThrow(id);
  const user = await findUserOrThrow(payload.usuario_id);

  if (user.rol !== 'DOCENTE') {
    throw httpError(
      400,
      'Solo los docentes pueden ser asignados para monitoreo.',
      'SOLO_DOCENTES',
    );
  }

  const existing = await AsignacionDocente.findOne({
    where: { docente_id: user.id, grupo_id: group.id },
  });

  if (existing) {
    return { created: false, grupo: await get(req, group.id) };
  }

  try {
    await AsignacionDocente.create({
      docente_id: user.id,
      grupo_id: group.id,
    });
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'grupo',
    entidadId: group.id,
    detalle: {
      accion: 'ASIGNAR_DOCENTE',
      usuario_id: user.id,
      uid: user.uid,
    },
  });

  return { created: true, grupo: await get(req, group.id) };
}

async function removeTeacher(req, id, userId) {
  const group = await findGroupOrThrow(id);
  const user = await findUserOrThrow(userId);

  const assignment = await AsignacionDocente.findOne({
    where: { docente_id: user.id, grupo_id: group.id },
  });

  if (!assignment) {
    return { removed: false, grupo: await get(req, group.id) };
  }

  try {
    await assignment.destroy();
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'grupo',
    entidadId: group.id,
    detalle: {
      accion: 'REMOVER_DOCENTE',
      usuario_id: user.id,
      uid: user.uid,
    },
  });

  return { removed: true, grupo: await get(req, group.id) };
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  addStudent,
  removeStudent,
  addTeacher,
  removeTeacher,
};
