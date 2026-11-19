const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createMocker } = require('./helpers/mock');

const POLICIES_SERVICE = path.join(__dirname, '../src/modules/policies/policies.service.js');
const { validatePermiso, validateGenerate } = require('../src/modules/policies/policies.validators');

const APP_ID = '11111111-1111-4111-8111-111111111111';
const APP2_ID = '22222222-2222-4222-8222-222222222222';
const LAB_ID = '33333333-3333-4333-8333-333333333333';
const GRUPO_ID = '44444444-4444-4444-8444-444444444444';
const GRUPO2_ID = '55555555-5555-4555-8555-555555555555';
const VINCULO_ID = '66666666-6666-4666-8666-666666666666';
const VINCULO2_ID = '77777777-7777-4777-8777-777777777777';
const EQUIPO_ON = '88888888-8888-4888-8888-888888888888';
const EQUIPO_OFF = '99999999-9999-4999-8999-999999999999';
const USUARIO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POLITICA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const SID_1A = 'S-1-5-21-1-2-3-1111';
const SID_1B = 'S-1-5-21-1-2-3-2222';

function request() {
  return {
    user: { id: USUARIO_ID, uid: 'atecnico', rol: 'ADMIN_TECNICO' },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    originalUrl: '/api/policies',
  };
}

function makeApp(data) {
  return {
    toJSON() {
      return {
        id: this.id,
        nombre: this.nombre,
        version: this.version,
        ruta_ejecutable: this.ruta_ejecutable,
      };
    },
    ...data,
  };
}

function makePolitica(data = {}) {
  return {
    id: data.id || POLITICA_ID,
    laboratorio_id: data.laboratorio_id || LAB_ID,
    generada_por: data.generada_por || USUARIO_ID,
    version: data.version || 'abc123',
    contenido: data.contenido || '<AppLockerPolicy />',
    resumen: data.resumen || null,
    fecha_generacion: data.fecha_generacion || new Date('2026-11-14T10:00:00.000Z'),
    toJSON() {
      return {
        id: this.id,
        laboratorio_id: this.laboratorio_id,
        generada_por: this.generada_por,
        version: this.version,
        contenido: this.contenido,
        resumen: this.resumen,
        fecha_generacion: this.fecha_generacion,
      };
    },
  };
}

function setup(options = {}) {
  const mocker = createMocker(POLICIES_SERVICE);
  const audit = [];
  const meshCalls = [];

  const grupos = options.grupos || [
    { id: GRUPO_ID, codigo: 'GRP-1A', descripcion: 'Primero A', samba_sid: SID_1A },
    { id: GRUPO2_ID, codigo: 'GRP-1B', descripcion: 'Primero B', samba_sid: SID_1B },
  ];
  const apps = options.apps || [
    makeApp({
      id: APP_ID,
      nombre: '7-Zip',
      version: '24.08',
      ruta_ejecutable: 'C:\\Program Files\\7-Zip\\7zFM.exe',
    }),
    makeApp({
      id: APP2_ID,
      nombre: 'Sin ruta',
      version: '1.0',
      ruta_ejecutable: null,
    }),
  ];
  const vinculos = options.vinculos || [
    { id: VINCULO_ID, app_id: APP_ID, laboratorio_id: LAB_ID, activo: true },
    { id: VINCULO2_ID, app_id: APP2_ID, laboratorio_id: LAB_ID, activo: true },
  ];
  const equipos = options.equipos || [
    {
      id: EQUIPO_ON,
      laboratorio_id: LAB_ID,
      hostname: 'pc-01',
      mac_address: '00:11:22:33:44:55',
      estado: 'ENCENDIDO',
      mesh_agent_id: 'node/on',
      toJSON() { return { ...this }; },
    },
    {
      id: EQUIPO_OFF,
      laboratorio_id: LAB_ID,
      hostname: 'pc-02',
      mac_address: '00:11:22:33:44:66',
      estado: 'APAGADO',
      mesh_agent_id: 'node/off',
      toJSON() { return { ...this }; },
    },
  ];

  const permisos = options.permisos ? [...options.permisos] : [];
  const politicas = options.politicas ? [...options.politicas] : [];
  const despliegues = options.despliegues ? [...options.despliegues] : [];
  const ejecuciones = options.ejecuciones ? [...options.ejecuciones] : [];

  const Aplicacion = {
    findAll: async () => apps,
    findByPk: async (id) => apps.find((a) => a.id === id) || null,
  };

  const VinculoAppLab = {
    findAll: async ({ where = {} } = {}) =>
      vinculos.filter(
        (v) =>
          (where.laboratorio_id === undefined || v.laboratorio_id === where.laboratorio_id) &&
          (where.id === undefined || where.id.includes(v.id)) &&
          (where.activo === undefined || v.activo === where.activo),
      ),
    findByPk: async (id) => vinculos.find((v) => v.id === id) || null,
  };

  const Grupo = {
    findAll: async () => grupos,
    findByPk: async (id) => grupos.find((g) => g.id === id) || null,
  };

  const Laboratorio = {
    findAll: async () => [{ id: LAB_ID, nombre: 'Laboratorio de Redes' }],
    findByPk: async (id) =>
      id === LAB_ID ? { id: LAB_ID, nombre: 'Laboratorio de Redes' } : null,
  };

  const PermisoAppGrupo = {
    findAll: async ({ where = {} } = {}) =>
      permisos.filter(
        (p) =>
          (where.vinculo_id === undefined ||
            (Array.isArray(where.vinculo_id)
              ? where.vinculo_id.includes(p.vinculo_id)
              : p.vinculo_id === where.vinculo_id)) &&
          (where.grupo_id === undefined ||
            (Array.isArray(where.grupo_id)
              ? where.grupo_id.includes(p.grupo_id)
              : p.grupo_id === where.grupo_id)) &&
          (where.habilitado === undefined || p.habilitado === where.habilitado),
      ),
    findOrCreate: async ({ where, defaults }) => {
      const existente = permisos.find(
        (p) => p.vinculo_id === where.vinculo_id && p.grupo_id === where.grupo_id,
      );
      if (existente) return [existente, false];
      const nuevo = {
        id: `permiso-${permisos.length + 1}`,
        vinculo_id: where.vinculo_id,
        grupo_id: where.grupo_id,
        habilitado: defaults.habilitado,
        fecha_config: new Date(),
        async update(changes) {
          Object.assign(this, changes);
          return this;
        },
      };
      permisos.push(nuevo);
      return [nuevo, true];
    },
  };

  const MembresiaGrupo = {
    findAll: async ({ where }) =>
      (options.membresias || []).filter((m) => m.usuario_id === where.usuario_id && m.activa),
  };

  const Usuario = {
    findByPk: async (id) =>
      id === USUARIO_ID
        ? { id: USUARIO_ID, uid: 'estudiante', nombre_completo: 'Estudiante Test' }
        : null,
  };

  const PoliticaEjecucion = {
    findOne: async ({ where }) =>
      ejecuciones.find(
        (e) => e.grupo_id === where.grupo_id && e.laboratorio_id === where.laboratorio_id,
      ) || null,
    create: async (data) => {
      const fila = { ...data, fecha_generacion: new Date() };
      ejecuciones.push(fila);
      return fila;
    },
  };

  const PoliticaLaboratorio = {
    findAll: async () => politicas,
    findByPk: async (id) => politicas.find((p) => p.id === id) || null,
    create: async (data) => {
      const politica = makePolitica({ ...data, id: POLITICA_ID });
      politicas.push(politica);
      return politica;
    },
  };

  const PoliticaDespliegue = {
    findAll: async ({ where } = {}) =>
      despliegues.filter((d) => !where || d.politica_id === where.politica_id),
    findOne: async ({ where }) =>
      despliegues.find(
        (d) => d.politica_id === where.politica_id && d.equipo_id === where.equipo_id,
      ) || null,
    findOrCreate: async ({ where, defaults }) => {
      const existente = despliegues.find(
        (d) => d.politica_id === where.politica_id && d.equipo_id === where.equipo_id,
      );
      if (existente) return [existente, false];
      const fila = {
        id: `despliegue-${despliegues.length + 1}`,
        politica_id: where.politica_id,
        equipo_id: where.equipo_id,
        estado: defaults.estado,
        mensaje_error: null,
        salida: null,
        intentos: defaults.intentos,
        fecha_reporte: null,
        async update(changes) {
          Object.assign(this, changes);
          return this;
        },
        toJSON() {
          return {
            id: this.id,
            politica_id: this.politica_id,
            equipo_id: this.equipo_id,
            estado: this.estado,
            mensaje_error: this.mensaje_error,
            salida: this.salida,
            intentos: this.intentos,
            fecha_reporte: this.fecha_reporte,
          };
        },
      };
      despliegues.push(fila);
      return [fila, true];
    },
  };

  const Equipo = {
    findAll: async ({ where = {} } = {}) =>
      equipos.filter(
        (e) =>
          (where.laboratorio_id === undefined || e.laboratorio_id === where.laboratorio_id) &&
          (where.id === undefined || where.id.includes(e.id)),
      ),
    findByPk: async (id) => equipos.find((e) => e.id === id) || null,
  };

  const mesh = {
    estados: async () => {
      if (options.meshError) throw options.meshError;
      const map = new Map();
      for (const equipo of equipos) {
        if (!equipo.mesh_agent_id) continue;
        const remoto = options.estadoRemoto
          ? options.estadoRemoto(equipo.mesh_agent_id)
          : null;
        map.set(equipo.mesh_agent_id, String((remoto && remoto.estado) || equipo.estado).toUpperCase());
      }
      return map;
    },
    aplicarPolitica: async (payload) => {
      meshCalls.push(payload);
      if (options.meshDeployError) throw options.meshDeployError;
      return { ok: true, codigo: 0, salida: 'SGL_EXITCODE=0' };
    },
  };

  mocker.mock('../../models', {
    Aplicacion,
    Equipo,
    Grupo,
    Laboratorio,
    MembresiaGrupo,
    PermisoAppGrupo,
    PoliticaDespliegue,
    PoliticaEjecucion,
    PoliticaLaboratorio,
    Usuario,
    VinculoAppLab,
  });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
  });
  mocker.mock('../deployments/deployments.mesh', mesh);

  const service = mocker.load();

  return {
    service,
    audit,
    meshCalls,
    grupos,
    apps,
    vinculos,
    equipos,
    permisos,
    politicas,
    despliegues,
    ejecuciones,
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

test('HU06-01 la matriz marca sin permiso por defecto (RN-008)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const matriz = await ctx.service.matriz(LAB_ID);
  assert.equal(matriz.grupos.length, 2);
  assert.equal(matriz.apps.length, 2);
  assert.equal(matriz.apps[0].permisos[GRUPO_ID], false);
  assert.equal(matriz.apps[0].permisos[GRUPO2_ID], false);
});

test('HU06-02 habilita un permiso y lo audita (RN-008/RN-010)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const resultado = await ctx.service.setPermiso(request(), {
    vinculo_id: VINCULO_ID,
    grupo_id: GRUPO_ID,
    habilitado: true,
  });

  assert.equal(resultado.habilitado, true);
  assert.equal(ctx.permisos.length, 1);
  assert.equal(ctx.audit.length, 1);
  assert.equal(ctx.audit[0].accion, 'CAMBIO_PERMISO');
  assert.equal(ctx.audit[0].entidad, 'permiso_app_grupo');
  assert.equal(ctx.audit[0].detalle.grupo, 'GRP-1A');
});

test('HU06-03 deshabilita un permiso existente', async (t) => {
  const ctx = setup({
    permisos: [
      {
        id: 'permiso-1',
        vinculo_id: VINCULO_ID,
        grupo_id: GRUPO_ID,
        habilitado: true,
        async update(changes) {
          Object.assign(this, changes);
          return this;
        },
      },
    ],
  });
  t.after(() => ctx.restore());

  const resultado = await ctx.service.setPermiso(request(), {
    vinculo_id: VINCULO_ID,
    grupo_id: GRUPO_ID,
    habilitado: false,
  });

  assert.equal(resultado.habilitado, false);
  assert.equal(ctx.permisos[0].habilitado, false);
});

test('HU06-04 rechaza permisos sobre un vinculo inactivo', async (t) => {
  const ctx = setup({
    vinculos: [{ id: VINCULO_ID, app_id: APP_ID, laboratorio_id: LAB_ID, activo: false }],
  });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.setPermiso(request(), {
      vinculo_id: VINCULO_ID,
      grupo_id: GRUPO_ID,
      habilitado: true,
    }),
    404,
    'VINCULO_NO_ENCONTRADO',
  );
});

test('HU06-05 los permisos efectivos son la union de los grupos (RN-013)', async (t) => {
  const ctx = setup({
    membresias: [
      { usuario_id: USUARIO_ID, grupo_id: GRUPO_ID, activa: true },
      { usuario_id: USUARIO_ID, grupo_id: GRUPO2_ID, activa: true },
    ],
    permisos: [
      { id: 'p1', vinculo_id: VINCULO_ID, grupo_id: GRUPO_ID, habilitado: true },
      { id: 'p2', vinculo_id: VINCULO_ID, grupo_id: GRUPO2_ID, habilitado: true },
      { id: 'p3', vinculo_id: VINCULO2_ID, grupo_id: GRUPO2_ID, habilitado: true },
    ],
  });
  t.after(() => ctx.restore());

  const efectivos = await ctx.service.efectivos(USUARIO_ID);
  assert.equal(efectivos.grupos.length, 2);
  assert.equal(efectivos.laboratorios.length, 1);
  assert.equal(efectivos.laboratorios[0].apps.length, 2);
  assert.equal(efectivos.laboratorios[0].laboratorio.nombre, 'Laboratorio de Redes');
});

test('HU06-06 sin grupos no hay permisos efectivos', async (t) => {
  const ctx = setup({ membresias: [] });
  t.after(() => ctx.restore());

  const efectivos = await ctx.service.efectivos(USUARIO_ID);
  assert.deepEqual(efectivos.grupos, []);
  assert.deepEqual(efectivos.laboratorios, []);
});

test('HU06-07 genera el XML con la regla y el SID del grupo (CA-07)', async (t) => {
  const ctx = setup({
    permisos: [
      { id: 'p1', vinculo_id: VINCULO_ID, grupo_id: GRUPO_ID, habilitado: true },
      { id: 'p2', vinculo_id: VINCULO2_ID, grupo_id: GRUPO_ID, habilitado: true },
    ],
  });
  t.after(() => ctx.restore());

  const politica = await ctx.service.generar(request(), LAB_ID);
  const xml = politica.contenido;

  assert.ok(xml.includes('<AppLockerPolicy Version="1">'));
  assert.ok(xml.includes('EnforcementMode="Enabled"'));
  assert.ok(xml.includes(`UserOrGroupSid="${SID_1A}"`));
  assert.ok(xml.includes('C:\\Program Files\\7-Zip\\7zFM.exe'));
  assert.ok(xml.includes('Action="Allow"'));
  assert.equal(politica.resumen.grupos.length, 2);
  assert.deepEqual(politica.resumen.apps_sin_ruta, ['Sin ruta']);
});

test('HU06-15 no bloquea componentes esenciales de Windows (CA-03)', async (t) => {
  const ctx = setup({
    permisos: [
      { id: 'p1', vinculo_id: VINCULO_ID, grupo_id: GRUPO_ID, habilitado: true },
    ],
  });
  t.after(() => ctx.restore());

  const xml = (await ctx.service.generar(request(), LAB_ID)).contenido;

  // Regla de publisher: todo lo firmado por Microsoft queda permitido.
  assert.ok(xml.includes('<FilePublisherRule'));
  assert.ok(xml.includes('O=MICROSOFT CORPORATION'));
  // Rutas del shell y de las apps del sistema.
  assert.ok(xml.includes('C:\\Windows\\System32\\*'));
  assert.ok(xml.includes('C:\\Windows\\SystemApps\\*'));
  assert.ok(xml.includes('C:\\Program Files\\WindowsApps\\*'));
});

test('HU06-16 configura la coleccion Appx para no bloquear el Inicio (CA-03)', async (t) => {
  const ctx = setup({
    permisos: [
      { id: 'p1', vinculo_id: VINCULO_ID, grupo_id: GRUPO_ID, habilitado: true },
    ],
  });
  t.after(() => ctx.restore());

  const xml = (await ctx.service.generar(request(), LAB_ID)).contenido;

  // Sin esta coleccion, AppLocker bloquea Inicio, busqueda y Configuracion (8027).
  assert.ok(xml.includes('<RuleCollection Type="Appx" EnforcementMode="Enabled">'));
  assert.ok(xml.includes('C:\\Program Files\\WindowsApps\\*'));
  assert.ok(xml.includes('C:\\Windows\\SystemApps\\*'));
  assert.ok(xml.includes('C:\\Windows\\ImmersiveControlPanel\\*'));
});

test('HU06-08 guarda la politica por grupo (CA-07)', async (t) => {
  const ctx = setup({
    permisos: [
      { id: 'p1', vinculo_id: VINCULO_ID, grupo_id: GRUPO_ID, habilitado: true },
    ],
  });
  t.after(() => ctx.restore());

  await ctx.service.generar(request(), LAB_ID);

  assert.equal(ctx.ejecuciones.length, 2);
  const delGrupo = ctx.ejecuciones.find((e) => e.grupo_id === GRUPO_ID);
  assert.ok(delGrupo.reglas_applocker.includes(SID_1A));
  assert.equal(delGrupo.version.length, 32);
});

test('HU06-09 audita la generacion de la politica (RN-010)', async (t) => {
  const ctx = setup({
    permisos: [
      { id: 'p1', vinculo_id: VINCULO_ID, grupo_id: GRUPO_ID, habilitado: true },
    ],
  });
  t.after(() => ctx.restore());

  await ctx.service.generar(request(), LAB_ID);

  const evento = ctx.audit.find((e) => e.entidad === 'politica');
  assert.ok(evento);
  assert.equal(evento.accion, 'EJECUTAR');
  assert.equal(evento.detalle.operacion, 'GENERAR');
});

test('HU06-10 despliega solo a los equipos encendidos (CA-08)', async (t) => {
  const ctx = setup({
    politicas: [
      makePolitica({
        id: POLITICA_ID,
        laboratorio_id: LAB_ID,
        contenido: '<AppLockerPolicy Version="1" />',
      }),
    ],
    estadoRemoto: (nodeid) => ({ estado: nodeid === 'node/on' ? 'ENCENDIDO' : 'APAGADO' }),
  });
  t.after(() => ctx.restore());

  await ctx.service.desplegar(request(), POLITICA_ID);
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(ctx.despliegues.length, 2);
  assert.equal(ctx.meshCalls.length, 1);
  assert.equal(ctx.meshCalls[0].nodeid, 'node/on');
  const enLinea = ctx.despliegues.find((d) => d.equipo_id === EQUIPO_ON);
  assert.equal(enLinea.estado, 'COMPLETADO');
});

test('HU06-11 audita el despliegue de la politica (CA-09)', async (t) => {
  const ctx = setup({
    politicas: [makePolitica({ id: POLITICA_ID, laboratorio_id: LAB_ID })],
  });
  t.after(() => ctx.restore());

  await ctx.service.desplegar(request(), POLITICA_ID);

  const evento = ctx.audit.find((e) => e.entidad === 'politica' && e.accion === 'DESPLEGAR');
  assert.ok(evento);
  assert.equal(evento.detalle.operacion, 'DESPLEGAR_POLITICA');
});

test('HU06-12 sin equipos no se puede desplegar', async (t) => {
  const ctx = setup({
    equipos: [],
    politicas: [makePolitica({ id: POLITICA_ID, laboratorio_id: LAB_ID })],
  });
  t.after(() => ctx.restore());

  await expectError(ctx.service.desplegar(request(), POLITICA_ID), 409, 'SIN_EQUIPOS');
});

test('HU06-13 escapa XML y genera GUID estable', () => {
  const ctx = setup();
  try {
    assert.equal(ctx.service.escapeXml('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;');
    const guid = ctx.service.guidEstable('grupo:app:ruta');
    assert.match(guid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(guid, ctx.service.guidEstable('grupo:app:ruta'));
  } finally {
    ctx.restore();
  }
});

test('HU06-14 valida los datos de entrada', () => {
  assert.ok(validatePermiso({}).some((m) => m.includes('vínculo')));
  assert.ok(validatePermiso({}).some((m) => m.includes('grupo')));
  assert.ok(
    validatePermiso({ vinculo_id: VINCULO_ID, grupo_id: GRUPO_ID, habilitado: 'si' }).some((m) =>
      m.includes('booleano'),
    ),
  );
  assert.deepEqual(
    validatePermiso({ vinculo_id: VINCULO_ID, grupo_id: GRUPO_ID, habilitado: true }),
    [],
  );
  assert.ok(validateGenerate({}).some((m) => m.includes('laboratorio')));
  assert.deepEqual(validateGenerate({ laboratorio_id: LAB_ID }), []);
});
