const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Op } = require('sequelize');
const { createMocker } = require('./helpers/mock');

const SERVICE = path.join(__dirname, '../src/modules/whitelists/whitelists.service.js');
const CONFIG = require('../src/modules/whitelists/whitelists.config');
const DOMAIN = require('../src/modules/whitelists/whitelists.domain');
const {
  validateCrear,
  validateActualizar,
  validateSesion,
} = require('../src/modules/whitelists/whitelists.validators');

const GRUPO_A = '11111111-1111-4111-8111-111111111111';
const GRUPO_B = '22222222-2222-4222-8222-222222222222';
const LAB_ID = '33333333-3333-4333-8333-333333333333';
const USUARIO_ID = '44444444-4444-4444-8444-444444444444';
const USUARIO_SIN_GRUPO = '55555555-5555-4555-8555-555555555555';
const EQUIPO_ID = '66666666-6666-4666-8666-666666666666';
const EQUIPO_OFF = '77777777-7777-4777-8777-777777777777';
const SID_ESTUDIANTE = 'S-1-5-21-1-2-3-1128';
const LISTA_1 = '88888888-8888-4888-8888-888888888881';
const LISTA_2 = '88888888-8888-4888-8888-888888888882';
const LISTA_3 = '88888888-8888-4888-8888-888888888883';
const LISTA_4 = '88888888-8888-4888-8888-888888888884';

const SID_A = 'S-1-5-21-1-2-3-1111';
const SID_B = 'S-1-5-21-1-2-3-2222';

process.env.NAV_AGENT_KEY = 'clave-agente-test';
process.env.NAV_PROXY_HOST = '192.168.100.58';
process.env.NAV_PROXY_PORT = '3128';

function fila(data) {
  const row = {
    ...data,
    async update(changes) {
      Object.assign(this, changes);
      return this;
    },
    async destroy() {
      this.destruida = true;
      return this;
    },
    toJSON() {
      const { update, destroy, toJSON, ...resto } = this;
      return resto;
    },
  };
  return row;
}

function setup(options = {}) {
  const mocker = createMocker(SERVICE);
  const audit = [];
  const meshCalls = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-hu09-'));

  const grupos = options.grupos || [
    { id: GRUPO_A, codigo: 'GRP-1A', descripcion: 'Primero A', samba_sid: SID_A },
    { id: GRUPO_B, codigo: 'GRP-1B', descripcion: 'Primero B', samba_sid: SID_B },
  ];
  const laboratorios = options.laboratorios || [
    { id: LAB_ID, nombre: 'Laboratorio de Redes', subred: '192.168.100.0/24' },
  ];
  const equipos = options.equipos || [
    fila({
      id: EQUIPO_ID,
      laboratorio_id: LAB_ID,
      hostname: 'sgl-win',
      mac_address: '08:00:27:00:00:01',
      ip_address: '192.168.100.100',
      estado: 'ENCENDIDO',
      mesh_agent_id: 'node/on',
    }),
    fila({
      id: EQUIPO_OFF,
      laboratorio_id: LAB_ID,
      hostname: 'sgl-win-2',
      mac_address: '08:00:27:00:00:02',
      ip_address: '192.168.100.101',
      estado: 'APAGADO',
      mesh_agent_id: 'node/off',
    }),
  ];
  const listas = (options.listas || []).map((item) => fila(item));
  const sesiones = (options.sesiones || []).map((item) => fila(item));
  const configuraciones = [];
  const navegaciones = [];
  const despliegues = [];

  const usuarios = [
    {
      id: USUARIO_ID,
      uid: 'estudiante',
      nombre_completo: 'Estudiante Test',
      rol: 'ESTUDIANTE',
      activo: true,
      samba_sid: SID_ESTUDIANTE,
    },
    {
      id: USUARIO_SIN_GRUPO,
      uid: 'solo',
      nombre_completo: 'Sin Grupo',
      rol: 'ESTUDIANTE',
      activo: true,
      samba_sid: 'S-1-5-21-1-2-3-9999',
    },
  ];
  const membresias = options.membresias || [
    { usuario_id: USUARIO_ID, grupo_id: GRUPO_A, activa: true },
    { usuario_id: USUARIO_ID, grupo_id: GRUPO_B, activa: true },
  ];

  const Grupo = {
    findAll: async () => grupos,
    findByPk: async (id) => grupos.find((grupo) => grupo.id === id) || null,
  };

  const Laboratorio = {
    findAll: async () => laboratorios,
    findByPk: async (id) => laboratorios.find((lab) => lab.id === id) || null,
  };

  const Equipo = {
    findAll: async ({ where = {} } = {}) =>
      equipos.filter((equipo) => {
        if (where.laboratorio_id && equipo.laboratorio_id !== where.laboratorio_id) return false;
        if (Array.isArray(where.id) && !where.id.includes(equipo.id)) return false;
        return true;
      }),
    findOne: async ({ where = {} } = {}) => {
      const hostname = String(where.hostname ? where.hostname[Op.iLike] : '').toLowerCase();
      return equipos.find((equipo) => equipo.hostname.toLowerCase() === hostname) || null;
    },
    findByPk: async (id) => equipos.find((equipo) => equipo.id === id) || null,
  };

  const Usuario = {
    findByPk: async (id) => usuarios.find((usuario) => usuario.id === id) || null,
    findOne: async ({ where = {} } = {}) =>
      usuarios.find((usuario) => usuario.samba_sid === where.samba_sid) || null,
    findAll: async ({ where = {} } = {}) =>
      usuarios.filter((usuario) => {
        if (Array.isArray(where.id) && !where.id.includes(usuario.id)) return false;
        if (where.activo !== undefined && usuario.activo !== where.activo) return false;
        if (where.samba_sid !== undefined && !usuario.samba_sid) return false;
        return true;
      }),
  };

  const MembresiaGrupo = {
    findAll: async ({ where = {} } = {}) =>
      membresias.filter((m) => {
        if (where.usuario_id && m.usuario_id !== where.usuario_id) return false;
        if (where.activa !== undefined && m.activa !== where.activa) return false;
        return true;
      }),
  };

  const ListaBlancaUrl = {
    findAll: async ({ where = {} } = {}) =>
      listas.filter((item) => where.activa === undefined || item.activa === where.activa),
    findOne: async ({ where = {} } = {}) =>
      listas.find((item) => item.grupo_id === where.grupo_id && item.url === where.url) || null,
    findByPk: async (id) => listas.find((item) => item.id === id) || null,
    create: async (data) => {
      const nueva = fila({
        id: `lista-${listas.length + 1}`,
        fecha_alta: new Date(),
        updated_at: new Date(),
        ...data,
      });
      listas.push(nueva);
      return nueva;
    },
  };

  const ConfigFiltrado = {
    findOne: async ({ where = {} } = {}) =>
      configuraciones.find(
        (item) => item.grupo_id === where.grupo_id && item.laboratorio_id === where.laboratorio_id,
      ) || null,
    create: async (data) => {
      const nueva = fila({ id: `config-${configuraciones.length + 1}`, ...data });
      configuraciones.push(nueva);
      return nueva;
    },
  };

  const NavegacionLaboratorio = {
    create: async (data) => {
      const nueva = fila({
        id: crypto.randomUUID(),
        fecha_generacion: new Date(),
        ...data,
      });
      navegaciones.push(nueva);
      return nueva;
    },
    findAll: async () => navegaciones.slice().reverse(),
    findByPk: async (id) => navegaciones.find((item) => item.id === id) || null,
  };

  const NavegacionDespliegue = {
    findAll: async ({ where = {} } = {}) =>
      despliegues.filter((item) => !where.navegacion_id || item.navegacion_id === where.navegacion_id),
    findOne: async ({ where = {} } = {}) =>
      despliegues.find(
        (item) => item.navegacion_id === where.navegacion_id && item.equipo_id === where.equipo_id,
      ) || null,
    findOrCreate: async ({ where, defaults }) => {
      const existente = despliegues.find(
        (item) => item.navegacion_id === where.navegacion_id && item.equipo_id === where.equipo_id,
      );
      if (existente) return [existente, false];
      const nueva = fila({
        id: `desp-${despliegues.length + 1}`,
        navegacion_id: where.navegacion_id,
        equipo_id: where.equipo_id,
        estado: defaults.estado,
        mensaje_error: null,
        salida: null,
        intentos: defaults.intentos,
        fecha_reporte: null,
      });
      despliegues.push(nueva);
      return [nueva, true];
    },
  };

  const SesionActiva = {
    findAll: async ({ where = {} } = {}) =>
      sesiones.filter((item) => where.activa === undefined || item.activa === where.activa),
    create: async (data) => {
      const nueva = fila({
        id: `sesion-${sesiones.length + 1}`,
        hora_inicio: new Date(),
        ...data,
      });
      sesiones.push(nueva);
      return nueva;
    },
  };

  const mesh = {
    estados: async () => {
      const map = new Map();
      for (const equipo of equipos) {
        if (equipo.mesh_agent_id) map.set(equipo.mesh_agent_id, equipo.estado);
      }
      return map;
    },
    aplicarNavegacion: async (payload) => {
      meshCalls.push(payload);
      return { ok: true, codigo: 0, salida: 'SGL_EXITCODE=0' };
    },
  };

  mocker.mock('../../models', {
    ConfigFiltrado,
    Equipo,
    Grupo,
    Laboratorio,
    ListaBlancaUrl,
    MembresiaGrupo,
    NavegacionDespliegue,
    NavegacionLaboratorio,
    SesionActiva,
    Usuario,
  });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
  });
  mocker.mock('../deployments/deployments.mesh', mesh);
  mocker.mock('../apps/apps.paths', { installersDir: () => tmp });

  const service = mocker.load();

  return {
    service,
    audit,
    meshCalls,
    grupos,
    listas,
    sesiones,
    configuraciones,
    navegaciones,
    despliegues,
    equipos,
    tmp,
    restore: () => {
      mocker.restore();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

function request(overrides = {}) {
  return {
    user: { id: USUARIO_ID, uid: 'aacademico', rol: 'ADMIN_ACADEMICO' },
    headers: {},
    ip: '192.168.100.100',
    socket: { remoteAddress: '192.168.100.100' },
    method: 'POST',
    originalUrl: '/api/whitelists',
    ...overrides,
  };
}

function esperar(ms = 25) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('HU09-01 normaliza y valida dominios (RN-016)', () => {
  assert.equal(DOMAIN.normalizarDominio('https://es.wikipedia.org/wiki/Portada'), 'es.wikipedia.org');
  assert.equal(DOMAIN.normalizarDominio('HTTP://WWW.Ejemplo.COM:8080/x'), 'ejemplo.com');
  assert.equal(DOMAIN.normalizarDominio('*.moodle.org'), 'moodle.org');

  assert.equal(DOMAIN.esDominioValido('192.168.100.10'), false);
  assert.equal(DOMAIN.esDominioValido('http://10.0.0.5/'), false);
  assert.equal(DOMAIN.esDominioValido('localhost'), false);
  assert.equal(DOMAIN.esDominioValido('sin-punto'), false);
  assert.equal(DOMAIN.esDominioValido('ejemplo.com'), true);

  assert.deepEqual(DOMAIN.unirDominios(['B.com', 'a.com', 'b.com', '10.0.0.1']), [
    'a.com',
    'b.com',
  ]);
});

test('HU09-02 squid.conf: deny-by-default, unión de grupos y sin IP directa', () => {
  const { texto, resumen } = CONFIG.construirSquidConfig({
    proxy: { host: '192.168.100.58', port: 3128 },
    grupos: [
      { id: GRUPO_A, codigo: 'GRP-1A' },
      { id: GRUPO_B, codigo: 'GRP-1B' },
    ],
    listas: [
      { grupo_id: GRUPO_A, url: 'wikipedia.org' },
      { grupo_id: GRUPO_A, url: 'moodle.org' },
      { grupo_id: GRUPO_B, url: 'python.org' },
      { grupo_id: GRUPO_B, url: '10.0.0.5' },
      { grupo_id: GRUPO_B, url: 'malicioso.org\nauth_param bogus' },
    ],
    sesiones: [
      { ip: '192.168.100.100', grupo_ids: [GRUPO_A, GRUPO_B] },
      { ip: '192.168.100.101', grupo_ids: [GRUPO_A] },
    ],
  });

  assert.match(texto, /http_port 192\.168\.100\.58:3128/);
  assert.match(texto, /acl sgl_numeric_host dstdom_regex/);
  assert.match(texto, /http_access deny sgl_numeric_host/);
  // El host que pertenece a dos grupos recibe dos reglas (unión).
  const permitidas = texto.split('\n').filter((linea) => linea.startsWith('http_access allow sgl_g_'));
  assert.equal(permitidas.length, 2);
  assert.match(texto, /dstdomain [^\n]*\.google\.com/);
  assert.match(texto, /dstdomain [^\n]*\.moodle\.org/);
  assert.match(texto, /dstdomain [^\n]*\.wikipedia\.org/);
  assert.match(texto, /dstdomain [^\n]*\.python\.org/);
  // Nunca aparece una IP como dominio permitido ni una inyección de línea.
  assert.doesNotMatch(texto, /dstdomain[^\n]*10\.0\.0\.5/);
  assert.doesNotMatch(texto, /auth_param bogus/);
  // La última regla de acceso cierra todo.
  assert.match(texto, /http_access deny all/);
  assert.equal(resumen.dominios, 5);
  assert.equal(resumen.sesiones, 2);
});

test('HU09-03 squid.conf sin sesiones: nadie navega y se permiten recursos internos', () => {
  const { texto } = CONFIG.construirSquidConfig({
    proxy: { host: '192.168.100.58', port: 3128 },
    grupos: [{ id: GRUPO_A, codigo: 'GRP-1A' }],
    listas: [{ grupo_id: GRUPO_A, url: 'wikipedia.org' }],
    sesiones: [],
  });

  assert.doesNotMatch(texto, /^http_access allow sgl_g_/m);
  assert.match(texto, /http_access allow sgl_intranet/);
  assert.match(texto, /http_access allow sgl_interno/);
});

test('HU09-04 squidguard y PAC se generan solo con dominios válidos', () => {
  const squidguard = CONFIG.construirSquidGuard(
    { id: GRUPO_A, codigo: 'GRP-1A' },
    ['moodle.org', '10.0.0.9', '*.python.org'],
  );
  assert.match(squidguard, /dest sgl_grp_1a/);
  assert.match(squidguard, /pass sgl_grp_1a_[0-9a-f]+ !sgl_default all/);
  assert.match(squidguard, /#   moodle\.org/);
  assert.match(squidguard, /#   python\.org/);
  assert.doesNotMatch(squidguard, /10\.0\.0\.9/);

  const pac = CONFIG.construirPac({ host: '192.168.100.58', port: 3128 });
  assert.match(pac, /PROXY 192\.168\.100\.58:3128/);
  assert.match(pac, /clockwork\.local/);
});

test('HU09-05 script de PC: firewall por SID de usuario, proxy y exención de admin', () => {
  const script = CONFIG.construirScriptPc({
    usuarios: [
      { uid: '7533841', samba_sid: SID_A },
      { uid: 'estudiante2', samba_sid: SID_B },
    ],
    proxy: { host: '192.168.100.58', port: 3128 },
    agentKey: "clave'con'comillas",
    apiBase: 'http://192.168.100.58:8080/api',
    exencionAdmin: true,
  });

  // Windows Firewall exige SDDL en -LocalUser; un SID suelto es rechazado.
  assert.match(script, /\$sddl = "D:\(A;;CC;;;" \+ \$sid \+ "\)"/);
  assert.match(script, /-RemotePort \$web -RemoteAddress Internet -LocalUser \$sddl/);
  assert.match(script, /RemotePort 443 -RemoteAddress Internet -LocalUser \$sddl/);
  assert.match(script, /RemotePort 53/);
  assert.match(script, /RemotePort 1723/);
  assert.match(script, /S-1-5-21-1-2-3-1111/);
  assert.match(script, /S-1-5-21-1-2-3-2222/);
  assert.match(script, /S-1-5-32-544/);
  assert.match(script, /ProxyServer/);
  // La clave se escapa para PowerShell.
  assert.match(script, /clave''con''comillas/);
  assert.match(script, /\/navigation\/session/);

  // Sin usuarios no se crean reglas ni se bloquea a los administradores.
  const vacio = CONFIG.construirScriptPc({ usuarios: [], proxy: { host: 'h', port: 3128 } });
  assert.match(vacio, /\$usuariosSgl = @\(\)/);
});

test('HU09-06 validadores de alta, edición y sesión', () => {
  assert.deepEqual(validateCrear({ grupo_id: GRUPO_A, url: 'ejemplo.com' }), []);
  assert.ok(validateCrear({ grupo_id: 'x', url: 'ejemplo.com' }).length > 0);
  assert.ok(validateCrear({ grupo_id: GRUPO_A, url: '10.0.0.5' }).length > 0);
  assert.ok(validateCrear({ grupo_id: GRUPO_A }).length > 0);

  assert.deepEqual(validateActualizar({ activa: false }), []);
  assert.ok(validateActualizar({}).length > 0);
  assert.ok(validateActualizar({ activa: 'si' }).length > 0);

  assert.deepEqual(validateSesion({ hostname: 'pc', sid: SID_A }), []);
  assert.ok(validateSesion({ sid: SID_A }).length > 0);
});

test('HU09-07 alta de dominio: normaliza, audita y redespliega (CA-09)', async () => {
  const ctx = setup();
  try {
    const creada = await ctx.service.crear(
      request(),
      { grupo_id: GRUPO_A, url: 'https://es.wikipedia.org/wiki/Portada', descripcion: 'Wiki' },
    );
    assert.equal(creada.url, 'es.wikipedia.org');
    assert.equal(creada.descripcion, 'Wiki');
    assert.ok(ctx.audit.some((e) => e.accion === 'CREAR' && e.entidad === 'lista_blanca_url'));

    await esperar();
    const redeploy = ctx.audit.filter(
      (e) => e.accion === 'DESPLEGAR' && e.detalle && e.detalle.operacion === 'REDESPLEGUE_AUTOMATICO',
    );
    assert.equal(redeploy.length, 1);
    assert.equal(redeploy[0].detalle.motivo, 'ALTA_URL');
    // Solo el equipo encendido recibe la orden.
    assert.equal(ctx.meshCalls.length, 1);
    assert.equal(ctx.meshCalls[0].scriptFile, 'sgl-navegacion.ps1');
  } finally {
    ctx.restore();
  }
});

test('HU09-08 alta rechaza IP directa y duplicados', async () => {
  const ctx = setup({
    listas: [
      { id: LISTA_1, grupo_id: GRUPO_A, url: 'moodle.org', activa: true },
    ],
  });
  try {
    await assert.rejects(
      ctx.service.crear(request(), { grupo_id: GRUPO_A, url: 'http://10.1.2.3/x' }),
      (err) => err.status === 400 && err.code === 'URL_INVALIDA',
    );
    await assert.rejects(
      ctx.service.crear(request(), { grupo_id: GRUPO_A, url: 'https://moodle.org/login' }),
      (err) => err.status === 409 && err.code === 'URL_DUPLICADA',
    );
  } finally {
    ctx.restore();
  }
});

test('HU09-09 edición y baja auditan y redespliegan', async () => {
  const ctx = setup({
    listas: [{ id: LISTA_1, grupo_id: GRUPO_A, url: 'moodle.org', activa: true }],
  });
  try {
    const actualizada = await ctx.service.actualizar(request(), LISTA_1, { activa: false });
    assert.equal(actualizada.activa, false);
    assert.ok(ctx.audit.some((e) => e.accion === 'ACTUALIZAR'));

    await ctx.service.eliminar(request(), LISTA_1);
    assert.ok(ctx.audit.some((e) => e.accion === 'ELIMINAR' && e.entidad === 'lista_blanca_url'));
    assert.equal(ctx.listas[0].destruida, true);
  } finally {
    ctx.restore();
  }
});

test('HU09-10 lista efectiva: unión de los grupos del estudiante (RN-016)', async () => {
  const ctx = setup({
    listas: [
      { id: LISTA_1, grupo_id: GRUPO_A, url: 'moodle.org', activa: true },
      { id: LISTA_2, grupo_id: GRUPO_B, url: 'python.org', activa: true },
      { id: LISTA_3, grupo_id: GRUPO_B, url: 'moodle.org', activa: true },
      { id: LISTA_4, grupo_id: GRUPO_B, url: 'inactivo.org', activa: false },
    ],
  });
  try {
    const efectiva = await ctx.service.efectivas(USUARIO_ID);
    assert.deepEqual(efectiva.dominios, ['google.com', 'moodle.org', 'python.org']);
    assert.equal(efectiva.grupos.length, 2);
    assert.equal(efectiva.sin_grupo, false);

    const sinGrupo = await ctx.service.efectivas(USUARIO_SIN_GRUPO);
    assert.deepEqual(sinGrupo.dominios, []);
    assert.equal(sinGrupo.sin_grupo, true);
  } finally {
    ctx.restore();
  }
});

test('HU09-11 sesión del agente: registra IP y grupos (CA-04)', async () => {
  const ctx = setup({
    listas: [
      { id: LISTA_1, grupo_id: GRUPO_A, url: 'moodle.org', activa: true },
      { id: LISTA_2, grupo_id: GRUPO_B, url: 'python.org', activa: true },
    ],
  });
  try {
    await assert.rejects(
      ctx.service.sesionAgente(
        request({ headers: { 'x-agent-key': 'otra' } }),
        { hostname: 'sgl-win', sid: SID_ESTUDIANTE, ip: '192.168.100.100' },
      ),
      (err) => err.status === 401,
    );

    const respuesta = await ctx.service.sesionAgente(
      request({ headers: { 'x-agent-key': 'clave-agente-test' } }),
      { hostname: 'SGL-WIN', sid: SID_ESTUDIANTE, ip: '192.168.100.100' },
    );

    assert.equal(respuesta.exento, false);
    assert.deepEqual(respuesta.dominios, ['google.com', 'moodle.org', 'python.org']);
    assert.deepEqual(respuesta.grupos, ['GRP-1A', 'GRP-1B']);
    assert.deepEqual(respuesta.proxy, { host: '192.168.100.58', port: 3128 });

    assert.equal(ctx.sesiones.length, 1);
    assert.equal(ctx.sesiones[0].ip_origen, '192.168.100.100');
    assert.deepEqual(ctx.sesiones[0].grupos, [GRUPO_A, GRUPO_B]);
    assert.ok(
      ctx.audit.some(
        (e) => e.accion === 'EJECUTAR' && e.detalle && e.detalle.operacion === 'SESION_NAVEGACION',
      ),
    );

    // El squid.conf publicado incluye la IP de la PC en la ACL de los dos grupos.
    const publicado = fs.readFileSync(path.join(ctx.tmp, 'sgl-squid.conf'), 'utf8');
    assert.match(publicado, /src 192\.168\.100\.100/);
    assert.match(publicado, /dstdomain [^\n]*\.moodle\.org/);
  } finally {
    ctx.restore();
  }
});

test('HU09-12 sesión de un usuario fuera de SGL: exento (admin no se bloquea)', async () => {
  const ctx = setup();
  try {
    const respuesta = await ctx.service.sesionAgente(
      request({ headers: { 'x-agent-key': 'clave-agente-test' } }),
      { hostname: 'sgl-win', sid: 'S-1-5-21-9-9-9-500', ip: '192.168.100.100' },
    );
    assert.equal(respuesta.exento, true);
    assert.equal(ctx.sesiones.length, 0);
  } finally {
    ctx.restore();
  }
});

test('HU09-13 generar: config por grupo, script publicado y auditoría (CA-07)', async () => {
  const ctx = setup({
    listas: [
      { id: LISTA_1, grupo_id: GRUPO_A, url: 'moodle.org', activa: true },
      { id: LISTA_2, grupo_id: GRUPO_B, url: 'python.org', activa: true },
    ],
  });
  try {
    const generada = await ctx.service.generar(request(), LAB_ID);

    assert.equal(ctx.configuraciones.length, 2);
    assert.ok(ctx.configuraciones.every((item) => item.config_squidguard.includes('pass none')));
    assert.equal(ctx.navegaciones.length, 1);
    assert.equal(generada.laboratorio.nombre, 'Laboratorio de Redes');
    assert.equal(generada.resumen.dominios, 4);

    assert.ok(fs.existsSync(path.join(ctx.tmp, 'sgl-navegacion.ps1')));
    assert.ok(fs.existsSync(path.join(ctx.tmp, 'sgl-squid.conf')));
    assert.ok(fs.existsSync(path.join(ctx.tmp, 'sgl-proxy.pac')));
    assert.ok(fs.existsSync(path.join(ctx.tmp, `sgl-navegacion-${generada.version}.ps1`)));

    assert.ok(
      ctx.audit.some(
        (e) => e.accion === 'EJECUTAR' && e.detalle && e.detalle.operacion === 'GENERAR',
      ),
    );
  } finally {
    ctx.restore();
  }
});

test('HU09-14 desplegar: solo equipos encendidos y auditoría (CA-08)', async () => {
  const ctx = setup();
  try {
    const generada = await ctx.service.generar(request(), LAB_ID);
    const desplegada = await ctx.service.desplegar(request(), generada.id);

    assert.equal(ctx.despliegues.length, 2);
    await esperar();
    assert.equal(ctx.meshCalls.length, 1);
    assert.equal(ctx.meshCalls[0].nodeid, 'node/on');
    assert.ok(ctx.audit.some((e) => e.accion === 'DESPLEGAR'));

    const estados = desplegada.despliegues.map((item) => item.estado).sort();
    assert.ok(estados.includes('COMPLETADO'));
    assert.ok(estados.includes('PENDIENTE'));
  } finally {
    ctx.restore();
  }
});
