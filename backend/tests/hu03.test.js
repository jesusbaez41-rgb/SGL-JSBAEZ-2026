const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createMocker } = require('./helpers/mock');
const { isValidSubred, validateCreateLab } = require('../src/modules/labs/labs.validators');

const LABS_SERVICE = path.join(__dirname, '../src/modules/labs/labs.service.js');
const EQUIPMENT_SERVICE = path.join(__dirname, '../src/modules/equipment/equipment.service.js');

const LAB_ID = '22222222-2222-4222-8222-222222222222';
const EQUIPO_ID = '33333333-3333-4333-8333-333333333333';

function request() {
  return {
    user: { id: '11111111-1111-4111-8111-111111111111', uid: 'atecnico', rol: 'ADMIN_TECNICO' },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function makeLab(overrides = {}) {
  const lab = {
    id: LAB_ID,
    nombre: 'Lab Redes',
    ubicacion: 'Piso 2',
    subred: '192.168.10.0/24',
    equipos: [{ id: EQUIPO_ID, laboratorio_id: LAB_ID }],
    lastUpdate: null,
    async update(changes) {
      Object.assign(this, changes);
      this.lastUpdate = changes;
      return this;
    },
  };
  return Object.assign(lab, overrides);
}

function makeEquipo(data) {
  return {
    id: EQUIPO_ID,
    ...data,
    toJSON() {
      const { toJSON, ...plain } = this;
      return plain;
    },
  };
}

async function expectError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

function setupLabs(options = {}) {
  const mocker = createMocker(LABS_SERVICE);
  const audit = [];
  const saved = [];
  const queryCalls = [];

  const Laboratorio = {
    findOne: async ({ where }) => {
      if (!options.existingLab) return null;
      return options.existingLab(where);
    },
    findByPk: async (id) => (options.lab ? options.lab(id) : null),
    create: async (data) => {
      saved.push(data);
      return makeLab({ ...data, id: options.newId || LAB_ID });
    },
  };

  const sequelize = {
    query: async (sql, opts) => {
      queryCalls.push({ sql, opts });
      return options.rows || [];
    },
  };

  mocker.mock('../../models', { sequelize, Laboratorio });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
  });

  const service = mocker.load();
  return {
    service,
    audit,
    saved,
    queryCalls,
    restore: () => mocker.restore(),
  };
}

function setupEquipment(options = {}) {
  const mocker = createMocker(EQUIPMENT_SERVICE);
  const audit = [];
  const created = [];
  const updates = [];
  const warnings = [];
  const queryCalls = [];

  const Laboratorio = {
    findByPk: async (id) => (options.lab ? options.lab(id) : null),
  };

  const Equipo = {
    findOne: async ({ where }) => (options.duplicate ? options.duplicate(where) : null),
    create: async (data) => {
      created.push(data);
      return makeEquipo(data);
    },
    findByPk: async () => options.equipo || null,
    findAll: async () => options.equipos || [],
    update: async (changes) => {
      updates.push(changes);
      return [1];
    },
  };

  const sequelize = {
    query: async (sql, opts) => {
      queryCalls.push({ sql, opts });
      return options.rows || [];
    },
  };

  const meshcentral = {
    fetchDevices: async () => {
      if (options.meshError) throw options.meshError;
      return options.devices || [];
    },
  };

  mocker.mock('../../models', { sequelize, Equipo, Laboratorio });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
  });
  mocker.mock('./meshcentral.service', meshcentral);
  mocker.mock('../../utils/logger', {
    warn: (...args) => warnings.push(args),
    error: () => {},
    info: () => {},
  });

  const service = mocker.load();
  return {
    service,
    audit,
    created,
    updates,
    warnings,
    queryCalls,
    restore: () => mocker.restore(),
  };
}

test('PU-COM03-01 registro de metadatos de laboratorio (CA-01)', async (t) => {
  const ctx = setupLabs();
  t.after(() => ctx.restore());

  const lab = await ctx.service.create(request(), {
    nombre: 'Lab Redes',
    ubicacion: 'Piso 2',
    subred: '192.168.10.0/24',
  });

  assert.equal(ctx.saved.length, 1);
  assert.equal(ctx.saved[0].nombre, 'Lab Redes');
  assert.equal(ctx.saved[0].ubicacion, 'Piso 2');
  assert.equal(ctx.saved[0].subred, '192.168.10.0/24');
  assert.equal(lab.id, LAB_ID);
  assert.ok(ctx.audit.some((event) => event.accion === 'CREAR'));
});

test('PU-COM03-02 validación de formato de subred (CA-02)', async () => {
  assert.equal(isValidSubred('192.168.10.0/24'), true);
  assert.equal(isValidSubred('192.168.10.999/24'), false);
  assert.equal(isValidSubred('192.168.10.0'), false);

  const invalidCidr = validateCreateLab({
    nombre: 'Lab Redes',
    ubicacion: 'Piso 2',
    subred: '192.168.10.999/24',
  });
  const missingMask = validateCreateLab({
    nombre: 'Lab Redes',
    ubicacion: 'Piso 2',
    subred: '192.168.10.0',
  });

  assert.ok(invalidCidr.some((message) => message.includes('subred')));
  assert.ok(missingMask.some((message) => message.includes('subred')));

  const ctx = setupLabs();
  try {
    await expectError(
      ctx.service.create(request(), {
        nombre: 'Lab Redes',
        ubicacion: 'Piso 2',
        subred: '192.168.10.999/24',
      }),
      400,
      'SUBRED_INVALIDA',
    );
    assert.equal(ctx.saved.length, 0);
  } finally {
    ctx.restore();
  }
});

test('PU-COM03-03 listado ordenado de laboratorios (CA-03)', async (t) => {
  const rows = [
    { id: LAB_ID, nombre: 'Lab Software', ubicacion: 'Piso 3', subred: '192.168.30.0/24', equipos: 2 },
    { id: '44444444-4444-4444-8444-444444444444', nombre: 'Lab Hardware', ubicacion: 'Piso 2', subred: '192.168.20.0/24', equipos: 5 },
    { id: '55555555-5555-4555-8555-555555555555', nombre: 'Lab Redes', ubicacion: 'Piso 1', subred: '192.168.10.0/24', equipos: 8 },
  ];
  const snapshot = JSON.parse(JSON.stringify(rows));
  const ctx = setupLabs({ rows });
  t.after(() => ctx.restore());

  const result = await ctx.service.list(request());

  assert.deepEqual(
    result.map((lab) => lab.nombre),
    ['Lab Hardware', 'Lab Redes', 'Lab Software'],
  );
  assert.equal(result[0].equipos, 5);
  assert.ok(result[0].subred);
  assert.deepEqual(rows, snapshot, 'el listado no debe mutar los datos de origen');
  assert.ok(ctx.queryCalls[0].sql.includes('ORDER BY l.nombre ASC'));
});

test('PU-COM03-04 equipo requiere laboratorio existente (CA-04)', async () => {
  const payload = {
    laboratorio_id: LAB_ID,
    mac_address: 'AA:BB:CC:DD:EE:01',
    hostname: 'LAB-PC-01',
  };

  let ctx = setupEquipment({ lab: () => null });
  try {
    await expectError(ctx.service.create(request(), { ...payload, laboratorio_id: null }), 404, 'LAB_NO_ENCONTRADO');
    await expectError(
      ctx.service.create(request(), { ...payload, laboratorio_id: '99999999-9999-4999-8999-999999999999' }),
      404,
      'LAB_NO_ENCONTRADO',
    );
    assert.equal(ctx.created.length, 0);
  } finally {
    ctx.restore();
  }

  ctx = setupEquipment({ lab: (id) => (id === LAB_ID ? makeLab() : null) });
  try {
    const equipo = await ctx.service.create(request(), payload);
    assert.equal(ctx.created.length, 1);
    assert.equal(ctx.created[0].laboratorio_id, LAB_ID);
    assert.equal(equipo.laboratorio_id, LAB_ID);
  } finally {
    ctx.restore();
  }
});

test('PU-COM03-05 unicidad de MAC y hostname (CA-05)', async () => {
  const payload = {
    laboratorio_id: LAB_ID,
    mac_address: 'AA:BB:CC:DD:EE:01',
    hostname: 'LAB-PC-01',
  };

  let ctx = setupEquipment({
    lab: () => makeLab(),
    duplicate: (where) => (where.mac_address ? { id: 'otro-equipo' } : null),
  });
  try {
    await expectError(ctx.service.create(request(), payload), 409, 'MAC_DUPLICADA');
    assert.equal(ctx.created.length, 0);
  } finally {
    ctx.restore();
  }

  ctx = setupEquipment({
    lab: () => makeLab(),
    duplicate: (where) => (where.hostname ? { id: 'otro-equipo' } : null),
  });
  try {
    await expectError(ctx.service.create(request(), payload), 409, 'HOSTNAME_DUPLICADO');
    assert.equal(ctx.created.length, 0);
  } finally {
    ctx.restore();
  }
});

test('PU-COM03-06 monitoreo de estado con MeshCentral (CA-06)', async (t) => {
  const rows = [{
    id: EQUIPO_ID,
    mac_address: 'AA:BB:CC:DD:EE:01',
    hostname: 'lab-pc-01',
    ip_address: null,
    laboratorio_id: LAB_ID,
    laboratorio_nombre: 'Lab Redes',
    estado: 'APAGADO',
    mesh_agent_id: 'node/1',
    ultimo_reporte: null,
    usuario_uid: null,
    usuario_nombre: null,
  }];
  const devices = [{
    nodeid: 'node/1',
    hostname: 'lab-pc-01',
    estado: 'ENCENDIDO',
    ip_address: '192.168.10.25',
    ultimo_reporte: '2026-11-05T12:00:00.000Z',
    usuario_actual: 'jperez',
  }];
  const ctx = setupEquipment({ rows, devices });
  t.after(() => ctx.restore());

  const result = await ctx.service.list(request());

  assert.equal(result[0].estado, 'ENCENDIDO');
  assert.equal(result[0].ip_address, '192.168.10.25');
  assert.equal(result[0].usuario_actual, 'jperez');
  assert.equal(result[0].mesh_source, 'MESHCENTRAL');
  assert.equal(ctx.created.length, 0, 'el inventario no debe crear equipos');
  assert.equal(ctx.updates.length, 0, 'el usuario activo no se persiste en PostgreSQL');
});

test('PU-COM03-07 error de MeshCentral no rompe el listado (CA-06)', async (t) => {
  const rows = [{
    id: EQUIPO_ID,
    mac_address: 'AA:BB:CC:DD:EE:01',
    hostname: 'lab-pc-01',
    ip_address: '192.168.10.30',
    laboratorio_id: LAB_ID,
    laboratorio_nombre: 'Lab Redes',
    estado: 'DESCONOCIDO',
    mesh_agent_id: 'node/1',
    ultimo_reporte: null,
    usuario_uid: null,
    usuario_nombre: null,
  }];
  const ctx = setupEquipment({
    rows,
    meshError: new Error('timeout agotado'),
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.list(request());

  assert.equal(result.length, 1);
  assert.equal(result[0].mesh_source, 'LOCAL');
  assert.equal(result[0].estado, 'DESCONOCIDO');
  assert.equal(JSON.stringify(result).includes('timeout agotado'), false);
  assert.equal(ctx.warnings.length, 1);
  assert.equal(ctx.warnings[0][0].includes('MeshCentral'), true);
});

test('PU-COM03-08 edición de laboratorio sin romper equipos (CA-01/CA-04)', async (t) => {
  const lab = makeLab();
  const ctx = setupLabs({ lab: (id) => (id === LAB_ID ? lab : null) });
  t.after(() => ctx.restore());

  const updated = await ctx.service.update(request(), LAB_ID, { ubicacion: 'Piso 3' });

  assert.equal(updated.ubicacion, 'Piso 3');
  assert.equal(updated.id, LAB_ID);
  assert.equal(updated.equipos.length, 1);
  assert.equal(updated.equipos[0].laboratorio_id, LAB_ID);
  assert.ok(ctx.audit.some((event) => event.accion === 'ACTUALIZAR'));

  const before = lab.lastUpdate;
  await expectError(
    ctx.service.update(request(), LAB_ID, { subred: '192.168.10.999/24' }),
    400,
    'SUBRED_INVALIDA',
  );
  assert.equal(lab.lastUpdate, before);
  assert.equal(lab.equipos[0].laboratorio_id, LAB_ID);
});
