const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createMocker } = require('./helpers/mock');

const AUDIT_SERVICE = path.join(__dirname, '../src/modules/audit/audit.service.js');

function setup() {
  const mocker = createMocker(AUDIT_SERVICE);
  const authEvents = [];
  const businessEvents = [];

  const EventoAutenticacion = {
    create: async (data) => {
      authEvents.push(data);
      return { id: 'event-1', ...data };
    },
  };
  const Auditoria = {
    create: async (data) => {
      businessEvents.push(data);
      return { id: 'audit-1', ...data };
    },
  };

  mocker.mock('../../models', { EventoAutenticacion, Auditoria });
  mocker.mock('../../utils/request', {
    clientIp: () => '192.168.100.50',
    userAgent: () => 'vitest-agent',
  });
  mocker.mock('../../utils/logger', {
    error: () => {},
    warn: () => {},
    info: () => {},
  });

  const service = mocker.load();
  return { service, mocker, authEvents, businessEvents };
}

test('PU-18 registra login, fallo, acceso denegado y logout (CA-12)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.mocker.restore());

  const req = {};
  await ctx.service.recordAuthEvent(req, {
    usuarioId: 'user-1',
    uid: 'jperez',
    rol: 'DOCENTE',
    accion: 'LOGIN',
    resultado: 'EXITO',
    detalle: { jti: 'jti-1' },
  });
  await ctx.service.recordAuthEvent(req, {
    usuarioId: 'user-1',
    uid: 'jperez',
    rol: 'DOCENTE',
    accion: 'LOGIN_FALLIDO',
    resultado: 'FALLO',
    detalle: { motivo: 'CREDENCIALES_INVALIDAS' },
  });
  await ctx.service.recordAuthEvent(req, {
    usuarioId: 'user-1',
    uid: 'jperez',
    rol: 'DOCENTE',
    accion: 'ACCESO_DENEGADO',
    resultado: 'FALLO',
    detalle: { ruta: '/api/audit/events' },
  });
  await ctx.service.recordAuthEvent(req, {
    usuarioId: 'user-1',
    uid: 'jperez',
    rol: 'DOCENTE',
    accion: 'LOGOUT',
    resultado: 'EXITO',
    detalle: { jti: 'jti-1' },
  });

  assert.equal(ctx.authEvents.length, 4);
  assert.deepEqual(
    ctx.authEvents.map((event) => event.accion),
    ['LOGIN', 'LOGIN_FALLIDO', 'ACCESO_DENEGADO', 'LOGOUT'],
  );
  for (const event of ctx.authEvents) {
    assert.equal(event.ip_origen, '192.168.100.50');
    assert.equal(event.user_agent, 'vitest-agent');
    assert.equal(event.uid_intentado, 'jperez');
    assert.equal(event.rol, 'DOCENTE');
  }
  assert.equal(JSON.stringify(ctx.authEvents).includes('secreto'), false);
});

test('PU-18b registra auditoría de negocio con actor, IP y detalle (RN-010)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.mocker.restore());

  await ctx.service.recordAuditEvent(
    { user: { id: 'user-1', uid: 'atecnico', rol: 'ADMIN_TECNICO' } },
    {
      accion: 'CREAR',
      entidad: 'equipo',
      entidadId: 'equipo-1',
      detalle: { hostname: 'sgl-win' },
    },
  );

  assert.equal(ctx.businessEvents.length, 1);
  const event = ctx.businessEvents[0];
  assert.equal(event.usuario_id, 'user-1');
  assert.equal(event.accion, 'CREAR');
  assert.equal(event.entidad_afectada, 'equipo');
  assert.equal(event.entidad_id, 'equipo-1');
  assert.equal(event.ip_origen, '192.168.100.50');
  assert.equal(event.inmutable, true);
});
