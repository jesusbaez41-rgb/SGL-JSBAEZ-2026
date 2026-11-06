const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createMocker } = require('./helpers/mock');
const { makeUser } = require('./helpers/auth');
const { validateCreate } = require('../src/modules/users/users.validators');

const USERS_SERVICE = path.join(__dirname, '../src/modules/users/users.service.js');
const USER_ID = '11111111-1111-4111-8111-111111111111';

function request() {
  return {
    user: { id: USER_ID, uid: 'atecnico', rol: 'ADMIN_TECNICO' },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function validPayload(overrides = {}) {
  return {
    uid: 'jperez',
    email: 'jperez@clockwork.local',
    nombre_completo: 'Juan Perez',
    rol: 'DOCENTE',
    password: 'Secreta#123',
    ...overrides,
  };
}

async function expectError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

function setup(options = {}) {
  const mocker = createMocker(USERS_SERVICE);
  const audit = [];
  const createdData = [];
  const ldapUpdates = [];
  const sessionUpdates = [];
  let ldapCreateCalls = 0;

  const user = options.user === undefined ? makeUser({ id: USER_ID }) : options.user;

  const Usuario = {
    findOne: async ({ where }) => (options.userLookup ? options.userLookup(where) : null),
    findByPk: async () => user,
    create: async (data) => {
      createdData.push(data);
      if (options.userCreate) return options.userCreate(data);
      return { id: USER_ID, ...data, toJSON() { return this; } };
    },
  };

  const SesionWeb = {
    update: async (values, opts) => {
      sessionUpdates.push({ values, opts });
      return [1];
    },
  };

  const ldap = {
    findUserByUid: async () => options.adUser || null,
    findUserByEmail: async () => options.adEmailUser || null,
    createUser: async (data) => {
      ldapCreateCalls += 1;
      if (options.ldapCreate) return options.ldapCreate(data);
      return { dn: 'CN=Nuevo,CN=Users,DC=clockwork,DC=local', sid: 'S-1-5-21-1-2-3-2002' };
    },
    updateUser: async (...args) => {
      ldapUpdates.push(args);
      if (options.ldapUpdate) return options.ldapUpdate(...args);
      return {};
    },
    deleteUser: async () => true,
  };

  mocker.mock('../../models', {
    sequelize: { query: async () => [] },
    Usuario,
    SesionWeb,
  });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
    recordAuthEvent: async () => {},
  });
  mocker.mock('../auth/ldap.service', ldap);

  const service = mocker.load();
  return {
    service,
    mocker,
    audit,
    createdData,
    ldapUpdates,
    sessionUpdates,
    ldapCreateCalls: () => ldapCreateCalls,
    user,
    restore: () => mocker.restore(),
  };
}

test('PU-COM02-01 creación sincronizada con Samba AD (CA-01)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const result = await ctx.service.create(request(), validPayload());

  assert.equal(ctx.ldapCreateCalls(), 1);
  assert.equal(ctx.createdData.length, 1);
  assert.equal(result.uid, 'jperez');
  assert.equal(ctx.createdData[0].samba_dn, 'CN=Nuevo,CN=Users,DC=clockwork,DC=local');
  assert.equal(ctx.createdData[0].samba_sid, 'S-1-5-21-1-2-3-2002');
  assert.ok(ctx.audit.some((event) => event.accion === 'CREAR'));
});

test('PU-COM02-02 rol obligatorio y válido (CA-02)', () => {
  const nullRole = validateCreate(validPayload({ rol: null }));
  const invalidRole = validateCreate(validPayload({ rol: 'Invitado' }));
  const validRole = validateCreate(validPayload({ rol: 'DOCENTE' }));

  assert.ok(nullRole.some((message) => message.includes('rol')));
  assert.ok(invalidRole.some((message) => message.includes('rol')));
  assert.deepEqual(validRole, []);
});

test('PU-COM02-03 unicidad de uid y correo (CA-03)', async () => {
  const uidCtx = setup({
    userLookup: (where) => (where.uid === 'jperez' ? { id: 'existing' } : null),
  });
  try {
    await expectError(uidCtx.service.create(request(), validPayload()), 409, 'UID_DUPLICADO');
    assert.equal(uidCtx.ldapCreateCalls(), 0);
    assert.equal(uidCtx.createdData.length, 0);
  } finally {
    uidCtx.restore();
  }

  const emailCtx = setup({
    userLookup: (where) => (where.email === 'jperez@clockwork.local' ? { id: 'existing' } : null),
  });
  try {
    await expectError(emailCtx.service.create(request(), validPayload()), 409, 'EMAIL_DUPLICADO');
    assert.equal(emailCtx.ldapCreateCalls(), 0);
    assert.equal(emailCtx.createdData.length, 0);
  } finally {
    emailCtx.restore();
  }
});

test('PU-COM02-04 crear, actualizar y desactivar se mapean a LDAP (CA-04)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  await ctx.service.create(request(), validPayload());
  await ctx.service.update(request(), USER_ID, { nombre_completo: 'Juan Perez Gomez' });
  await ctx.service.setStatus(request(), USER_ID, false);

  assert.equal(ctx.ldapCreateCalls(), 1);
  assert.equal(ctx.ldapUpdates.length, 2);
  assert.equal(ctx.ldapUpdates[0][0], ctx.user.samba_dn);
  assert.equal(ctx.ldapUpdates[0][1].nombre, 'Juan Perez Gomez');
  assert.equal(ctx.ldapUpdates[1][0], ctx.user.samba_dn);
  assert.equal(ctx.ldapUpdates[1][1].enabled, false);
  assert.equal(ctx.sessionUpdates.length, 1);
});

test('PU-COM02-05 persistencia de samba_sid y samba_dn sin contraseña (CA-05)', async (t) => {
  const ctx = setup({
    ldapCreate: async () => ({
      dn: 'CN=Juan,CN=Users,DC=clockwork,DC=local',
      sid: 'S-1-5-21-9-9-9',
    }),
  });
  t.after(() => ctx.restore());

  await ctx.service.create(request(), validPayload());

  assert.equal(ctx.createdData.length, 1);
  assert.equal(ctx.createdData[0].samba_dn, 'CN=Juan,CN=Users,DC=clockwork,DC=local');
  assert.equal(ctx.createdData[0].samba_sid, 'S-1-5-21-9-9-9');
  assert.equal(JSON.stringify(ctx.createdData).includes('Secreta#123'), false);
});

test('PU-COM02-06 fallo LDAP en creación no guarda en PostgreSQL (CA-06)', async (t) => {
  const ctx = setup({
    ldapCreate: async () => {
      throw Object.assign(new Error('constraint'), { code: 'LDAP_CONSTRAINT' });
    },
  });
  t.after(() => ctx.restore());

  await expectError(ctx.service.create(request(), validPayload()), 400, 'LDAP_CONSTRAINT');
  assert.equal(ctx.createdData.length, 0);
  assert.equal(ctx.audit.length, 0);
});

test('PU-COM02-07 update LDAP fallido no modifica la BD (CA-06)', async (t) => {
  const ctx = setup({
    ldapUpdate: async () => {
      throw Object.assign(new Error('timeout'), { code: 'LDAP_ERROR' });
    },
  });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.update(request(), USER_ID, { nombre_completo: 'No debe guardarse' }),
    502,
    'LDAP_ERROR',
  );
  assert.equal(ctx.user.lastUpdate, null);
  assert.equal(ctx.user.nombre_completo, 'Juan Perez');
});

test('PU-COM02-08 desactivación sincronizada y auditada (CA-01/CA-06)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const result = await ctx.service.setStatus(request(), USER_ID, false);

  assert.equal(result.activo, false);
  assert.equal(ctx.ldapUpdates[0][1].enabled, false);
  assert.equal(ctx.sessionUpdates[0].values.motivo_revocacion, 'USUARIO_DESACTIVADO');
  assert.ok(ctx.audit.some((event) => event.accion === 'ACTUALIZAR'));
  assert.equal(ctx.audit[0].entidadId, USER_ID);
});
