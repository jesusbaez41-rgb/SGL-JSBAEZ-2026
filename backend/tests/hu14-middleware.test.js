const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createMocker } = require('./helpers/mock');
const { ENV, makeUser } = require('./helpers/auth');

const AUTH_MW = path.join(__dirname, '../src/middlewares/auth.middleware.js');
const RBAC_MW = path.join(__dirname, '../src/middlewares/rbac.middleware.js');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function makeSession(overrides = {}) {
  return {
    jti: 'jti-1',
    usuario_id: 'user-1',
    rol: 'DOCENTE',
    expira_en: new Date(Date.now() + 60 * 60 * 1000),
    ultima_actividad: new Date(),
    revocada_en: null,
    lastUpdate: null,
    async update(changes) {
      Object.assign(this, changes);
      this.lastUpdate = changes;
      return this;
    },
    ...overrides,
  };
}

function tokenFor(user, options = {}) {
  return jwt.sign(
    { sub: user.uid, uid: user.uid, rol: user.rol, jti: 'jti-1' },
    options.secret || ENV.jwtSecret,
    { expiresIn: options.expiresIn || '30m' },
  );
}

function setupAuthMiddleware({ user = makeUser(), session = makeSession() } = {}) {
  const mocker = createMocker(AUTH_MW);
  const audit = [];
  mocker.mock('../config/env', ENV);
  mocker.mock('../models', {
    Usuario: { findByPk: async () => user },
    SesionWeb: { findOne: async () => session },
  });
  mocker.mock('../modules/audit/audit.service', {
    recordAuthEvent: async (req, event) => audit.push(event),
  });
  const middleware = mocker.load();
  return { middleware, mocker, audit, user, session };
}

async function run(ctx, authorization) {
  const req = {
    headers: authorization ? { authorization } : {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    originalUrl: '/api/test',
  };
  const res = makeRes();
  let nextCalled = 0;
  const next = () => {
    nextCalled += 1;
  };
  await ctx.middleware(req, res, next);
  return { req, res, nextCalled };
}

test('PU-19 sin token, token inválido o expirado devuelve 401 (CA-13)', async () => {
  const ctx = setupAuthMiddleware();
  try {
    let result = await run(ctx, null);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, 0);

    result = await run(ctx, 'Bearer token-invalido');
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, 0);

    const expired = tokenFor(ctx.user, { expiresIn: '-1s' });
    result = await run(ctx, `Bearer ${expired}`);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, 0);
  } finally {
    ctx.mocker.restore();
  }
});

test('PU-22 token con rol manipulado es rechazado (CA-03/CA-13)', async () => {
  const ctx = setupAuthMiddleware();
  try {
    const manipulated = jwt.sign(
      { sub: ctx.user.uid, uid: ctx.user.uid, rol: 'ADMIN_ACADEMICO', jti: 'jti-1' },
      'firma-incorrecta',
      { expiresIn: '30m' },
    );
    const result = await run(ctx, `Bearer ${manipulated}`);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, 0);
  } finally {
    ctx.mocker.restore();
  }
});

test('PU-19b token válido permite continuar y carga req.user', async () => {
  const ctx = setupAuthMiddleware();
  try {
    const token = tokenFor(ctx.user);
    const result = await run(ctx, `Bearer ${token}`);
    assert.equal(result.res.statusCode, 200);
    assert.equal(result.nextCalled, 1);
    assert.equal(result.req.user.uid, 'jperez');
    assert.equal(result.req.user.rol, 'DOCENTE');
    assert.ok(Array.isArray(result.req.user.permisos));
  } finally {
    ctx.mocker.restore();
  }
});

test('PU-17 expiración por inactividad (CA-11)', async () => {
  const session = makeSession({
    ultima_actividad: new Date(Date.now() - 31 * 60 * 1000),
  });
  const ctx = setupAuthMiddleware({ session });
  try {
    const token = tokenFor(ctx.user);
    const result = await run(ctx, `Bearer ${token}`);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.res.body.code, 'SESION_EXPIRADA');
    assert.equal(result.nextCalled, 0);
    assert.equal(session.lastUpdate.motivo_revocacion, 'INACTIVIDAD');
  } finally {
    ctx.mocker.restore();
  }
});

test('PU-20 usuario inactivo es rechazado con 403 (CA-14)', async () => {
  const ctx = setupAuthMiddleware({ user: makeUser({ activo: false }) });
  try {
    const token = tokenFor(ctx.user);
    const result = await run(ctx, `Bearer ${token}`);
    assert.equal(result.res.statusCode, 403);
    assert.equal(result.res.body.code, 'USUARIO_INACTIVO');
    assert.equal(result.nextCalled, 0);
  } finally {
    ctx.mocker.restore();
  }
});

test('PU-21 usuario sin rol es rechazado con 403 (CA-14)', async () => {
  const ctx = setupAuthMiddleware({ user: makeUser({ rol: '' }) });
  try {
    const token = tokenFor(ctx.user);
    const result = await run(ctx, `Bearer ${token}`);
    assert.equal(result.res.statusCode, 403);
    assert.equal(result.res.body.code, 'ROL_NO_HABILITADO');
    assert.equal(result.nextCalled, 0);
  } finally {
    ctx.mocker.restore();
  }
});

test('PU-13 middleware RBAC responde 403 y no ejecuta el controlador (CA-08)', async () => {
  const mocker = createMocker(RBAC_MW);
  const audit = [];
  mocker.mock('../modules/audit/audit.service', {
    recordAuthEvent: async (req, event) => audit.push(event),
  });
  const { requirePermission } = mocker.load();

  try {
    const req = {
      user: {
        id: 'user-1',
        uid: 'docente',
        rol: 'DOCENTE',
        permisos: ['monitoring:read', 'equipment:read'],
      },
      method: 'GET',
      originalUrl: '/api/usuarios',
    };
    const res = makeRes();
    let nextCalled = 0;
    await requirePermission('audit:read')(req, res, () => {
      nextCalled += 1;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'ACCESO_DENEGADO');
    assert.equal(nextCalled, 0);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].accion, 'ACCESO_DENEGADO');
    assert.equal(audit[0].detalle.permiso_requerido, 'audit:read');
  } finally {
    mocker.restore();
  }
});
