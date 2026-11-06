const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { setupAuth, makeUser } = require('./helpers/auth');
const { validateTicket } = require('../src/modules/auth/kerberos.service');
const { resolveGpoForGroups } = require('../src/modules/auth/gpo.service');
const { authenticatePc, GENERIC_MESSAGE } = require('../src/modules/auth/pcAuth.service');
const { registerLogon } = require('../src/modules/auth/pcSession.service');

function request() {
  return { headers: {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };
}

async function expectError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

function validTicket(overrides = {}) {
  return {
    principal: 'jperez@CLOCKWORK.LOCAL',
    realm: 'CLOCKWORK.LOCAL',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

test('PU-COM01-01 validación centralizada contra Samba AD (CA-01)', async (t) => {
  const ctx = setupAuth();
  t.after(() => ctx.restore());

  const result = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );

  assert.equal(ctx.ldapCalls(), 1);
  assert.equal(result.user.uid, 'jperez');
  assert.equal(JSON.stringify(ctx.audit).includes('Secreta#123'), false);
});

test('PU-COM01-02 JWT con rol y permisos (CA-02)', async (t) => {
  const ctx = setupAuth();
  t.after(() => ctx.restore());

  const result = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );
  const decoded = jwt.decode(result.token);

  assert.equal(decoded.uid, 'jperez');
  assert.equal(decoded.rol, 'DOCENTE');
  assert.ok(Array.isArray(decoded.permisos));
  assert.ok(decoded.exp);
});

test('PU-COM01-03 error genérico por credenciales incorrectas (CA-03)', async (t) => {
  const ctx = setupAuth({
    ldapAuth: async () => {
      throw Object.assign(new Error('invalid'), { code: 'INVALID_CREDENTIALS' });
    },
  });
  t.after(() => ctx.restore());

  await assert.rejects(
    ctx.service.login({ uid: 'jperez', password: 'incorrecta' }, request()),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'CREDENCIALES_INVALIDAS');
      assert.equal(err.message, 'Usuario o contraseña incorrectos');
      assert.equal(/invalidCredentials|data 49|CN=/i.test(err.message), false);
      return true;
    },
  );
  assert.equal(JSON.stringify(ctx.audit).includes('incorrecta'), false);
});

test('PU-COM01-04 ticket Kerberos válido permite continuar (CA-04)', () => {
  const result = authenticatePc({ ticket: validTicket() });

  assert.equal(result.authenticated, true);
  assert.equal(result.principal, 'jperez@CLOCKWORK.LOCAL');
  assert.equal(result.realm, 'CLOCKWORK.LOCAL');
  assert.equal(JSON.stringify(result).includes('Secreta#123'), false);
});

test('PU-COM01-05 ticket inválido o expirado deniega con mensaje genérico (CA-04/CA-09)', () => {
  const expired = authenticatePc({
    ticket: validTicket({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
  });
  const invalid = authenticatePc({ ticket: { principal: 'jperez' } });

  assert.equal(expired.authenticated, false);
  assert.equal(expired.message, GENERIC_MESSAGE);
  assert.equal(expired.reason, 'TICKET_EXPIRADO');
  assert.equal(invalid.authenticated, false);
  assert.equal(invalid.message, GENERIC_MESSAGE);
  assert.equal(invalid.reason, 'TICKET_INVALIDO');
});

test('PU-COM01-06 carga de GPO solo del grupo del usuario (CA-05)', () => {
  const catalog = {
    Docentes: { restricciones: ['monitoreo'], unidad: 'P:' },
    Estudiantes: { restricciones: ['bloqueo'], unidad: 'E:' },
  };

  const restrictions = resolveGpoForGroups(['Docentes'], catalog);

  assert.deepEqual(restrictions, { restricciones: ['monitoreo'], unidad: 'P:' });
  assert.equal(restrictions.unidad, 'P:');
  assert.equal(JSON.stringify(restrictions).includes('E:'), false);
});

test('PU-COM01-07 registro de logon con usuario, PC y hora (CA-06)', async () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const calls = [];
  const repo = {
    async create(data) {
      calls.push(data);
      return { id: 'session-1', ...data };
    },
  };

  const session = await registerLogon({
    usuarioId: 'user-1',
    equipoId: 'pc-lab-01',
    repo,
    now,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].usuario_id, 'user-1');
  assert.equal(calls[0].equipo_id, 'pc-lab-01');
  assert.equal(calls[0].hora_inicio, now);
  assert.equal(calls[0].activa, true);
  assert.equal(session.id, 'session-1');
  assert.equal(JSON.stringify(calls).includes('password'), false);
});

test('PU-COM01-08 credenciales inválidas en PC deniegan sin cargar GPO (CA-07)', () => {
  const result = authenticatePc({
    ticket: validTicket({ expiresAt: new Date(Date.now() - 1).toISOString() }),
  });

  assert.equal(result.authenticated, false);
  assert.equal(result.message, GENERIC_MESSAGE);
  assert.equal(result.restrictions, undefined);
});

test('PU-COM01-09 configuración LDAPS sin fallback inseguro (CA-08)', () => {
  delete require.cache[require.resolve('../src/config/env')];
  const env = require('../src/config/env');

  assert.ok(env.ldapUrl.startsWith('ldaps://'));
  assert.equal(env.ldapTlsRejectUnauthorized, true);
  assert.equal(env.ldapUrl.includes(':636') || env.ldapUrl.includes(':3269'), true);
});

test('PU-COM01-10 validación de tickets válidos e inválidos (CA-09)', () => {
  const valid = validateTicket(validTicket());
  const invalid = validateTicket(validTicket({ expiresAt: new Date(0).toISOString() }));

  assert.equal(valid.valid, true);
  assert.equal(valid.principal, 'jperez@CLOCKWORK.LOCAL');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.reason, 'TICKET_EXPIRADO');
});

test('PU-COM01-11 respuesta de API con rol y sin datos sensibles (CA-10)', async (t) => {
  const ctx = setupAuth({ user: makeUser({ rol: 'ADMIN_TECNICO' }) });
  t.after(() => ctx.restore());

  const result = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );

  assert.equal(result.user.rol, 'ADMIN_TECNICO');
  assert.ok(Array.isArray(result.permissions));
  assert.ok(result.token);
  assert.equal(JSON.stringify(result).includes('Secreta#123'), false);
  assert.equal(JSON.stringify(result.user).includes('samba_sid'), false);
});

test('PU-COM01-12 sin almacenamiento de contraseñas (CA-11)', async (t) => {
  const ctx = setupAuth();
  t.after(() => ctx.restore());

  const result = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );

  const serialized = JSON.stringify({
    audit: ctx.audit,
    token: result.token,
    user: result.user,
    session: result.session,
  });
  assert.equal(serialized.includes('Secreta#123'), false);
});
