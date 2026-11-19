const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { createMocker } = require('./helpers/mock');

const AUDIT_SERVICE = path.join(__dirname, '../src/modules/audit/audit.service.js');
const VALIDATORS = require('../src/modules/audit/audit.validators');
const PERMISSIONS = require('../src/config/permissions');

const USUARIO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LAB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EQUIPO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const AUDIT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function readMigration() {
  const candidatos = [
    path.join(__dirname, '../../db/migrations/10-hu12-auditoria.sql'),
    path.join(__dirname, '../db/migrations/10-hu12-auditoria.sql'),
  ];
  const encontrado = candidatos.find((item) => fs.existsSync(item));
  assert.ok(encontrado, 'No se encontró la migración 10-hu12-auditoria.sql');
  return fs.readFileSync(encontrado, 'utf8');
}

function request() {
  return {
    user: { id: USUARIO_ID, uid: 'atecnico', rol: 'ADMIN_TECNICO' },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function setup(options = {}) {
  const mocker = createMocker(AUDIT_SERVICE);
  const calls = { create: [], find: [] };
  const auditoria = {
    create: async (data) => {
      calls.create.push(data);
      return { id: AUDIT_ID, ...data };
    },
    findAndCountAll: async (query) => {
      calls.find.push(query);
      return {
        rows: options.rows || [],
        count: options.count ?? (options.rows || []).length,
      };
    },
  };

  const sequelize = {
    where: (left, right) => ({ tipo: 'where', left, right }),
    cast: (value, type) => ({ tipo: 'cast', value, type }),
    col: (name) => ({ tipo: 'col', name }),
  };

  mocker.mock('../../models', {
    EventoAutenticacion: {
      create: async () => ({}),
      findAll: async () => [],
    },
    Auditoria: auditoria,
    Usuario: { name: 'Usuario' },
    Laboratorio: { name: 'Laboratorio' },
    Equipo: { name: 'Equipo' },
    sequelize,
  });
  mocker.mock('../../utils/request', {
    clientIp: () => '192.168.100.50',
    userAgent: () => 'test-agent',
  });
  mocker.mock('../../utils/logger', {
    error: () => {},
    warn: () => {},
    info: () => {},
  });

  const service = mocker.load();
  return { service, calls, mocker };
}

test('HU12-01 registra actor, contexto e inmutabilidad (CA-02/CA-04)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.mocker.restore());

  await ctx.service.recordAuditEvent(request(), {
    accion: 'CREAR',
    entidad: 'equipo',
    entidadId: EQUIPO_ID,
    detalle: { hostname: 'pc-01', laboratorio_id: LAB_ID },
  });

  assert.equal(ctx.calls.create.length, 1);
  const event = ctx.calls.create[0];
  assert.equal(event.usuario_id, USUARIO_ID);
  assert.equal(event.accion, 'CREAR');
  assert.equal(event.entidad_afectada, 'equipo');
  assert.equal(event.entidad_id, EQUIPO_ID);
  assert.equal(event.laboratorio_id, LAB_ID);
  assert.equal(event.equipo_id, EQUIPO_ID);
  assert.equal(event.ip_origen, '192.168.100.50');
  assert.equal(event.inmutable, true);
});

test('HU12-02 deriva el laboratorio de la entidad y descarta UUID inválidos', async (t) => {
  const ctx = setup();
  t.after(() => ctx.mocker.restore());

  await ctx.service.recordAuditEvent(request(), {
    accion: 'ACTUALIZAR',
    entidad: 'laboratorio',
    entidadId: LAB_ID,
    detalle: { nombre: 'Laboratorio de Redes' },
  });
  await ctx.service.recordAuditEvent(request(), {
    accion: 'ACTUALIZAR',
    entidad: 'usuario',
    entidadId: USUARIO_ID,
    detalle: { laboratorio_id: 'no-es-uuid' },
  });

  assert.equal(ctx.calls.create[0].laboratorio_id, LAB_ID);
  assert.equal(ctx.calls.create[1].laboratorio_id, null);
  assert.equal(ctx.calls.create[1].equipo_id, null);
});

test('HU12-03 no registra eventos sin usuario actor (CA-04)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.mocker.restore());

  await ctx.service.recordAuditEvent({}, { accion: 'CREAR', entidad: 'grupo' });

  assert.equal(ctx.calls.create.length, 0);
});

test('HU12-04 consulta con paginación, orden e includes (CA-01/CA-02)', async (t) => {
  const ctx = setup({ rows: [{ id: AUDIT_ID }], count: 42 });
  t.after(() => ctx.mocker.restore());

  const resultado = await ctx.service.listAuditLogs({ limit: 20, offset: 40 });

  assert.equal(resultado.total, 42);
  assert.equal(resultado.limit, 20);
  assert.equal(resultado.offset, 40);
  assert.deepEqual(resultado.data, [{ id: AUDIT_ID }]);

  const query = ctx.calls.find[0];
  assert.equal(query.limit, 20);
  assert.equal(query.offset, 40);
  assert.equal(query.distinct, true);
  assert.deepEqual(
    query.include.map((item) => item.as),
    ['usuario', 'laboratorio', 'equipo'],
  );
  assert.deepEqual(query.order[0], ['fecha_evento', 'DESC']);
});

test('HU12-05 aplica acción, entidad, usuario, laboratorio, equipo, fechas y texto', async (t) => {
  const ctx = setup();
  t.after(() => ctx.mocker.restore());

  const desde = new Date('2026-11-01T00:00:00.000Z');
  const hasta = new Date('2026-11-15T23:59:59.999Z');
  await ctx.service.listAuditLogs({
    accion: 'CAMBIO_PERMISO',
    entidad: 'permiso_app_grupo',
    usuario: 'ana',
    laboratorioId: LAB_ID,
    equipoId: EQUIPO_ID,
    desde,
    hasta,
    q: '7-Zip',
  });

  const where = ctx.calls.find[0].where;
  const filtros = where[Op.and];
  assert.ok(Array.isArray(filtros));
  assert.ok(filtros.some((filtro) => filtro.accion === 'CAMBIO_PERMISO'));
  assert.ok(filtros.some((filtro) => filtro.entidad_afectada === 'permiso_app_grupo'));
  assert.ok(filtros.some((filtro) => filtro.laboratorio_id === LAB_ID));
  assert.ok(filtros.some((filtro) => filtro.equipo_id === EQUIPO_ID));

  const rango = filtros.find((filtro) => filtro.fecha_evento);
  assert.equal(rango.fecha_evento[Op.gte], desde);
  assert.equal(rango.fecha_evento[Op.lte], hasta);

  const porUsuario = filtros.find((filtro) => filtro[Op.or] && filtro[Op.or][0]['$usuario.uid$']);
  assert.ok(porUsuario);
  const porTexto = filtros.find(
    (filtro) => filtro[Op.or] && filtro[Op.or].some((item) => item.tipo === 'where'),
  );
  assert.ok(porTexto);
});

test('HU12-06 valida los filtros de consulta', () => {
  assert.deepEqual(VALIDATORS.validateList({}), []);
  assert.equal(VALIDATORS.validateList({ accion: 'BORRAR' }).length, 1);
  assert.equal(VALIDATORS.validateList({ laboratorio_id: 'abc' }).length, 1);
  assert.equal(VALIDATORS.validateList({ equipo_id: 'abc' }).length, 1);
  assert.equal(VALIDATORS.validateList({ desde: 'no-fecha' }).length, 1);
  assert.equal(
    VALIDATORS.validateList({ desde: '2026-11-16', hasta: '2026-11-15' }).length,
    1,
  );
  assert.deepEqual(
    VALIDATORS.validateList({
      accion: 'crear',
      entidad: 'equipo',
      usuario: 'ana',
      laboratorio_id: LAB_ID,
      equipo_id: EQUIPO_ID,
      desde: '2026-11-01',
      hasta: '2026-11-15',
      q: 'pc-01',
    }),
    [],
  );
});

test('HU12-07 normaliza paginación y fechas (CA-01)', () => {
  const params = VALIDATORS.parseList({
    limit: '999',
    offset: '-5',
    accion: 'crear',
    hasta: '2026-11-15',
  });
  assert.equal(params.limit, 200);
  assert.equal(params.offset, 0);
  assert.equal(params.accion, 'CREAR');
  assert.equal(params.hasta.getHours(), 23);
  assert.equal(params.hasta.getMinutes(), 59);
  assert.equal(params.desde, null);
});

test('HU12-08 la API no expone operaciones de modificación (CA-03/CA-05)', (t) => {
  const ctx = setup();
  t.after(() => ctx.mocker.restore());

  assert.equal(ctx.service.update, undefined);
  assert.equal(ctx.service.remove, undefined);
  assert.equal(ctx.service.delete, undefined);
  assert.equal(ctx.service.create, undefined);
});

test('HU12-09 la migración bloquea UPDATE/DELETE/TRUNCATE (CA-03/CA-05)', () => {
  const sql = readMigration();
  assert.ok(sql.includes('tg_auditoria_block_update'));
  assert.ok(sql.includes('tg_auditoria_block_delete'));
  assert.ok(sql.includes('tg_auditoria_block_truncate'));
  assert.ok(sql.includes('BEFORE TRUNCATE ON auditoria'));
  assert.ok(sql.includes('REVOKE ALL ON auditoria FROM sgl_app'));
  assert.ok(sql.includes('GRANT SELECT, INSERT ON auditoria TO sgl_app'));
});

test('HU12-10 el rol de aplicación solo lee e inserta auditoría (CA-06)', () => {
  const sql = readMigration();
  assert.ok(sql.includes('CREATE ROLE sgl_app LOGIN'));
  assert.ok(sql.includes('REVOKE ALL ON evento_autenticacion FROM sgl_app'));
  assert.ok(sql.includes('ALTER DEFAULT PRIVILEGES FOR ROLE sgl_user'));
});

test('HU12-12 puede excluir las sincronizaciones de inventario (CA-01)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.mocker.restore());

  await ctx.service.listAuditLogs({ excluirSincronizacion: true });

  const filtros = ctx.calls.find[0].where[Op.and];
  const filtroSync = filtros.find((filtro) => filtro.tipo === 'where' && filtro.right && filtro.right[Op.notILike]);
  assert.ok(filtroSync);
  assert.equal(VALIDATORS.parseList({ excluir_sincronizacion: 'true' }).excluirSincronizacion, true);
  assert.equal(VALIDATORS.parseList({ excluir_sincronizacion: '0' }).excluirSincronizacion, false);
});

test('HU12-11 el Admin Técnico puede consultar la auditoría (CA-01)', () => {
  assert.equal(PERMISSIONS.hasPermission('ADMIN_TECNICO', 'audit:read'), true);
  assert.equal(PERMISSIONS.hasPermission('ADMIN_ACADEMICO', 'audit:read'), true);
  assert.equal(PERMISSIONS.hasPermission('DOCENTE', 'audit:read'), false);
});
