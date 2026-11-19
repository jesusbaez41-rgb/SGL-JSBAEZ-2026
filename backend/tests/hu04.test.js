const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createMocker } = require('./helpers/mock');

const EQUIPMENT_SERVICE = path.join(
  __dirname,
  '../src/modules/equipment/equipment.service.js',
);
const MESHCENTRAL_SERVICE = path.join(
  __dirname,
  '../src/modules/equipment/meshcentral.service.js',
);
const EQUIPMENT_SYNC = path.join(
  __dirname,
  '../src/modules/equipment/equipment.sync.js',
);

const { normalizeDevice } = require('../src/modules/equipment/meshcentral.service');

const LAB_ID = '22222222-2222-4222-8222-222222222222';
const EQUIPMENT_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

function request(overrides = {}) {
  return {
    user: { id: ADMIN_ID, uid: 'atecnico', rol: 'ADMIN_TECNICO' },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    originalUrl: '/api/equipment/sync',
    query: {},
    body: {},
    ...overrides,
  };
}

function lab(overrides = {}) {
  return {
    id: LAB_ID,
    nombre: 'Laboratorio de Redes',
    subred: '192.168.100.0/24',
    ...overrides,
  };
}

function device(overrides = {}) {
  return {
    nodeid: 'node/mesh/abc',
    hostname: 'sgl-win',
    mac_address: '08:00:27:DB:58:6E',
    ip_address: '192.168.100.100',
    estado: 'ENCENDIDO',
    ultimo_reporte: '2026-11-05T17:11:49.418Z',
    usuario_actual: 'CLOCKWORK\\luan',
    osdesc: 'Microsoft Windows 10 Pro - 22H2/19045',
    groupname: 'SGL-Lab',
    ...overrides,
  };
}

function makeEquipo(data) {
  return {
    id: data.id || EQUIPMENT_ID,
    ...data,
    updateCalls: [],
    async update(changes) {
      this.updateCalls.push(changes);
      Object.assign(this, changes);
      return this;
    },
    toJSON() {
      const { updateCalls, update, toJSON, ...plain } = this;
      return plain;
    },
  };
}

function setup(options = {}) {
  const mocker = createMocker(EQUIPMENT_SERVICE);
  const audit = [];
  const created = [];
  const queryCalls = [];
  const warnings = [];
  const errors = [];
  const equipos = options.equipos ? [...options.equipos] : [];

  const Equipo = {
    findAll: async () => equipos,
    findOne: async ({ where }) => (options.findOne ? options.findOne(where) : null),
    findByPk: async (id) => (options.equipoById ? options.equipoById(id) : null),
    create: async (data) => {
      const equipo = makeEquipo({ ...data, id: data.id || `eq-${created.length + 1}` });
      created.push(data);
      equipos.push(equipo);
      return equipo;
    },
    update: async (changes) => {
      errors.push(changes);
      return [1];
    },
  };

  const Laboratorio = {
    findAll: async () => options.labs || [],
    findByPk: async (id) => (options.labById ? options.labById(id) : null),
  };

  const sequelize = {
    query: async (sql, opts) => {
      queryCalls.push({ sql, opts });
      return options.rows || [];
    },
  };

  const meshcentral = {
    isConfigured: () => options.configured !== false,
    fetchDevices: async () => {
      if (options.meshError) throw options.meshError;
      return options.devices === undefined ? null : options.devices;
    },
    getDevice: async () => null,
  };

  mocker.mock('../../models', { sequelize, Equipo, Laboratorio });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
  });
  mocker.mock('./meshcentral.service', meshcentral);
  mocker.mock('../../utils/logger', {
    warn: (...args) => warnings.push(args),
    error: (...args) => errors.push(args),
    info: () => {},
  });

  const service = mocker.load();
  return {
    service,
    audit,
    created,
    queryCalls,
    warnings,
    errors,
    equipos,
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

test('HU04-01 normaliza un dispositivo de MeshCentral con MAC desde netif2 (CA-02/CA-05/CA-07)', () => {
  const normalized = normalizeDevice({
    node: {
      _id: 'node/mesh/abc',
      name: 'SGL-WIN',
      conn: 1,
      users: ['CLOCKWORK\\luan'],
      osdesc: 'Microsoft Windows 10 Pro - 22H2/19045',
      groupname: 'SGL-Lab',
    },
    net: {
      defaultRouteIp: '192.168.100.100',
      netif2: {
        Ethernet: [
          {
            family: 'IPv4',
            address: '192.168.100.100',
            mac: '08:00:27:DB:58:6E',
            status: 'up',
          },
        ],
        Loopback: [
          {
            family: 'IPv4',
            address: '127.0.0.1',
            mac: '00:00:00:00:00:00',
            status: 'up',
          },
        ],
      },
    },
    lastConnect: { time: 1793898709418 },
  });

  assert.equal(normalized.nodeid, 'node/mesh/abc');
  assert.equal(normalized.hostname, 'sgl-win');
  assert.equal(normalized.mac_address, '08:00:27:DB:58:6E');
  assert.equal(normalized.ip_address, '192.168.100.100');
  assert.equal(normalized.estado, 'ENCENDIDO');
  assert.equal(normalized.usuario_actual, 'CLOCKWORK\\luan');
  assert.equal(normalized.osdesc, 'Microsoft Windows 10 Pro - 22H2/19045');
  assert.equal(normalized.groupname, 'SGL-Lab');
  assert.equal(normalized.ultimo_reporte, '2026-11-05T17:11:49.418Z');
});

test('HU04-02 fetchDevices consulta el bridge con la API key (CA-07)', async (t) => {
  const previousFetch = global.fetch;
  const mocker = createMocker(MESHCENTRAL_SERVICE);
  const env = {
    meshApiUrl: 'http://bridge:4444',
    meshApiToken: 'bridge-secret',
    meshApiTimeoutMs: 1000,
  };
  let fetchArgs = null;

  mocker.mock('../../config/env', env);
  mocker.mock('../../utils/logger', { warn: () => {}, error: () => {}, info: () => {} });
  global.fetch = async (url, options) => {
    fetchArgs = { url, options };
    return {
      ok: true,
      json: async () => ({
        devices: [
          {
            nodeid: 'node/1',
            hostname: 'sgl-win',
            mac_address: '08:00:27:DB:58:6E',
            ip_address: '192.168.100.100',
            estado: 'APAGADO',
            ultimo_reporte: '2026-11-05T17:11:49.418Z',
          },
        ],
      }),
    };
  };

  t.after(() => {
    global.fetch = previousFetch;
    mocker.restore();
  });

  const { fetchDevices } = mocker.load();
  const devices = await fetchDevices();

  assert.equal(fetchArgs.url, 'http://bridge:4444/devices');
  assert.equal(fetchArgs.options.headers['x-api-key'], 'bridge-secret');
  assert.equal(fetchArgs.options.headers.accept, 'application/json');
  assert.equal(devices.length, 1);
  assert.equal(devices[0].mac_address, '08:00:27:DB:58:6E');
  assert.equal(devices[0].estado, 'APAGADO');
  assert.equal(devices[0].ultimo_reporte, '2026-11-05T17:11:49.418Z');
});

test('HU04-03 fetchDevices falla de forma controlada si el bridge responde 502 (CA-09)', async (t) => {
  const previousFetch = global.fetch;
  const mocker = createMocker(MESHCENTRAL_SERVICE);
  mocker.mock('../../config/env', {
    meshApiUrl: 'http://bridge:4444',
    meshApiToken: 'secret',
    meshApiTimeoutMs: 1000,
  });
  mocker.mock('../../utils/logger', { warn: () => {}, error: () => {}, info: () => {} });
  global.fetch = async () => ({ ok: false, status: 502 });

  t.after(() => {
    global.fetch = previousFetch;
    mocker.restore();
  });

  const { fetchDevices } = mocker.load();
  await assert.rejects(fetchDevices(), /HTTP 502/);
});

test('HU04-04 registra una PC nueva e infiere el laboratorio por subred (CA-02/CA-04)', async (t) => {
  const ctx = setup({ devices: [device()], labs: [lab()] });
  t.after(() => ctx.restore());

  const summary = await ctx.service.syncFromMesh(request(), {});

  assert.equal(summary.creados, 1);
  assert.equal(summary.actualizados, 0);
  assert.equal(summary.total, 1);
  assert.equal(ctx.created.length, 1);
  assert.equal(ctx.created[0].mac_address, '08:00:27:DB:58:6E');
  assert.equal(ctx.created[0].hostname, 'sgl-win');
  assert.equal(ctx.created[0].ip_address, '192.168.100.100');
  assert.equal(ctx.created[0].laboratorio_id, LAB_ID);
  assert.equal(ctx.created[0].mesh_agent_id, 'node/mesh/abc');
  assert.equal(ctx.created[0].estado, 'ENCENDIDO');
  assert.ok(ctx.created[0].ultimo_reporte instanceof Date);

  assert.equal(ctx.audit.length, 1);
  assert.equal(ctx.audit[0].accion, 'ACTUALIZAR');
  assert.equal(ctx.audit[0].entidad, 'equipo');
  assert.equal(ctx.audit[0].detalle.operacion, 'SINCRONIZAR');
  assert.equal(ctx.audit[0].detalle.creados, 1);
});

test('HU04-05 actualiza una PC existente sin duplicarla (CA-05/CA-06)', async (t) => {
  const existing = makeEquipo({
    id: EQUIPMENT_ID,
    mac_address: '08:00:27:DB:58:6E',
    hostname: 'sgl-win',
    ip_address: '192.168.100.10',
    laboratorio_id: LAB_ID,
    estado: 'APAGADO',
    mesh_agent_id: null,
    ultimo_reporte: new Date('2026-11-05T16:00:00.000Z'),
  });
  const ctx = setup({ devices: [device()], equipos: [existing], labs: [lab()] });
  t.after(() => ctx.restore());

  const summary = await ctx.service.syncFromMesh(request(), {});

  assert.equal(summary.creados, 0);
  assert.equal(summary.actualizados, 1);
  assert.equal(ctx.created.length, 0);
  assert.equal(existing.updateCalls.length, 1);
  assert.equal(existing.updateCalls[0].estado, 'ENCENDIDO');
  assert.equal(existing.updateCalls[0].ip_address, '192.168.100.100');
  assert.equal(existing.updateCalls[0].mesh_agent_id, 'node/mesh/abc');
  assert.equal(
    existing.updateCalls[0].ultimo_reporte.toISOString(),
    '2026-11-05T17:11:49.418Z',
  );
  assert.equal(ctx.audit[0].detalle.actualizados, 1);
});

test('HU04-06 usa el laboratorio explícito aunque la IP no coincida (CA-04)', async (t) => {
  const otherLab = lab({ id: '99999999-9999-4999-8999-999999999999', subred: '10.0.0.0/8' });
  const ctx = setup({
    devices: [device({ ip_address: '10.20.30.40' })],
    labs: [lab()],
    labById: (id) => (id === otherLab.id ? otherLab : null),
  });
  t.after(() => ctx.restore());

  const summary = await ctx.service.syncFromMesh(request(), { laboratorioId: otherLab.id });

  assert.equal(summary.creados, 1);
  assert.equal(ctx.created[0].laboratorio_id, otherLab.id);
});

test('HU04-07 no crea PCs sin MAC, sin laboratorio o sin hostname (RN-001/CA-02)', async (t) => {
  const ctx = setup({
    devices: [
      device({ hostname: 'sin-mac', mac_address: null }),
      device({ hostname: 'fuera-de-subred', ip_address: '10.99.99.99' }),
      device({ hostname: '', mac_address: 'AA:BB:CC:DD:EE:01' }),
    ],
    labs: [lab()],
  });
  t.after(() => ctx.restore());

  const summary = await ctx.service.syncFromMesh(request(), {});

  assert.equal(summary.creados, 0);
  assert.equal(summary.sin_mac, 1);
  assert.equal(summary.sin_laboratorio, 1);
  assert.equal(summary.sin_hostname, 1);
  assert.equal(ctx.created.length, 0);
  assert.equal(summary.detalle.some((item) => item.motivo === 'SIN_MAC'), true);
  assert.equal(summary.detalle.some((item) => item.motivo === 'SIN_LABORATORIO'), true);
});

test('HU04-08 la sincronización repetida es idempotente (CA-06)', async (t) => {
  const ctx = setup({ devices: [device()], labs: [lab()] });
  t.after(() => ctx.restore());

  const first = await ctx.service.syncFromMesh(request(), {});
  const second = await ctx.service.syncFromMesh(request(), {});

  assert.equal(first.creados, 1);
  assert.equal(second.creados, 0);
  assert.equal(ctx.created.length, 1);
  assert.equal(ctx.equipos.length, 1);
});

test('HU04-09 lista por laboratorio con filtro SQL (CA-04)', async (t) => {
  const rows = [{
    id: EQUIPMENT_ID,
    hostname: 'sgl-win',
    mac_address: '08:00:27:DB:58:6E',
    ip_address: '192.168.100.100',
    laboratorio_id: LAB_ID,
    laboratorio_nombre: 'Laboratorio de Redes',
    estado: 'APAGADO',
    mesh_agent_id: 'node/mesh/abc',
    ultimo_reporte: '2026-11-05T17:11:49.418Z',
    usuario_uid: null,
    usuario_nombre: null,
  }];
  const ctx = setup({ rows, devices: [device()] });
  t.after(() => ctx.restore());

  const result = await ctx.service.list(
    request({ query: { laboratorio_id: LAB_ID } }),
  );

  assert.equal(result.length, 1);
  assert.equal(ctx.queryCalls[0].sql.includes('e.laboratorio_id = :labId'), true);
  assert.equal(ctx.queryCalls[0].opts.replacements.labId, LAB_ID);
  assert.equal(result[0].mesh_source, 'MESHCENTRAL');
  assert.equal(result[0].estado, 'ENCENDIDO');
  assert.equal(result[0].usuario_actual, 'CLOCKWORK\\luan');
  assert.equal(result[0].osdesc, 'Microsoft Windows 10 Pro - 22H2/19045');
});

test('HU04-10 aplica RN-017 en el listado del Docente (CA-04)', async (t) => {
  const ctx = setup({ rows: [], devices: [device()] });
  t.after(() => ctx.restore());

  await ctx.service.list(
    request({ user: { id: 'doc-1', uid: 'docente', rol: 'DOCENTE' } }),
  );

  assert.equal(ctx.queryCalls[0].sql.includes('sesion_activa s2'), true);
  assert.equal(ctx.queryCalls[0].sql.includes('asignacion_docente'), true);
  assert.equal(ctx.queryCalls[0].opts.replacements.docenteId, 'doc-1');
});

test('HU04-11 MeshCentral caído deja el listado en Desconocido (CA-09)', async (t) => {
  const rows = [{
    id: EQUIPMENT_ID,
    hostname: 'sgl-win',
    mac_address: '08:00:27:DB:58:6E',
    ip_address: '192.168.100.100',
    laboratorio_id: LAB_ID,
    laboratorio_nombre: 'Laboratorio de Redes',
    estado: 'ENCENDIDO',
    mesh_agent_id: 'node/mesh/abc',
    ultimo_reporte: '2026-11-05T17:11:49.418Z',
    usuario_uid: null,
    usuario_nombre: null,
  }];
  const ctx = setup({ rows, meshError: new Error('timeout') });
  t.after(() => ctx.restore());

  const result = await ctx.service.list(request());

  assert.equal(result[0].estado, 'DESCONOCIDO');
  assert.equal(result[0].mesh_source, 'LOCAL');
  assert.equal(result[0].mesh_error, true);
  assert.equal(result[0].mesh_encontrado, false);
  assert.equal(result[0].usuario_actual, null);
  assert.equal(ctx.warnings.length, 1);
  assert.equal(JSON.stringify(result).includes('timeout'), false);
});

test('HU04-12 refresh con MeshCentral caído devuelve Desconocido sin romper (CA-09)', async (t) => {
  const equipo = makeEquipo({
    id: EQUIPMENT_ID,
    mac_address: '08:00:27:DB:58:6E',
    hostname: 'sgl-win',
    ip_address: '192.168.100.100',
    laboratorio_id: LAB_ID,
    estado: 'ENCENDIDO',
    mesh_agent_id: 'node/mesh/abc',
    ultimo_reporte: new Date('2026-11-05T17:11:49.418Z'),
  });
  const rows = [{
    id: EQUIPMENT_ID,
    hostname: 'sgl-win',
    mac_address: '08:00:27:DB:58:6E',
    ip_address: '192.168.100.100',
    laboratorio_id: LAB_ID,
    laboratorio_nombre: 'Laboratorio de Redes',
    estado: 'DESCONOCIDO',
    mesh_agent_id: 'node/mesh/abc',
    ultimo_reporte: '2026-11-05T17:11:49.418Z',
    usuario_uid: null,
    usuario_nombre: null,
  }];
  const ctx = setup({
    rows,
    equipoById: (id) => (id === EQUIPMENT_ID ? equipo : null),
    meshError: new Error('timeout'),
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.refresh(request(), EQUIPMENT_ID);

  assert.equal(equipo.updateCalls.length, 1);
  assert.deepEqual(equipo.updateCalls[0], { estado: 'DESCONOCIDO' });
  assert.equal(result.estado, 'DESCONOCIDO');
  assert.equal(result.mesh_error, true);
  assert.equal(result.mesh_encontrado, false);
  assert.equal(ctx.audit[0].detalle.error, 'timeout');
  assert.equal(JSON.stringify(result).includes('timeout'), false);
});

test('HU04-13 refresh actualiza una PC encontrada en MeshCentral (CA-06)', async (t) => {
  const equipo = makeEquipo({
    id: EQUIPMENT_ID,
    mac_address: '08:00:27:DB:58:6E',
    hostname: 'sgl-win',
    ip_address: '192.168.100.10',
    laboratorio_id: LAB_ID,
    estado: 'APAGADO',
    mesh_agent_id: null,
    ultimo_reporte: null,
  });
  const rows = [{
    id: EQUIPMENT_ID,
    hostname: 'sgl-win',
    mac_address: '08:00:27:DB:58:6E',
    ip_address: '192.168.100.100',
    laboratorio_id: LAB_ID,
    laboratorio_nombre: 'Laboratorio de Redes',
    estado: 'ENCENDIDO',
    mesh_agent_id: 'node/mesh/abc',
    ultimo_reporte: '2026-11-05T17:11:49.418Z',
    usuario_uid: null,
    usuario_nombre: null,
  }];
  const ctx = setup({
    rows,
    equipoById: (id) => (id === EQUIPMENT_ID ? equipo : null),
    devices: [device()],
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.refresh(request(), EQUIPMENT_ID);

  assert.equal(equipo.updateCalls.length, 1);
  assert.equal(equipo.updateCalls[0].estado, 'ENCENDIDO');
  assert.equal(equipo.updateCalls[0].ip_address, '192.168.100.100');
  assert.equal(result.mesh_encontrado, true);
  assert.equal(result.estado, 'ENCENDIDO');
  assert.equal(ctx.audit[0].detalle.encontrado, true);
});

test('HU04-14 el job periódico sincroniza con un actor auditable (CA-08)', async (t) => {
  const mocker = createMocker(EQUIPMENT_SYNC);
  const calls = [];
  const admin = { id: ADMIN_ID, uid: 'atecnico', rol: 'ADMIN_TECNICO' };

  mocker.mock('../../config/env', {
    meshApiUrl: 'http://bridge:4444',
    meshSyncMinutes: 5,
    meshApiTimeoutMs: 1000,
  });
  mocker.mock('../../models', {
    Usuario: { findOne: async () => admin },
  });
  mocker.mock('./equipment.service', {
    syncFromMesh: async (req, options) => {
      calls.push({ req, options });
      return { total: 1, creados: 1, actualizados: 0, sin_laboratorio: 0, sin_mac: 0, errores: 0 };
    },
  });
  mocker.mock('../../utils/logger', {
    info: () => {},
    warn: () => {},
    error: () => {},
  });

  t.after(() => mocker.restore());

  const { runOnce } = mocker.load();
  const summary = await runOnce();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].req.user.id, ADMIN_ID);
  assert.equal(calls[0].req.user.rol, 'ADMIN_TECNICO');
  assert.deepEqual(calls[0].options, { background: true });
  assert.equal(summary.creados, 1);
});

test('HU04-15 el job periódico se omite si no hay usuario activo (CA-08)', async (t) => {
  const mocker = createMocker(EQUIPMENT_SYNC);
  let warned = 0;

  mocker.mock('../../config/env', {
    meshApiUrl: 'http://bridge:4444',
    meshSyncMinutes: 5,
    meshApiTimeoutMs: 1000,
  });
  mocker.mock('../../models', {
    Usuario: { findOne: async () => null },
  });
  mocker.mock('./equipment.service', {
    syncFromMesh: async () => {
      throw new Error('no debe llamarse');
    },
  });
  mocker.mock('../../utils/logger', {
    info: () => {},
    warn: () => {
      warned += 1;
    },
    error: () => {},
  });

  t.after(() => mocker.restore());

  const { runOnce } = mocker.load();
  const result = await runOnce();

  assert.equal(result, null);
  assert.equal(warned, 1);
});

test('HU04-16 sync sin MeshCentral configurado responde 503 (CA-07/CA-09)', async (t) => {
  const ctx = setup({ configured: false });
  t.after(() => ctx.restore());

  await expectError(ctx.service.syncFromMesh(request(), {}), 503, 'MESH_NO_CONFIGURADO');
  assert.equal(ctx.created.length, 0);
});
