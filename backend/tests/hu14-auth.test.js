const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { setupAuth, makeUser, ENV } = require('./helpers/auth');

function request() {
  return {
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };
}

async function expectError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `status esperado ${status}, recibido ${err.status}`);
    if (code) assert.equal(err.code, code, `code esperado ${code}, recibido ${err.code}`);
    return true;
  });
}

test('PU-03 autenticación exitosa contra Samba AD (CA-02)', async (t) => {
  const ctx = setupAuth();
  t.after(() => ctx.restore());

  const result = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );

  assert.equal(ctx.ldapCalls(), 1);
  assert.equal(result.user.uid, 'jperez');
  assert.equal(result.user.rol, 'DOCENTE');
  assert.ok(result.token);
  assert.ok(ctx.audit.some((event) => event.accion === 'LOGIN'));
  assert.equal(JSON.stringify(ctx.audit).includes('Secreta#123'), false);
});

test('PU-04 credenciales inválidas devuelven error genérico (CA-02/CA-09)', async (t) => {
  const ctx = setupAuth({
    ldapAuth: async () => {
      throw Object.assign(new Error('invalid credentials'), { code: 'INVALID_CREDENTIALS' });
    },
  });
  t.after(() => ctx.restore());

  await assert.rejects(
    ctx.service.login({ uid: 'jperez', password: 'incorrecta' }, request()),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'CREDENCIALES_INVALIDAS');
      assert.equal(err.message, 'Usuario o contraseña incorrectos');
      assert.equal(/DN|ldap|49/i.test(err.message), false);
      return true;
    },
  );

  assert.equal(ctx.user.intentos_fallidos, 1);
  assert.ok(ctx.audit.some((event) => event.accion === 'LOGIN_FALLIDO'));
  assert.equal(JSON.stringify(ctx.audit).includes('incorrecta'), false);
});

test('PU-05 no se almacena la contraseña en texto plano (CA-02)', async (t) => {
  const ctx = setupAuth();
  t.after(() => ctx.restore());

  const result = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );

  const serialized = JSON.stringify({
    token: result.token,
    user: result.user,
    audit: ctx.audit,
    lastUpdate: ctx.user.lastUpdate,
    session: result.session,
  });

  assert.equal(serialized.includes('Secreta#123'), false);
});

test('PU-06 JWT con uid, rol, permisos y firma válida (CA-03)', async (t) => {
  const ctx = setupAuth();
  t.after(() => ctx.restore());

  const result = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );
  const decoded = jwt.decode(result.token);
  const verified = jwt.verify(result.token, ENV.jwtSecret);

  assert.equal(decoded.uid, 'jperez');
  assert.equal(decoded.rol, 'DOCENTE');
  assert.ok(Array.isArray(decoded.permisos));
  assert.ok(decoded.permisos.includes('monitoring:read'));
  assert.ok(decoded.exp);
  assert.equal(verified.uid, 'jperez');
});

test('PU-07 expiración configurable del token (CA-03)', async (t) => {
  const ctx = setupAuth();
  const originalExpires = ENV.jwtExpires;
  const originalExpiresMs = ENV.jwtExpiresMs;
  t.after(() => {
    ENV.jwtExpires = originalExpires;
    ENV.jwtExpiresMs = originalExpiresMs;
    ctx.restore();
  });

  const first = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );
  const firstDecoded = jwt.decode(first.token);
  assert.equal(firstDecoded.exp - firstDecoded.iat, 1800);

  ENV.jwtExpires = '15m';
  ENV.jwtExpiresMs = 15 * 60 * 1000;

  const second = await ctx.service.login(
    { uid: 'jperez', password: 'Secreta#123' },
    request(),
  );
  const secondDecoded = jwt.decode(second.token);
  assert.equal(secondDecoded.exp - secondDecoded.iat, 900);
});

test('PU-08 rol Estudiante no obtiene sesión web (CA-04)', async (t) => {
  const ctx = setupAuth({ user: makeUser({ rol: 'ESTUDIANTE' }) });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.login({ uid: 'jperez', password: 'Secreta#123' }, request()),
    403,
    'ROL_NO_HABILITADO',
  );

  assert.equal(ctx.sessionCreates(), 0);
  assert.ok(ctx.audit.some((event) => event.accion === 'ROL_NO_HABILITADO'));
});

test('PU-09 roles habilitados son aceptados (CA-04)', async () => {
  for (const rol of ['ADMIN_ACADEMICO', 'ADMIN_TECNICO', 'DOCENTE']) {
    const ctx = setupAuth({ user: makeUser({ rol }) });
    try {
      const result = await ctx.service.login(
        { uid: 'jperez', password: 'Secreta#123' },
        request(),
      );
      assert.equal(result.user.rol, rol);
      assert.ok(result.token);
    } finally {
      ctx.restore();
    }
  }
});

test('PU-15 bloqueo tras 5 intentos fallidos (CA-09)', async (t) => {
  const ctx = setupAuth({
    ldapAuth: async () => {
      throw Object.assign(new Error('invalid credentials'), { code: 'INVALID_CREDENTIALS' });
    },
  });
  t.after(() => ctx.restore());

  for (let intento = 1; intento <= 5; intento += 1) {
    await expectError(
      ctx.service.login({ uid: 'jperez', password: 'mala' }, request()),
      401,
      'CREDENCIALES_INVALIDAS',
    );
    if (intento < 5) {
      assert.equal(ctx.user.bloqueado_hasta, null, `intento ${intento} no debe bloquear aún`);
    }
  }

  assert.ok(ctx.user.bloqueado_hasta instanceof Date);
  assert.ok(ctx.user.bloqueado_hasta.getTime() > Date.now());
  assert.equal(ctx.user.intentos_fallidos, 0);
  assert.equal(ctx.ldapCalls(), 5);

  await expectError(
    ctx.service.login({ uid: 'jperez', password: 'mala' }, request()),
    401,
    'CUENTA_BLOQUEADA',
  );
  assert.equal(ctx.ldapCalls(), 5, 'el intento bloqueado no debe llegar a LDAPS');
  assert.ok(ctx.audit.some((event) => event.accion === 'LOGIN_BLOQUEADO'));
});

test('PU-16 logout invalida la sesión (CA-10)', async (t) => {
  const ctx = setupAuth();
  t.after(() => ctx.restore());

  const session = {
    revocada_en: null,
    async update(changes) {
      Object.assign(this, changes);
      this.lastUpdate = changes;
      return this;
    },
  };
  const req = {
    ...request(),
    user: { id: ctx.user.id, uid: 'jperez', rol: 'DOCENTE', jti: 'jti-1' },
    session,
  };

  const result = await ctx.service.logout(req);

  assert.equal(result.ok, true);
  assert.ok(session.lastUpdate.revocada_en instanceof Date);
  assert.equal(session.lastUpdate.motivo_revocacion, 'LOGOUT');
  assert.ok(ctx.audit.some((event) => event.accion === 'LOGOUT'));
});

test('PU-20 usuario inactivo no obtiene token (CA-14)', async (t) => {
  const ctx = setupAuth({ user: makeUser({ activo: false }) });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.login({ uid: 'jperez', password: 'Secreta#123' }, request()),
    403,
    'USUARIO_INACTIVO',
  );

  assert.equal(ctx.sessionCreates(), 0);
  assert.ok(ctx.audit.some((event) => event.accion === 'USUARIO_INACTIVO'));
});

test('PU-21 usuario sin rol no obtiene token (CA-14)', async (t) => {
  const ctx = setupAuth({ user: makeUser({ rol: null }) });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.login({ uid: 'jperez', password: 'Secreta#123' }, request()),
    403,
    'ROL_NO_HABILITADO',
  );

  assert.equal(ctx.sessionCreates(), 0);
  assert.ok(ctx.audit.some((event) => event.accion === 'ROL_NO_HABILITADO'));
});

test('PU-23 LDAPS no disponible devuelve error controlado y audita (CA-02/CA-09)', async (t) => {
  const ctx = setupAuth({
    ldapAuth: async () => {
      throw Object.assign(new Error('connect ETIMEDOUT'), { code: 'LDAP_SERVICE_UNAVAILABLE' });
    },
  });
  t.after(() => ctx.restore());

  await assert.rejects(
    ctx.service.login({ uid: 'jperez', password: 'Secreta#123' }, request()),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'AUTH_NO_DISPONIBLE');
      assert.equal(err.message.includes('ETIMEDOUT'), false);
      return true;
    },
  );

  assert.equal(ctx.sessionCreates(), 0);
  assert.ok(ctx.audit.some((event) => event.accion === 'AUTH_NO_DISPONIBLE'));
});

test('PU-24 un login inserta una sola sesión (CA-12)', async (t) => {
  const ctx = setupAuth();
  t.after(() => ctx.restore());

  await ctx.service.login({ uid: 'jperez', password: 'Secreta#123' }, request());
  assert.equal(ctx.sessionCreates(), 1);

  const session = {
    revocada_en: null,
    async update(changes) {
      Object.assign(this, changes);
      return this;
    },
  };
  await ctx.service.logout({
    ...request(),
    user: { id: ctx.user.id, uid: 'jperez', rol: 'DOCENTE', jti: 'jti-1' },
    session,
  });

  assert.equal(ctx.sessionCreates(), 1);
  assert.equal(ctx.audit.filter((event) => event.accion === 'LOGIN').length, 1);
});
