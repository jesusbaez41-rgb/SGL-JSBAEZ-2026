const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createMocker } = require('./helpers/mock');

const DEPLOYMENTS_SERVICE = path.join(__dirname, '../src/modules/deployments/deployments.service.js');
const { validateCreate, validateRetry } = require('../src/modules/deployments/deployments.validators');

const APP_ID = '11111111-1111-4111-8111-111111111111';
const LAB_ID = '22222222-2222-4222-8222-222222222222';
const EQUIPO_ON = '33333333-3333-4333-8333-333333333333';
const EQUIPO_OFF = '44444444-4444-4444-8444-444444444444';
const EQUIPO_SIN_AGENTE = '55555555-5555-4555-8555-555555555555';
const VINCULO_ID = '66666666-6666-4666-8666-666666666666';
const USUARIO_ID = '77777777-7777-4777-8777-777777777777';

function request() {
  return {
    user: { id: USUARIO_ID, uid: 'atecnico', rol: 'ADMIN_TECNICO' },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    originalUrl: '/api/deployments',
  };
}

function makeApp(overrides = {}) {
  return {
    id: APP_ID,
    nombre: 'Firefox',
    version: '128.0',
    ruta_instalador: '/opt/sgl-instaladores/firefox-128.0.msi',
    parametros_silenciosos: '/qn',
    checksum: 'a'.repeat(64),
    origen: 'upload',
    comando_desinstalacion: null,
    toJSON() {
      return {
        id: this.id,
        nombre: this.nombre,
        version: this.version,
        ruta_instalador: this.ruta_instalador,
        parametros_silenciosos: this.parametros_silenciosos,
        checksum: this.checksum,
        origen: this.origen,
        comando_desinstalacion: this.comando_desinstalacion,
      };
    },
    ...overrides,
  };
}

function makeLab(overrides = {}) {
  return {
    id: LAB_ID,
    nombre: 'Laboratorio de Redes',
    ...overrides,
    toJSON() {
      return { id: this.id, nombre: this.nombre };
    },
  };
}

function makeEquipo(overrides = {}) {
  return {
    id: EQUIPO_ON,
    hostname: 'pc-01',
    mac_address: '00:11:22:33:44:55',
    ip_address: '192.168.100.10',
    laboratorio_id: LAB_ID,
    estado: 'ENCENDIDO',
    mesh_agent_id: 'node/mesh/abc',
    ultimo_reporte: new Date('2026-11-12T10:00:00.000Z'),
    toJSON() {
      return {
        id: this.id,
        hostname: this.hostname,
        mac_address: this.mac_address,
        ip_address: this.ip_address,
        laboratorio_id: this.laboratorio_id,
        estado: this.estado,
        mesh_agent_id: this.mesh_agent_id,
      };
    },
    ...overrides,
  };
}

function makeVinculo(overrides = {}) {
  return {
    id: VINCULO_ID,
    app_id: APP_ID,
    laboratorio_id: LAB_ID,
    activo: true,
    version: '128.0',
    app_nombre: 'Firefox',
    toJSON() {
      return {
        id: this.id,
        app_id: this.app_id,
        laboratorio_id: this.laboratorio_id,
        activo: this.activo,
        version: this.version,
        app_nombre: this.app_nombre,
      };
    },
    ...overrides,
  };
}

function makeDespliegue(data = {}) {
  return {
    id: data.id || 'd0000000-0000-4000-8000-000000000001',
    vinculo_id: data.vinculo_id || VINCULO_ID,
    usuario_id: data.usuario_id || USUARIO_ID,
    tipo: data.tipo || 'INSTALAR',
    fecha_inicio: data.fecha_inicio || new Date('2026-11-12T10:00:00.000Z'),
    fecha_fin: data.fecha_fin || null,
    total_equipos: data.total_equipos || 0,
    updateCalls: [],
    async update(changes) {
      this.updateCalls.push(changes);
      Object.assign(this, changes);
      return this;
    },
    toJSON() {
      return {
        id: this.id,
        vinculo_id: this.vinculo_id,
        usuario_id: this.usuario_id,
        tipo: this.tipo,
        fecha_inicio: this.fecha_inicio,
        fecha_fin: this.fecha_fin,
        total_equipos: this.total_equipos,
      };
    },
  };
}

function makeFila(data = {}) {
  return {
    id: data.id || 'f0000000-0000-4000-8000-000000000001',
    despliegue_id: data.despliegue_id || 'd0000000-0000-4000-8000-000000000001',
    equipo_id: data.equipo_id || EQUIPO_ON,
    estado: data.estado || 'PENDIENTE',
    fase: data.fase || null,
    salida: data.salida || null,
    mensaje_error: data.mensaje_error || null,
    intentos: data.intentos || 0,
    fecha_reporte: data.fecha_reporte || null,
    updateCalls: [],
    async update(changes) {
      this.updateCalls.push(changes);
      Object.assign(this, changes);
      return this;
    },
    toJSON() {
      return {
        id: this.id,
        despliegue_id: this.despliegue_id,
        equipo_id: this.equipo_id,
        estado: this.estado,
        fase: this.fase,
        salida: this.salida,
        mensaje_error: this.mensaje_error,
        intentos: this.intentos,
        fecha_reporte: this.fecha_reporte,
      };
    },
  };
}

function setup(options = {}) {
  const mocker = createMocker(DEPLOYMENTS_SERVICE);
  const audit = [];
  const meshCalls = [];

  const apps = options.apps ? [...options.apps] : [makeApp()];
  const labs = options.labs ? [...options.labs] : [makeLab()];
  const equipos = options.equipos
    ? [...options.equipos]
    : [
        makeEquipo(),
        makeEquipo({
          id: EQUIPO_OFF,
          hostname: 'pc-02',
          estado: 'APAGADO',
          mesh_agent_id: 'node/mesh/off',
        }),
      ];
  const vinculos = options.vinculos ? [...options.vinculos] : [makeVinculo()];
  const despliegues = options.despliegues ? [...options.despliegues] : [];
  const filas = options.filas ? [...options.filas] : [];

  let contadorDespliegue = 1;
  let contadorFila = 1;

  const Despliegue = {
    findAll: async () => despliegues,
    findByPk: async (id) => despliegues.find((d) => d.id === id) || null,
    create: async (data) => {
      const despliegue = makeDespliegue({
        ...data,
        id: `d0000000-0000-4000-8000-0000000000${String(contadorDespliegue++).padStart(2, '0')}`,
      });
      despliegues.push(despliegue);
      return despliegue;
    },
  };

  const DespliegueEquipo = {
    findAll: async ({ where = {} } = {}) =>
      filas.filter(
        (f) =>
          (!where.despliegue_id || f.despliegue_id === where.despliegue_id) &&
          (!where.equipo_id || f.equipo_id === where.equipo_id) &&
          (where.estado === undefined || f.estado === where.estado),
      ),
    create: async (data) => {
      const fila = makeFila({
        ...data,
        id: `f0000000-0000-4000-8000-0000000000${String(contadorFila++).padStart(2, '0')}`,
      });
      filas.push(fila);
      return fila;
    },
  };

  const Equipo = {
    findAll: async ({ where = {} } = {}) =>
      equipos.filter(
        (e) =>
          (!where.laboratorio_id || e.laboratorio_id === where.laboratorio_id) &&
          (!where.id || where.id.includes(e.id)),
      ),
    findByPk: async (id) => equipos.find((e) => e.id === id) || null,
  };

  const Laboratorio = {
    findAll: async () => labs,
    findByPk: async (id) => labs.find((l) => l.id === id) || null,
  };

  const Aplicacion = {
    findAll: async () => apps,
    findByPk: async (id) => apps.find((a) => a.id === id) || null,
  };

  const VinculoAppLab = {
    findAll: async () => vinculos,
    findByPk: async (id) => vinculos.find((v) => v.id === id) || null,
    findOne: async ({ where }) =>
      vinculos.find(
        (v) =>
          v.app_id === where.app_id &&
          v.laboratorio_id === where.laboratorio_id &&
          (where.activo === undefined || v.activo === where.activo),
      ) || null,
  };

  const mesh = {
    subir: async (payload) => {
      meshCalls.push({ fase: 'ENVIANDO', ...payload });
      if (options.subirError) throw options.subirError;
      if (options.subirResult) return options.subirResult;
      return {
        ok: true,
        rutaRemota: 'C:\\Windows\\Temp\\instalador.msi',
        nombreArchivo: 'instalador.msi',
        extension: '.msi',
        tamano: 2048,
      };
    },
    ejecutar: async (payload) => {
      meshCalls.push({ fase: 'EJECUTANDO', ...payload });
      if (options.ejecutarError) throw options.ejecutarError;
      if (options.ejecutarResult) return options.ejecutarResult;
      // La instalación se lanza desacoplada y el resultado se consulta aparte.
      return { ok: true, pendiente: true, codigo: null, salida: 'lanzada' };
    },
    resultado: async () => {
      if (options.resultadoResult) return options.resultadoResult;
      return { listo: true, ok: true, codigo: 0, salida: 'SGL_EXITCODE=0' };
    },
    estados: async () => {
      const map = new Map();
      for (const equipo of equipos) {
        if (!equipo.mesh_agent_id) continue;
        const remoto = options.estadoRemoto
          ? options.estadoRemoto(equipo.mesh_agent_id)
          : null;
        const estado = (remoto && remoto.estado) || equipo.estado;
        map.set(equipo.mesh_agent_id, String(estado || '').toUpperCase());
      }
      return map;
    },
    estadoEquipo: async (meshAgentId) => {
      if (options.estadoRemoto) return options.estadoRemoto(meshAgentId);
      const equipo = equipos.find((e) => e.mesh_agent_id === meshAgentId);
      return equipo ? { estado: equipo.estado, hostname: equipo.hostname } : null;
    },
  };

  const appsService = {
    assertAppLinked: async (laboratorioId, appId) => {
      if (options.sinVinculo) {
        const err = new Error('La aplicación no está vinculada al laboratorio.');
        err.status = 409;
        err.code = 'APP_NO_VINCULADA';
        throw err;
      }
      return { id: VINCULO_ID, laboratorio_id: laboratorioId, app_id: appId };
    },
  };

  mocker.mock('../../models', {
    Aplicacion,
    Despliegue,
    DespliegueEquipo,
    Equipo,
    Laboratorio,
    VinculoAppLab,
  });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
  });
  mocker.mock('../apps/apps.service', appsService);
  mocker.mock('./deployments.mesh', mesh);

  const service = mocker.load();

  return {
    service,
    audit,
    apps,
    labs,
    equipos,
    vinculos,
    despliegues,
    filas,
    meshCalls,
    restore: () => mocker.restore(),
  };
}

/** Deja resolver los despachos que se lanzan en segundo plano. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

async function expectError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

test('HU08-01 valida aplicación, laboratorio y tipo del despliegue', () => {
  const errors = validateCreate({});
  assert.ok(errors.some((m) => m.includes('aplicación')));
  assert.ok(errors.some((m) => m.includes('laboratorio')));
  assert.ok(validateCreate({ app_id: 'no-uuid', laboratorio_id: LAB_ID }).some((m) => m.includes('válida')));
  assert.ok(
    validateCreate({ app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'X' }).some((m) =>
      m.includes('INSTALAR'),
    ),
  );
  assert.deepEqual(validateCreate({ app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' }), []);
  assert.deepEqual(validateRetry({}), []);
  assert.ok(validateRetry({ equipo_id: 'xyz' }).some((m) => m.includes('equipo')));
});

test('HU08-02 rechaza desplegar una app no vinculada al laboratorio (CA-05/RN-002)', async (t) => {
  const ctx = setup({ sinVinculo: true });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.create(request(), { app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' }),
    409,
    'APP_NO_VINCULADA',
  );
  assert.equal(ctx.despliegues.length, 0);
});

test('HU08-03 crea una fila por equipo del laboratorio y audita (RN-003/RN-010)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const result = await ctx.service.create(request(), {
    app_id: APP_ID,
    laboratorio_id: LAB_ID,
    tipo: 'INSTALAR',
  });

  assert.equal(ctx.despliegues.length, 1);
  assert.equal(ctx.despliegues[0].tipo, 'INSTALAR');
  assert.equal(ctx.despliegues[0].total_equipos, 2);
  assert.equal(ctx.filas.length, 2);
  assert.equal(result.app.nombre, 'Firefox');
  assert.equal(result.laboratorio.nombre, 'Laboratorio de Redes');
  assert.equal(ctx.audit[0].accion, 'DESPLEGAR');
  assert.equal(ctx.audit[0].entidad, 'despliegue');
});

test('HU08-04 despacha a los equipos encendidos y los marca completados (CA-06/CA-11)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  await ctx.service.create(request(), { app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' });
  await flush();

  assert.equal(ctx.meshCalls.length, 2);
  assert.equal(ctx.meshCalls[0].fase, 'ENVIANDO');
  assert.equal(ctx.meshCalls[0].nodeid, 'node/mesh/abc');
  assert.equal(ctx.meshCalls[0].instalador, '/opt/sgl-instaladores/firefox-128.0.msi');
  assert.equal(ctx.meshCalls[1].fase, 'EJECUTANDO');
  assert.equal(ctx.meshCalls[1].tipo, 'INSTALAR');

  const encendidos = ctx.filas.filter((f) => f.equipo_id === EQUIPO_ON);
  assert.equal(encendidos[0].estado, 'COMPLETADO');
  assert.equal(encendidos[0].intentos, 1);
});

test('HU08-05 deja PENDIENTE el equipo apagado (CA-02)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  await ctx.service.create(request(), { app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' });
  await flush();

  const apagado = ctx.filas.find((f) => f.equipo_id === EQUIPO_OFF);
  assert.equal(apagado.estado, 'PENDIENTE');
  assert.equal(apagado.intentos, 0);
  assert.equal(ctx.meshCalls.length, 2);
});

test('HU08-06 un equipo sin agente MeshCentral queda pendiente con mensaje', async (t) => {
  const ctx = setup({
    equipos: [makeEquipo({ id: EQUIPO_SIN_AGENTE, mesh_agent_id: null })],
  });
  t.after(() => ctx.restore());

  await ctx.service.create(request(), { app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' });
  await flush();

  const fila = ctx.filas[0];
  assert.equal(fila.estado, 'PENDIENTE');
  assert.ok(fila.mensaje_error.includes('MeshCentral'));
  assert.equal(fila.fase, 'ESPERANDO');
  assert.equal(ctx.meshCalls.length, 0);
});

test('HU08-07 la desinstalación exige comando definido (CA-04)', async (t) => {
  const ctx = setup({
    apps: [makeApp({ ruta_instalador: '/opt/sgl-instaladores/vlc.exe' })],
  });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.create(request(), { app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'DESINSTALAR' }),
    400,
    'DESINSTALACION_NO_DEFINIDA',
  );
});

test('HU08-08 reintenta los equipos pendientes que ya estan encendidos (CA-08)', async (t) => {
  // pc-02 esta apagada al crear el despliegue y se enciende antes del reintento.
  let pc2Encendida = false;
  const ctx = setup({
    estadoRemoto: (meshAgentId) =>
      meshAgentId === 'node/mesh/off'
        ? { estado: pc2Encendida ? 'ENCENDIDO' : 'APAGADO', hostname: 'pc-02' }
        : { estado: 'ENCENDIDO', hostname: 'pc-01' },
  });
  t.after(() => ctx.restore());

  const pendienteAntes = await ctx.service.create(request(), {
    app_id: APP_ID,
    laboratorio_id: LAB_ID,
    tipo: 'INSTALAR',
  });
  await flush();
  assert.equal(pendienteAntes.resumen.PENDIENTE, 1);
  pc2Encendida = true;

  ctx.meshCalls.length = 0;

  const resultado = await ctx.service.retry(request(), pendienteAntes.id, {});
  await flush();

  // Solo se reintenta el equipo pendiente (pc-02): pc-01 ya estaba completo.
  assert.equal(resultado.reintentados, 1);
  assert.equal(resultado.pendientes, 0);
  assert.equal(ctx.meshCalls.length, 2);
  assert.equal(ctx.meshCalls[1].nodeid, 'node/mesh/off');
  const ultimo = ctx.audit[ctx.audit.length - 1];
  assert.equal(ultimo.accion, 'DESPLEGAR');
  assert.equal(ultimo.detalle.operacion, 'REINTENTAR');
});

test('HU08-08b un equipo pendiente que sigue apagado no se reintenta (CA-02)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const creado = await ctx.service.create(request(), {
    app_id: APP_ID,
    laboratorio_id: LAB_ID,
    tipo: 'INSTALAR',
  });
  await flush();
  ctx.meshCalls.length = 0;

  const resultado = await ctx.service.retry(request(), creado.id, {});
  await flush();

  assert.equal(resultado.reintentados, 0);
  assert.equal(resultado.pendientes, 1);
  assert.equal(ctx.meshCalls.length, 0);

  const pendiente = ctx.filas.find((f) => f.equipo_id === EQUIPO_OFF);
  assert.equal(pendiente.estado, 'PENDIENTE');
  assert.ok(pendiente.mensaje_error.includes('apagado'));
});

test('HU08-09 el barrido reintenta cuando el equipo se enciende (CA-02)', async (t) => {
  let pc2Encendida = false;
  const ctx = setup({
    estadoRemoto: (meshAgentId) =>
      meshAgentId === 'node/mesh/off'
        ? { estado: pc2Encendida ? 'ENCENDIDO' : 'APAGADO', hostname: 'pc-02' }
        : { estado: 'ENCENDIDO', hostname: 'pc-01' },
  });
  t.after(() => ctx.restore());

  await ctx.service.create(request(), { app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' });
  await flush();
  ctx.meshCalls.length = 0;
  pc2Encendida = true;

  const resumen = await ctx.service.sweep();
  await flush();

  assert.equal(resumen.equipos, 1);
  assert.equal(resumen.reintentados, 1);
  assert.equal(ctx.meshCalls.length, 2);
  assert.equal(ctx.meshCalls[1].nodeid, 'node/mesh/off');
});

test('HU08-10 resume el estado por equipo (CA-03)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const creado = await ctx.service.create(request(), {
    app_id: APP_ID,
    laboratorio_id: LAB_ID,
    tipo: 'INSTALAR',
  });
  await flush();

  const detalle = await ctx.service.get(creado.id);
  assert.equal(detalle.resumen.COMPLETADO, 1);
  assert.equal(detalle.resumen.PENDIENTE, 1);
  assert.equal(detalle.equipos.length, 2);
  assert.ok(detalle.equipos.every((e) => typeof e.hostname === 'string'));
});

test('HU08-11 cierra el despliegue cuando todos los equipos terminan', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const creado = await ctx.service.create(request(), {
    app_id: APP_ID,
    laboratorio_id: LAB_ID,
    tipo: 'INSTALAR',
  });
  await flush();

  const apagado = ctx.filas.find((f) => f.equipo_id === EQUIPO_OFF);
  await apagado.update({ estado: 'COMPLETADO' });
  await ctx.service.refrescarEstadoDespliegue(creado.id);

  const despliegue = ctx.despliegues[0];
  assert.ok(despliegue.fecha_fin instanceof Date);
});

test('HU08-12 un fallo de MeshCentral no es un despliegue fallido si el equipo está apagado', async (t) => {
  const ctx = setup({
    subirError: new Error('Device is not connected'),
    equipos: [makeEquipo({ estado: 'ENCENDIDO' })],
  });
  t.after(() => ctx.restore());

  await ctx.service.create(request(), { app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' });
  await flush();

  const fila = ctx.filas[0];
  assert.equal(fila.estado, 'PENDIENTE');
  assert.equal(fila.fase, 'ESPERANDO');
  assert.ok(fila.mensaje_error.includes('apagado'));
});

test('HU08-14 el bridge informa que el agente esta apagado y el equipo queda pendiente', async (t) => {
  const ctx = setup({
    ejecutarResult: { ok: false, codigo: null, equipoApagado: true },
    equipos: [makeEquipo({ estado: 'ENCENDIDO' })],
  });
  t.after(() => ctx.restore());

  await ctx.service.create(request(), { app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' });
  await flush();

  const fila = ctx.filas[0];
  assert.equal(fila.estado, 'PENDIENTE');
  assert.ok(fila.mensaje_error.includes('apagado'));
  assert.equal(fila.intentos, 1);
});

test('HU08-15 guarda la fase y la salida del comando remoto', async (t) => {
  const ctx = setup({
    ejecutarResult: { ok: true, codigo: 0, salida: 'SGL_EXITCODE=0\r\nInstalado' },
    equipos: [makeEquipo({ estado: 'ENCENDIDO' })],
  });
  t.after(() => ctx.restore());

  const creado = await ctx.service.create(request(), {
    app_id: APP_ID,
    laboratorio_id: LAB_ID,
    tipo: 'INSTALAR',
  });
  await flush();

  const detalle = await ctx.service.get(creado.id);
  const fila = detalle.equipos[0];
  assert.equal(fila.estado, 'COMPLETADO');
  assert.equal(fila.fase, 'FINALIZADO');
  assert.ok(fila.salida.includes('SGL_EXITCODE=0'));
});
