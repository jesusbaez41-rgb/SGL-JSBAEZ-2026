const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { Op } = require('sequelize');
const { createMocker } = require('./helpers/mock');
const {
  validateCreateGroup,
  validateUpdateGroup,
  validateMember,
  validateTeacher,
} = require('../src/modules/groups/groups.validators');

const GROUPS_SERVICE = path.join(__dirname, '../src/modules/groups/groups.service.js');

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GROUP_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID_2 = '22222222-2222-4222-8222-222222222222';
const TEACHER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';

function request(overrides = {}) {
  return {
    user: { id: ADMIN_ID, uid: 'aacademico', rol: 'ADMIN_ACADEMICO' },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    originalUrl: '/api/groups',
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    id: STUDENT_ID,
    uid: 'estudiante1',
    email: 'estudiante1@clockwork.local',
    nombre_completo: 'Estudiante Uno',
    rol: 'ESTUDIANTE',
    activo: true,
    samba_dn: 'CN=Estudiante Uno,CN=Users,DC=clockwork,DC=local',
    ...overrides,
  };
}

function makeGroup(overrides = {}) {
  return {
    id: GROUP_ID,
    codigo: 'GRP-1A',
    descripcion: 'Primer año A',
    samba_sid: 'S-1-5-21-1-2-3-1001',
    samba_dn: 'CN=GRP-1A,CN=Users,DC=clockwork,DC=local',
    created_at: new Date('2026-11-10T10:00:00.000Z'),
    updateCalls: [],
    destroyCalls: 0,
    async update(changes) {
      this.updateCalls.push(changes);
      Object.assign(this, changes);
      return this;
    },
    async destroy() {
      this.destroyCalls += 1;
      return true;
    },
    toJSON() {
      const { updateCalls, destroy, destroyCalls, ...plain } = this;
      return plain;
    },
    ...overrides,
  };
}

function makeMembership(data, user) {
  return {
    id: data.id || 'membership-1',
    usuario_id: data.usuario_id || (user && user.id),
    grupo_id: data.grupo_id || GROUP_ID,
    activa: data.activa !== undefined ? data.activa : true,
    fecha_asignacion: data.fecha_asignacion || new Date('2026-11-10T10:00:00.000Z'),
    usuario: user || null,
    updateCalls: [],
    async update(changes) {
      this.updateCalls.push(changes);
      Object.assign(this, changes);
      return this;
    },
  };
}

function makeAssignment(data, user, assignments) {
  return {
    id: data.id || 'assignment-1',
    docente_id: data.docente_id || (user && user.id),
    grupo_id: data.grupo_id || GROUP_ID,
    fecha_asignacion: data.fecha_asignacion || new Date('2026-11-10T10:00:00.000Z'),
    docente: user || null,
    destroyCalls: 0,
    async destroy() {
      this.destroyCalls += 1;
      const index = assignments.indexOf(this);
      if (index >= 0) assignments.splice(index, 1);
      return true;
    },
  };
}

function setup(options = {}) {
  const mocker = createMocker(GROUPS_SERVICE);
  const audit = [];
  const groups = options.groups ? [...options.groups] : [];
  const users = options.users ? [...options.users] : [];
  const memberships = options.memberships ? [...options.memberships] : [];
  const assignments = options.assignments || [];
  const createdGroups = [];
  const createdMemberships = [];
  const createdAssignments = [];
  const ldapCalls = {
    createGroup: [],
    updateGroup: [],
    deleteGroup: [],
    addGroupMember: [],
    removeGroupMember: [],
  };
  const loggerErrors = [];
  let usuarioDestroyCalls = 0;

  const Grupo = {
    findAll: async ({ where } = {}) => {
      if (where && where.id && where.id[Op.in]) {
        return groups.filter((g) => where.id[Op.in].includes(g.id));
      }
      return groups;
    },
    findOne: async ({ where }) => groups.find((g) => g.codigo === where.codigo) || null,
    findByPk: async (id) => groups.find((g) => g.id === id) || null,
    create: async (data) => {
      if (options.groupCreateError) throw options.groupCreateError;
      const group = makeGroup({ id: options.newGroupId || GROUP_ID, ...data });
      groups.push(group);
      createdGroups.push(data);
      return group;
    },
  };

  const Usuario = {
    findByPk: async (id) => users.find((u) => u.id === id) || null,
    destroy: async () => {
      usuarioDestroyCalls += 1;
      return 1;
    },
  };

  const MembresiaGrupo = {
    findOne: async ({ where }) =>
      memberships.find(
        (m) =>
          m.usuario_id === where.usuario_id &&
          m.grupo_id === where.grupo_id &&
          (where.activa === undefined || m.activa === where.activa),
      ) || null,
    findAll: async ({ where }) =>
      memberships.filter(
        (m) =>
          m.grupo_id === where.grupo_id &&
          (where.activa === undefined || m.activa === where.activa),
      ),
    count: async ({ where }) =>
      memberships.filter(
        (m) =>
          m.grupo_id === where.grupo_id &&
          (where.activa === undefined || m.activa === where.activa),
      ).length,
    create: async (data) => {
      const user = users.find((u) => u.id === data.usuario_id) || null;
      const membership = makeMembership(data, user);
      memberships.push(membership);
      createdMemberships.push(data);
      return membership;
    },
  };

  const AsignacionDocente = {
    findOne: async ({ where }) =>
      assignments.find(
        (a) => a.docente_id === where.docente_id && a.grupo_id === where.grupo_id,
      ) || null,
    findAll: async ({ where } = {}) =>
      assignments.filter(
        (a) =>
          (!where.grupo_id || a.grupo_id === where.grupo_id) &&
          (!where.docente_id || a.docente_id === where.docente_id),
      ),
    count: async ({ where }) => assignments.filter((a) => a.grupo_id === where.grupo_id).length,
    create: async (data) => {
      const user = users.find((u) => u.id === data.docente_id) || null;
      const assignment = makeAssignment(data, user, assignments);
      assignments.push(assignment);
      createdAssignments.push(data);
      return assignment;
    },
  };

  const ldap = {
    findGroupByCode: async (codigo) => {
      if (options.ldapGroup) return options.ldapGroup(codigo);
      return null;
    },
    createGroup: async (payload) => {
      ldapCalls.createGroup.push(payload);
      if (options.ldapCreateError) throw options.ldapCreateError;
      return options.ldapCreatedGroup || {
        dn: `CN=${payload.codigo},CN=Users,DC=clockwork,DC=local`,
        sid: 'S-1-5-21-9-9-9',
      };
    },
    updateGroup: async (dn, payload) => {
      ldapCalls.updateGroup.push({ dn, payload });
      if (options.ldapUpdateError) throw options.ldapUpdateError;
      return { dn, ...payload };
    },
    deleteGroup: async (dn) => {
      ldapCalls.deleteGroup.push(dn);
      if (options.ldapDeleteError) throw options.ldapDeleteError;
      return true;
    },
    addGroupMember: async (groupDn, userDn) => {
      ldapCalls.addGroupMember.push({ groupDn, userDn });
      if (options.ldapAddMemberError) throw options.ldapAddMemberError;
      return true;
    },
    removeGroupMember: async (groupDn, userDn) => {
      ldapCalls.removeGroupMember.push({ groupDn, userDn });
      if (options.ldapRemoveMemberError) throw options.ldapRemoveMemberError;
      return true;
    },
  };

  mocker.mock('../../models', {
    Grupo,
    Usuario,
    MembresiaGrupo,
    AsignacionDocente,
  });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
  });
  mocker.mock('../auth/ldap.service', ldap);
  mocker.mock('../../utils/logger', {
    error: (...args) => loggerErrors.push(args),
    warn: () => {},
    info: () => {},
  });

  const service = mocker.load();

  return {
    service,
    audit,
    groups,
    users,
    memberships,
    assignments,
    createdGroups,
    createdMemberships,
    createdAssignments,
    ldapCalls,
    loggerErrors,
    usuarioDestroyCalls: () => usuarioDestroyCalls,
    restore: () => mocker.restore(),
  };
}

async function expectError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

test('HU05-01 valida código, descripción y campos obligatorios', () => {
  assert.ok(validateCreateGroup({ codigo: '', descripcion: '' }).some((m) => m.includes('obligatorio')));
  assert.ok(validateCreateGroup({ codigo: 'A', descripcion: '' }).some((m) => m.includes('3 y 32')));
  assert.deepEqual(validateCreateGroup({ codigo: 'GRP-1A', descripcion: 'Primer año' }), []);
  assert.ok(validateUpdateGroup({}).some((m) => m.includes('al menos un campo')));
  assert.ok(validateMember({}).some((m) => m.includes('estudiante')));
  assert.ok(validateTeacher({}).some((m) => m.includes('docente')));
});

test('HU05-02 rechaza código duplicado en PostgreSQL (CA-01/RN-011)', async (t) => {
  const ctx = setup({ groups: [makeGroup()] });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.create(request(), { codigo: 'GRP-1A', descripcion: 'Duplicado' }),
    409,
    'CODIGO_DUPLICADO',
  );
  assert.equal(ctx.ldapCalls.createGroup.length, 0);
  assert.equal(ctx.createdGroups.length, 0);
});

test('HU05-03 rechaza código duplicado en Samba AD (CA-01/RN-011)', async (t) => {
  const ctx = setup({
    ldapGroup: (codigo) =>
      codigo === 'GRP-2B'
        ? { dn: 'CN=GRP-2B,CN=Users,DC=clockwork,DC=local', codigo }
        : null,
  });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.create(request(), { codigo: 'GRP-2B', descripcion: 'Comisión B' }),
    409,
    'CODIGO_DUPLICADO_AD',
  );
  assert.equal(ctx.ldapCalls.createGroup.length, 0);
});

test('HU05-04 crea el grupo en LDAP y guarda metadatos (CA-02/CA-04/CA-05)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const result = await ctx.service.create(request(), {
    codigo: '  grp-2b  ',
    descripcion: '  Segundo   año B ',
  });

  assert.equal(ctx.ldapCalls.createGroup.length, 1);
  assert.equal(ctx.ldapCalls.createGroup[0].codigo, 'GRP-2B');
  assert.equal(ctx.ldapCalls.createGroup[0].descripcion, 'Segundo año B');
  assert.equal(ctx.createdGroups.length, 1);
  assert.equal(ctx.createdGroups[0].codigo, 'GRP-2B');
  assert.equal(ctx.createdGroups[0].descripcion, 'Segundo año B');
  assert.equal(ctx.createdGroups[0].samba_sid, 'S-1-5-21-9-9-9');
  assert.equal(
    ctx.createdGroups[0].samba_dn,
    'CN=GRP-2B,CN=Users,DC=clockwork,DC=local',
  );
  assert.equal(result.codigo, 'GRP-2B');
  assert.equal(result.estudiantes, 0);
  assert.equal(result.docentes, 0);
  assert.equal(ctx.audit[0].accion, 'CREAR');
  assert.equal(ctx.audit[0].entidad, 'grupo');
  assert.equal(ctx.audit[0].detalle.codigo, 'GRP-2B');
});

test('HU05-05 revierte el grupo LDAP si falla la persistencia (CA-02/CA-05)', async (t) => {
  const error = Object.assign(new Error('duplicado en BD'), {
    name: 'SequelizeUniqueConstraintError',
  });
  const ctx = setup({ groupCreateError: error });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.create(request(), { codigo: 'GRP-9Z', descripcion: 'Grupo temporal' }),
    409,
    'CODIGO_DUPLICADO',
  );

  assert.equal(ctx.ldapCalls.createGroup.length, 1);
  assert.equal(ctx.ldapCalls.deleteGroup.length, 1);
  assert.equal(
    ctx.ldapCalls.deleteGroup[0],
    'CN=GRP-9Z,CN=Users,DC=clockwork,DC=local',
  );
});

test('HU05-06 actualiza la descripción y rechaza cambiar el código (CA-02)', async (t) => {
  const group = makeGroup();
  const ctx = setup({ groups: [group] });
  t.after(() => ctx.restore());

  const updated = await ctx.service.update(request(), GROUP_ID, {
    descripcion: 'Primer año A - actualizado',
  });

  assert.equal(ctx.ldapCalls.updateGroup.length, 1);
  assert.equal(ctx.ldapCalls.updateGroup[0].dn, group.samba_dn);
  assert.equal(ctx.ldapCalls.updateGroup[0].payload.descripcion, 'Primer año A - actualizado');
  assert.equal(group.updateCalls.length, 1);
  assert.equal(group.updateCalls[0].descripcion, 'Primer año A - actualizado');
  assert.equal(updated.descripcion, 'Primer año A - actualizado');
  assert.equal(ctx.audit[0].accion, 'ACTUALIZAR');

  await expectError(
    ctx.service.update(request(), GROUP_ID, { codigo: 'OTRO-CODIGO' }),
    400,
    'CODIGO_INMUTABLE',
  );
});

test('HU05-07 elimina el grupo y sus relaciones sin borrar usuarios (CA-03/CA-06/RN-014)', async (t) => {
  const student = makeUser();
  const teacher = makeUser({
    id: TEACHER_ID,
    uid: 'docente1',
    rol: 'DOCENTE',
    samba_dn: 'CN=Docente Uno,CN=Users,DC=clockwork,DC=local',
  });
  const group = makeGroup();
  const ctx = setup({
    groups: [group],
    users: [student, teacher],
    memberships: [makeMembership({ usuario_id: student.id, grupo_id: group.id }, student)],
    assignments: [makeAssignment({ docente_id: teacher.id, grupo_id: group.id }, teacher, [])],
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.remove(request(), group.id);

  assert.equal(ctx.ldapCalls.deleteGroup.length, 1);
  assert.equal(ctx.ldapCalls.deleteGroup[0], group.samba_dn);
  assert.equal(group.destroyCalls, 1);
  assert.equal(ctx.usuarioDestroyCalls(), 0);
  assert.equal(result.deleted, true);
  assert.equal(result.estudiantes_liberados, 1);
  assert.equal(result.docentes_liberados, 1);
  assert.equal(ctx.audit[0].accion, 'ELIMINAR');
  assert.equal(ctx.audit[0].detalle.usuarios_conservados, true);
});

test('HU05-08 agrega un estudiante y sincroniza la membresía LDAP (CA-04/CA-07/CA-08)', async (t) => {
  const student = makeUser();
  const group = makeGroup();
  const ctx = setup({ groups: [group], users: [student] });
  t.after(() => ctx.restore());

  const result = await ctx.service.addStudent(request(), group.id, {
    usuario_id: student.id,
  });

  assert.equal(result.created, true);
  assert.equal(ctx.ldapCalls.addGroupMember.length, 1);
  assert.equal(ctx.ldapCalls.addGroupMember[0].groupDn, group.samba_dn);
  assert.equal(ctx.ldapCalls.addGroupMember[0].userDn, student.samba_dn);
  assert.equal(ctx.createdMemberships.length, 1);
  assert.equal(ctx.createdMemberships[0].usuario_id, student.id);
  assert.equal(ctx.createdMemberships[0].grupo_id, group.id);
  assert.equal(result.grupo.estudiantes.length, 1);
  assert.equal(result.grupo.estudiantes[0].uid, student.uid);
  assert.equal(ctx.audit[0].detalle.accion, 'AGREGAR_ESTUDIANTE');
});

test('HU05-09 rechaza a un docente como miembro del grupo (CA-07/RN-015)', async (t) => {
  const teacher = makeUser({
    id: TEACHER_ID,
    uid: 'docente1',
    rol: 'DOCENTE',
    samba_dn: 'CN=Docente Uno,CN=Users,DC=clockwork,DC=local',
  });
  const ctx = setup({ groups: [makeGroup()], users: [teacher] });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.addStudent(request(), GROUP_ID, { usuario_id: teacher.id }),
    400,
    'SOLO_ESTUDIANTES',
  );
  assert.equal(ctx.ldapCalls.addGroupMember.length, 0);
  assert.equal(ctx.createdMemberships.length, 0);
});

test('HU05-10 permite múltiple membresía del mismo estudiante (CA-08/RN-012)', async (t) => {
  const student = makeUser();
  const group1 = makeGroup();
  const group2 = makeGroup({
    id: GROUP_ID_2,
    codigo: 'GRP-1B',
    samba_dn: 'CN=GRP-1B,CN=Users,DC=clockwork,DC=local',
  });
  const ctx = setup({ groups: [group1, group2], users: [student] });
  t.after(() => ctx.restore());

  await ctx.service.addStudent(request(), group1.id, { usuario_id: student.id });
  await ctx.service.addStudent(request(), group2.id, { usuario_id: student.id });

  assert.equal(ctx.createdMemberships.length, 2);
  assert.equal(ctx.ldapCalls.addGroupMember.length, 2);
  assert.equal(ctx.createdMemberships[0].grupo_id, group1.id);
  assert.equal(ctx.createdMemberships[1].grupo_id, group2.id);
});

test('HU05-11 es idempotente al agregar un miembro existente (CA-04)', async (t) => {
  const student = makeUser();
  const group = makeGroup();
  const ctx = setup({
    groups: [group],
    users: [student],
    memberships: [makeMembership({ usuario_id: student.id, grupo_id: group.id }, student)],
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.addStudent(request(), group.id, {
    usuario_id: student.id,
  });

  assert.equal(result.created, false);
  assert.equal(ctx.ldapCalls.addGroupMember.length, 0);
  assert.equal(ctx.createdMemberships.length, 0);
});

test('HU05-12 remueve un estudiante del grupo y de LDAP (CA-04/CA-07)', async (t) => {
  const student = makeUser();
  const group = makeGroup();
  const membership = makeMembership(
    { usuario_id: student.id, grupo_id: group.id },
    student,
  );
  const ctx = setup({
    groups: [group],
    users: [student],
    memberships: [membership],
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.removeStudent(request(), group.id, student.id);

  assert.equal(result.removed, true);
  assert.equal(ctx.ldapCalls.removeGroupMember.length, 1);
  assert.equal(ctx.ldapCalls.removeGroupMember[0].groupDn, group.samba_dn);
  assert.equal(ctx.ldapCalls.removeGroupMember[0].userDn, student.samba_dn);
  assert.equal(membership.updateCalls.length, 1);
  assert.deepEqual(membership.updateCalls[0], { activa: false });
  assert.equal(result.grupo.estudiantes.length, 0);
  assert.equal(ctx.audit[0].detalle.accion, 'REMOVER_ESTUDIANTE');
});

test('HU05-13 asigna un docente para monitoreo sin membresía LDAP (CA-09/RN-015)', async (t) => {
  const teacher = makeUser({
    id: TEACHER_ID,
    uid: 'docente1',
    rol: 'DOCENTE',
    samba_dn: 'CN=Docente Uno,CN=Users,DC=clockwork,DC=local',
  });
  const group = makeGroup();
  const ctx = setup({ groups: [group], users: [teacher] });
  t.after(() => ctx.restore());

  const result = await ctx.service.addTeacher(request(), group.id, {
    usuario_id: teacher.id,
  });

  assert.equal(result.created, true);
  assert.equal(ctx.createdAssignments.length, 1);
  assert.equal(ctx.createdAssignments[0].docente_id, teacher.id);
  assert.equal(ctx.createdAssignments[0].grupo_id, group.id);
  assert.equal(ctx.ldapCalls.addGroupMember.length, 0);
  assert.equal(result.grupo.docentes.length, 1);
  assert.equal(result.grupo.docentes[0].uid, teacher.uid);
  assert.equal(ctx.audit[0].detalle.accion, 'ASIGNAR_DOCENTE');
});

test('HU05-14 rechaza asignar a un estudiante como docente (CA-09)', async (t) => {
  const student = makeUser();
  const ctx = setup({ groups: [makeGroup()], users: [student] });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.addTeacher(request(), GROUP_ID, { usuario_id: student.id }),
    400,
    'SOLO_DOCENTES',
  );
  assert.equal(ctx.createdAssignments.length, 0);
});

test('HU05-15 remueve la asignación de un docente (CA-09)', async (t) => {
  const teacher = makeUser({
    id: TEACHER_ID,
    uid: 'docente1',
    rol: 'DOCENTE',
    samba_dn: 'CN=Docente Uno,CN=Users,DC=clockwork,DC=local',
  });
  const group = makeGroup();
  const assignments = [];
  const assignment = makeAssignment(
    { docente_id: teacher.id, grupo_id: group.id },
    teacher,
    assignments,
  );
  assignments.push(assignment);
  const ctx = setup({
    groups: [group],
    users: [teacher],
    assignments,
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.removeTeacher(request(), group.id, teacher.id);

  assert.equal(result.removed, true);
  assert.equal(assignment.destroyCalls, 1);
  assert.equal(result.grupo.docentes.length, 0);
  assert.equal(ctx.audit[0].detalle.accion, 'REMOVER_DOCENTE');
});

test('HU05-16 lista grupos con conteos (CA-01/CA-05)', async (t) => {
  const group1 = makeGroup();
  const group2 = makeGroup({ id: GROUP_ID_2, codigo: 'GRP-1B' });
  const student = makeUser();
  const teacher = makeUser({ id: TEACHER_ID, uid: 'docente1', rol: 'DOCENTE' });
  const ctx = setup({
    groups: [group1, group2],
    users: [student, teacher],
    memberships: [makeMembership({ usuario_id: student.id, grupo_id: group1.id }, student)],
    assignments: [makeAssignment({ docente_id: teacher.id, grupo_id: group1.id }, teacher, [])],
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.list(request());

  assert.equal(result.length, 2);
  const first = result.find((g) => g.id === group1.id);
  const second = result.find((g) => g.id === group2.id);
  assert.equal(first.estudiantes, 1);
  assert.equal(first.docentes, 1);
  assert.equal(second.estudiantes, 0);
  assert.equal(second.docentes, 0);
});

test('HU05-17 devuelve el detalle del grupo con estudiantes y docentes (CA-05/CA-09)', async (t) => {
  const student = makeUser();
  const teacher = makeUser({ id: TEACHER_ID, uid: 'docente1', rol: 'DOCENTE' });
  const group = makeGroup();
  const ctx = setup({
    groups: [group],
    users: [student, teacher],
    memberships: [makeMembership({ usuario_id: student.id, grupo_id: group.id }, student)],
    assignments: [makeAssignment({ docente_id: teacher.id, grupo_id: group.id }, teacher, [])],
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.get(request(), group.id);

  assert.equal(result.codigo, 'GRP-1A');
  assert.equal(result.samba_dn, group.samba_dn);
  assert.equal(result.estudiantes.length, 1);
  assert.equal(result.estudiantes[0].uid, student.uid);
  assert.equal(result.estudiantes[0].rol, 'ESTUDIANTE');
  assert.equal(result.docentes.length, 1);
  assert.equal(result.docentes[0].uid, teacher.uid);
  assert.equal(result.docentes[0].rol, 'DOCENTE');
});

test('HU05-18 audita la creación y las membresías (RN-010)', async (t) => {
  const student = makeUser();
  const group = makeGroup();
  const ctx = setup({ groups: [group], users: [student] });
  t.after(() => ctx.restore());

  await ctx.service.addStudent(request(), group.id, { usuario_id: student.id });
  await ctx.service.removeStudent(request(), group.id, student.id);

  assert.equal(ctx.audit.length, 2);
  assert.equal(ctx.audit[0].accion, 'ACTUALIZAR');
  assert.equal(ctx.audit[0].detalle.accion, 'AGREGAR_ESTUDIANTE');
  assert.equal(ctx.audit[1].detalle.accion, 'REMOVER_ESTUDIANTE');
});

test('HU05-19 el docente solo ve y consulta sus grupos asignados (RN-017)', async (t) => {
  const teacher = makeUser({
    id: TEACHER_ID,
    uid: 'docente1',
    rol: 'DOCENTE',
    samba_dn: 'CN=Docente Uno,CN=Users,DC=clockwork,DC=local',
  });
  const group1 = makeGroup();
  const group2 = makeGroup({ id: GROUP_ID_2, codigo: 'GRP-1B' });
  const ctx = setup({
    groups: [group1, group2],
    users: [teacher],
    assignments: [
      makeAssignment({ docente_id: teacher.id, grupo_id: group1.id }, teacher, []),
    ],
  });
  t.after(() => ctx.restore());

  const docenteReq = request({
    user: { id: TEACHER_ID, uid: 'docente1', rol: 'DOCENTE' },
  });

  const groups = await ctx.service.list(docenteReq);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, group1.id);

  const detail = await ctx.service.get(docenteReq, group1.id);
  assert.equal(detail.id, group1.id);

  await expectError(ctx.service.get(docenteReq, group2.id), 403, 'ACCESO_DENEGADO');
});
