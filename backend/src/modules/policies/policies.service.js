const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
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
} = require('../../models');
const { recordAuditEvent } = require('../audit/audit.service');
const mesh = require('../deployments/deployments.mesh');
const { installersDir } = require('../apps/apps.paths');
const logger = require('../../utils/logger');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADO_ACTIVO = 'ENCENDIDO';
const SID_TODOS = 'S-1-1-0';
const SID_ADMINS = 'S-1-5-32-544';

const BLOQUEO_DEFAULT = Object.freeze({
  activo: true,
  navegadores: ['msedge.exe', 'chrome.exe', 'firefox.exe', 'iexplore.exe'],
  carpetas: ['%USERPROFILE%'],
  exencion_admin: true,
  // Programacion: se permite node/git para las tareas de clase.
  programacion: ['C:\\Program Files\\nodejs\\*', 'C:\\Program Files\\Git\\*'],
  restricciones: {
    taskmgr: true,
    // El terminal se deja disponible para programar (node, git, npm).
    cmd: false,
    powershell: false,
    control_panel: true,
    registry: true,
    run: true,
    drives: true,
    context_menu: true,
    // No puede apagar, reiniciar ni cerrar sesion desde el menu.
    shutdown: true,
  },
});

/** Rutas conocidas de navegadores (se permiten las que existan). */
const RUTAS_NAVEGADORES = Object.freeze({
  'msedge.exe': ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
  'chrome.exe': [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  'firefox.exe': ['C:\\Program Files\\Mozilla Firefox\\firefox.exe'],
  'iexplore.exe': ['C:\\Program Files\\Internet Explorer\\iexplore.exe'],
});

function httpError(status, message, code, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function assertValidId(id, label = 'Identificador') {
  if (!UUID_PATTERN.test(String(id || ''))) {
    throw httpError(400, `${label} inválido.`, 'ID_INVALIDO');
  }
}

function toPlain(value) {
  if (!value) return null;
  return value.toJSON ? value.toJSON() : value;
}

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** GUID estable para que las reglas no cambien entre generaciones. */
function guidEstable(seed) {
  const hash = crypto.createHash('md5').update(String(seed)).digest('hex');
  // Formato GUID v4 (lo valida AppLocker).
  const version = '4' + hash.slice(13, 16);
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20);
  // AppLocker espera el GUID sin llaves y en minusculas.
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${version}-${variant}-${hash.slice(20, 32)}`;
}

/** Combina la configuración guardada con los valores por defecto. */
function normalizarBloqueo(config) {
  const data = config && typeof config === 'object' ? config : {};
  return {
    activo: data.activo !== undefined ? Boolean(data.activo) : BLOQUEO_DEFAULT.activo,
    navegadores: Array.isArray(data.navegadores)
      ? data.navegadores.filter((n) => RUTAS_NAVEGADORES[n])
      : [...BLOQUEO_DEFAULT.navegadores],
    carpetas: Array.isArray(data.carpetas) ? data.carpetas : [...BLOQUEO_DEFAULT.carpetas],
    programacion: Array.isArray(data.programacion)
      ? data.programacion
      : [...BLOQUEO_DEFAULT.programacion],
    exencion_admin:
      data.exencion_admin !== undefined
        ? Boolean(data.exencion_admin)
        : BLOQUEO_DEFAULT.exencion_admin,
    restricciones: {
      ...BLOQUEO_DEFAULT.restricciones,
      ...(data.restricciones && typeof data.restricciones === 'object'
        ? data.restricciones
        : {}),
    },
  };
}

/** Configuración de bloqueo del laboratorio. */
async function bloqueo(laboratorioId) {
  assertValidId(laboratorioId, 'Identificador de laboratorio');
  const laboratorio = await Laboratorio.findByPk(laboratorioId);
  if (!laboratorio) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');

  const data = toPlain(laboratorio);
  return {
    laboratorio: { id: data.id, nombre: data.nombre },
    config: normalizarBloqueo(data.bloqueo),
  };
}

/** Actualiza la configuración de bloqueo (RN-010). */
async function setBloqueo(req, laboratorioId, payload) {
  assertValidId(laboratorioId, 'Identificador de laboratorio');
  const laboratorio = await Laboratorio.findByPk(laboratorioId);
  if (!laboratorio) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');

  const config = normalizarBloqueo(payload && payload.config);
  await laboratorio.update({ bloqueo: config });

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'laboratorio',
    entidadId: laboratorio.id,
    detalle: { operacion: 'CONFIG_BLOQUEO', config },
  });

  return { laboratorio: { id: laboratorio.id, nombre: laboratorio.nombre }, config };
}

/**
 * Matriz de permisos: aplicaciones vinculadas al laboratorio × grupos.
 * Un permiso ausente equivale a FALSE (RN-008).
 */
async function matriz(laboratorioId) {
  assertValidId(laboratorioId, 'Identificador de laboratorio');

  const laboratorio = await Laboratorio.findByPk(laboratorioId);
  if (!laboratorio) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');

  const vinculos = await VinculoAppLab.findAll({
    where: { laboratorio_id: laboratorio.id, activo: true },
  });
  const appIds = [...new Set(vinculos.map((v) => v.app_id))];
  const apps = appIds.length ? await Aplicacion.findAll({ where: { id: appIds } }) : [];
  const appPorId = new Map(apps.map((a) => [a.id, toPlain(a)]));

  const grupos = await Grupo.findAll({ order: [['codigo', 'ASC']] });
  const permisos = vinculos.length
    ? await PermisoAppGrupo.findAll({ where: { vinculo_id: vinculos.map((v) => v.id) } })
    : [];

  const habilitadoPor = new Map();
  for (const permiso of permisos) {
    habilitadoPor.set(`${permiso.vinculo_id}:${permiso.grupo_id}`, Boolean(permiso.habilitado));
  }

  return {
    laboratorio: { id: laboratorio.id, nombre: laboratorio.nombre },
    grupos: grupos.map((g) => ({
      id: g.id,
      codigo: g.codigo,
      descripcion: g.descripcion || null,
      samba_sid: g.samba_sid,
    })),
    apps: vinculos
      .map((vinculo) => {
        const app = appPorId.get(vinculo.app_id) || {};
        const permisosMap = {};
        for (const grupo of grupos) {
          permisosMap[grupo.id] = habilitadoPor.get(`${vinculo.id}:${grupo.id}`) || false;
        }
        return {
          vinculo_id: vinculo.id,
          app_id: vinculo.app_id,
          nombre: app.nombre || null,
          version: app.version || null,
          ruta_ejecutable: app.ruta_ejecutable || null,
          permisos: permisosMap,
        };
      })
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')),
  };
}

/** Habilita o deshabilita un permiso (RN-008, RN-013). */
async function setPermiso(req, payload) {
  const vinculoId = payload.vinculo_id;
  const grupoId = payload.grupo_id;
  assertValidId(vinculoId, 'Identificador de vínculo');
  assertValidId(grupoId, 'Identificador de grupo');

  const vinculo = await VinculoAppLab.findByPk(vinculoId);
  if (!vinculo || !vinculo.activo) {
    throw httpError(404, 'El vínculo app-laboratorio no existe o está inactivo.', 'VINCULO_NO_ENCONTRADO');
  }
  const grupo = await Grupo.findByPk(grupoId);
  if (!grupo) throw httpError(404, 'Grupo no encontrado.', 'GRUPO_NO_ENCONTRADO');

  const habilitado = Boolean(payload.habilitado);
  const [permiso, created] = await PermisoAppGrupo.findOrCreate({
    where: { vinculo_id: vinculoId, grupo_id: grupoId },
    defaults: { habilitado },
  });

  if (!created && Boolean(permiso.habilitado) !== habilitado) {
    await permiso.update({ habilitado, fecha_config: new Date() });
  }

  await recordAuditEvent(req, {
    accion: 'CAMBIO_PERMISO',
    entidad: 'permiso_app_grupo',
    entidadId: permiso.id,
    detalle: {
      vinculo_id: vinculoId,
      grupo: grupo.codigo,
      habilitado,
    },
  });

  return { vinculo_id: vinculoId, grupo_id: grupoId, habilitado };
}

/**
 * Permisos efectivos de un estudiante: unión de los permisos de todos sus
 * grupos activos, agrupados por laboratorio (RN-004, RN-013).
 */
async function efectivos(usuarioId) {
  assertValidId(usuarioId, 'Identificador de usuario');

  const usuario = await Usuario.findByPk(usuarioId);
  if (!usuario) throw httpError(404, 'Usuario no encontrado.', 'USUARIO_NO_ENCONTRADO');

  const membresias = await MembresiaGrupo.findAll({
    where: { usuario_id: usuarioId, activa: true },
  });
  const grupoIds = membresias.map((m) => m.grupo_id);

  if (!grupoIds.length) {
    return {
      usuario: { id: usuario.id, uid: usuario.uid, nombre_completo: usuario.nombre_completo },
      grupos: [],
      laboratorios: [],
    };
  }

  const permisos = await PermisoAppGrupo.findAll({
    where: { grupo_id: grupoIds, habilitado: true },
  });
  const vinculoIds = [...new Set(permisos.map((p) => p.vinculo_id))];
  const vinculos = vinculoIds.length
    ? await VinculoAppLab.findAll({ where: { id: vinculoIds, activo: true } })
    : [];
  const vinculoPorId = new Map(vinculos.map((v) => [v.id, v]));

  const appIds = [...new Set(vinculos.map((v) => v.app_id))];
  const apps = appIds.length ? await Aplicacion.findAll({ where: { id: appIds } }) : [];
  const appPorId = new Map(apps.map((a) => [a.id, toPlain(a)]));

  const labIds = [...new Set(vinculos.map((v) => v.laboratorio_id))];
  const labs = labIds.length ? await Laboratorio.findAll({ where: { id: labIds } }) : [];
  const labPorId = new Map(labs.map((l) => [l.id, l]));

  const grupos = await Grupo.findAll({ where: { id: grupoIds }, order: [['codigo', 'ASC']] });

  const porLab = new Map();
  for (const permiso of permisos) {
    const vinculo = vinculoPorId.get(permiso.vinculo_id);
    if (!vinculo) continue;
    const app = appPorId.get(vinculo.app_id);
    if (!app) continue;

    if (!porLab.has(vinculo.laboratorio_id)) {
      porLab.set(vinculo.laboratorio_id, { laboratorio: null, apps: new Map() });
    }
    const entrada = porLab.get(vinculo.laboratorio_id);
    const lab = labPorId.get(vinculo.laboratorio_id);
    entrada.laboratorio = lab ? { id: lab.id, nombre: lab.nombre } : null;
    entrada.apps.set(app.id, {
      id: app.id,
      nombre: app.nombre,
      version: app.version,
      ruta_ejecutable: app.ruta_ejecutable || null,
    });
  }

  return {
    usuario: {
      id: usuario.id,
      uid: usuario.uid,
      nombre_completo: usuario.nombre_completo,
    },
    grupos: grupos.map((g) => ({ id: g.id, codigo: g.codigo })),
    laboratorios: [...porLab.values()].map((entrada) => ({
      laboratorio: entrada.laboratorio,
      apps: [...entrada.apps.values()],
    })),
  };
}

/** Regla directa (sin grupo de app). */
function reglaBase(nombre, sid, ruta) {
  const id = guidEstable(`${sid}:${ruta}`);
  return [
    `    <FilePathRule Id="${id}" Name="${escapeXml(nombre)}"`,
    `        Description="Regla base SGL"`,
    `        UserOrGroupSid="${escapeXml(sid)}" Action="Allow">`,
    '      <Conditions>',
    `        <FilePathCondition Path="${escapeXml(ruta)}" />`,
    '      </Conditions>',
    '    </FilePathRule>',
  ].join('\n');
}

/** Reglas mínimas para que Windows funcione y el admin quede exento. */
function reglasBase(bloqueo) {
  const reglas = [reglaBase('SGL Windows', SID_TODOS, 'C:\\Windows\\*')];

  if (bloqueo.exencion_admin) {
    reglas.push(
      reglaBase('SGL Administradores Program Files', SID_ADMINS, 'C:\\Program Files\\*'),
      reglaBase('SGL Administradores Program Files x86', SID_ADMINS, 'C:\\Program Files (x86)\\*'),
      reglaBase('SGL Administradores', SID_ADMINS, '*'),
    );
  }

  for (const navegador of bloqueo.navegadores) {
    for (const ruta of RUTAS_NAVEGADORES[navegador] || []) {
      reglas.push(reglaBase(`SGL Navegador ${navegador}`, SID_TODOS, ruta));
    }
  }

  return reglas;
}

/** Reglas de herramientas de programacion (node, git) por grupo. */
function reglasProgramacion(bloqueo, grupos) {
  const reglas = [];
  for (const grupo of grupos) {
    for (const ruta of bloqueo.programacion || []) {
      reglas.push(reglaBase(`SGL Programacion ${ruta}`, grupo.samba_sid, ruta));
    }
  }
  return reglas;
}

/**
 * Script que se ejecuta al iniciar sesión del estudiante (HKCU).
 * Solo aplica a usuarios de los grupos SGL y nunca al administrador.
 */
function construirScript(bloqueo, grupos) {
  const sids = grupos.map((g) => `'${g.samba_sid}'`).join(', ');
  const r = bloqueo.restricciones;
  const claves = [];

  if (r.taskmgr) claves.push("Set-ItemProperty $sys -Name DisableTaskMgr -Value 1 -Type DWord");
  if (r.registry) claves.push("Set-ItemProperty $sys -Name DisableRegistryTools -Value 1 -Type DWord");
  if (r.cmd) claves.push("Set-ItemProperty $sys -Name DisableCMD -Value 1 -Type DWord");
  if (r.control_panel) claves.push("Set-ItemProperty $exp -Name NoControlPanel -Value 1 -Type DWord");
  if (r.run) claves.push("Set-ItemProperty $exp -Name NoRun -Value 1 -Type DWord");
  if (r.drives) {
    claves.push("Set-ItemProperty $exp -Name NoDrives -Value 0x03FFFFFF -Type DWord");
    claves.push("Set-ItemProperty $exp -Name NoViewOnDrive -Value 0x03FFFFFF -Type DWord");
  }
  if (r.context_menu) {
    claves.push("Set-ItemProperty $exp -Name NoViewContextMenu -Value 1 -Type DWord");
    claves.push("Set-ItemProperty $exp -Name NoTrayContextMenu -Value 1 -Type DWord");
    claves.push("Set-ItemProperty $exp -Name NoFileMenu -Value 1 -Type DWord");
  }
  if (r.shutdown) {
    // No apagar, reiniciar ni cerrar sesion desde el menu de inicio.
    claves.push("Set-ItemProperty $exp -Name NoClose -Value 1 -Type DWord");
  }

  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$log = 'C:\\ProgramData\\SGL\\lockdown.log'",
    "New-Item -ItemType Directory -Force -Path 'C:\\ProgramData\\SGL' | Out-Null",
    "function Log($m) { Add-Content -Path $log -Value ((Get-Date -Format o) + ' ' + $m) }",
    `$gruposSgl = @(${sids})`,
    "$identidad = [System.Security.Principal.WindowsIdentity]::GetCurrent()",
    "$misGrupos = @($identidad.Groups | ForEach-Object { $_.Value })",
    "if ($misGrupos -contains 'S-1-5-32-544') { Log 'admin: sin bloqueo'; exit 0 }",
    "$esSgl = $false",
    "foreach ($sid in $gruposSgl) { if ($misGrupos -contains $sid) { $esSgl = $true } }",
    "if (-not $esSgl) { Log 'usuario fuera de los grupos SGL: sin bloqueo'; exit 0 }",
    "$sys = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'",
    "$exp = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer'",
    "New-Item -Force $sys | Out-Null",
    "New-Item -Force $exp | Out-Null",
    // Si una restriccion esta desactivada, se limpia la clave anterior.
    "if (-not " + (r.cmd ? '$true' : '$false') + ") { Remove-ItemProperty $sys -Name DisableCMD -ErrorAction SilentlyContinue }",
    "if (-not " + (r.shutdown ? '$true' : '$false') + ") { Remove-ItemProperty $exp -Name NoClose -ErrorAction SilentlyContinue }",

    ...claves,
    "Log ('bloqueo aplicado a ' + $identidad.Name)",
    'exit 0',
    '',
  ].join('\r\n');
}

function reglaXml(app, grupo) {
  const id = guidEstable(`${grupo.id}:${app.app_id}:${app.ruta_ejecutable}`);
  return [
    `    <FilePathRule Id="${id}" Name="SGL ${escapeXml(app.nombre)} ${escapeXml(app.version || '')}"`,
    `        Description="Permitido para el grupo ${escapeXml(grupo.codigo)}"`,
    `        UserOrGroupSid="${escapeXml(grupo.samba_sid)}" Action="Allow">`,
    '      <Conditions>',
    `        <FilePathCondition Path="${escapeXml(app.ruta_ejecutable)}" />`,
    '      </Conditions>',
    '    </FilePathRule>',
  ].join('\n');
}

function xmlPolitica(reglas) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<AppLockerPolicy Version="1">',
    '  <RuleCollection Type="Exe" EnforcementMode="Enabled">',
    ...reglas,
    '  </RuleCollection>',
    '</AppLockerPolicy>',
    '',
  ].join('\n');
}

/**
 * Genera las políticas de ejecución (CA-07):
 * - una política por grupo y laboratorio (`politica_ejecucion`);
 * - una política combinada del laboratorio (`politica_laboratorio`).
 */
async function generar(req, laboratorioId) {
  const datos = await matriz(laboratorioId);
  const datosBloqueo = await bloqueo(laboratorioId);
  const bloqueoConfig = datosBloqueo.config;
  const reglasLab = [
    ...reglasBase(bloqueoConfig),
    ...reglasProgramacion(bloqueoConfig, datos.grupos),
  ];
  const resumen = {
    laboratorio: datos.laboratorio,
    grupos: [],
    apps_sin_ruta: [],
    apps_incluidas: [],
  };
  const sinRuta = new Set();

  for (const grupo of datos.grupos) {
    const appsGrupo = datos.apps.filter((app) => app.permisos[grupo.id] && app.ruta_ejecutable);
    for (const app of datos.apps.filter((item) => item.permisos[grupo.id] && !item.ruta_ejecutable)) {
      sinRuta.add(app.nombre);
    }

    const reglas = appsGrupo.map((app) => reglaXml(app, grupo));
    reglasLab.push(...reglas);

    const xmlGrupo = xmlPolitica(reglas);
    const versionGrupo = crypto.createHash('sha256').update(xmlGrupo).digest('hex').slice(0, 32);

    const existente = await PoliticaEjecucion.findOne({
      where: { grupo_id: grupo.id, laboratorio_id: datos.laboratorio.id },
    });
    if (existente) {
      await existente.update({
        reglas_applocker: xmlGrupo,
        version: versionGrupo,
        fecha_generacion: new Date(),
      });
    } else {
      await PoliticaEjecucion.create({
        grupo_id: grupo.id,
        laboratorio_id: datos.laboratorio.id,
        reglas_applocker: xmlGrupo,
        version: versionGrupo,
      });
    }

    resumen.grupos.push({
      codigo: grupo.codigo,
      apps: appsGrupo.map((app) => app.nombre),
    });
  }

  resumen.apps_sin_ruta = [...sinRuta];
  resumen.apps_incluidas = [
    ...new Set(datos.apps.filter((a) => a.ruta_ejecutable).map((a) => a.nombre)),
  ];

  const script = bloqueoConfig.activo ? construirScript(bloqueoConfig, datos.grupos) : null;

  // El script se publica en /instaladores para que la PC lo descargue con un
  // comando corto (el comando completo supera el límite de MeshCentral).
  let scriptFile = null;
  if (script) {
    scriptFile = `sgl-lockdown-${Date.now()}.ps1`;
    try {
      fs.mkdirSync(installersDir(), { recursive: true });
      fs.writeFileSync(path.join(installersDir(), scriptFile), script, 'utf8');
    } catch (err) {
      logger.warn('No se pudo publicar el script de bloqueo', { error: err.message });
      scriptFile = null;
    }
  }
  const contenido = xmlPolitica(reglasLab);
  const version = crypto
    .createHash('sha256')
    .update(contenido + (script || ''))
    .digest('hex')
    .slice(0, 16);

  const politica = await PoliticaLaboratorio.create({
    laboratorio_id: datos.laboratorio.id,
    generada_por: req.user.id,
    version,
    contenido,
    resumen,
    config: { bloqueo: bloqueoConfig, script, script_file: scriptFile },
  });

  await recordAuditEvent(req, {
    accion: 'EJECUTAR',
    entidad: 'politica',
    entidadId: politica.id,
    detalle: {
      operacion: 'GENERAR',
      laboratorio: datos.laboratorio.nombre,
      version,
      reglas: reglasLab.length,
      bloqueo: bloqueoConfig.activo,
    },
  });

  return get(politica.id);
}

function toPolitica(politica, extras = {}) {
  const data = toPlain(politica);
  return {
    id: data.id,
    laboratorio_id: data.laboratorio_id,
    version: data.version,
    resumen: data.resumen || null,
    config: data.config || null,
    contenido: data.contenido,
    fecha_generacion: data.fecha_generacion || null,
    laboratorio: extras.laboratorio || null,
    despliegues: extras.despliegues || [],
    resumen_despliegue: extras.resumen_despliegue || null,
  };
}

async function get(id) {
  assertValidId(id, 'Identificador de política');

  const politica = await PoliticaLaboratorio.findByPk(id);
  if (!politica) throw httpError(404, 'Política no encontrada.', 'POLITICA_NO_ENCONTRADA');

  const laboratorio = await Laboratorio.findByPk(politica.laboratorio_id);
  const filas = await PoliticaDespliegue.findAll({ where: { politica_id: politica.id } });
  const equipoIds = [...new Set(filas.map((f) => f.equipo_id))];
  const equipos = equipoIds.length ? await Equipo.findAll({ where: { id: equipoIds } }) : [];
  const equipoPorId = new Map(equipos.map((e) => [e.id, toPlain(e)]));

  const despliegues = filas.map((fila) => {
    const data = toPlain(fila);
    const equipo = equipoPorId.get(data.equipo_id) || {};
    return {
      id: data.id,
      equipo_id: data.equipo_id,
      hostname: equipo.hostname || null,
      mac_address: equipo.mac_address || null,
      estado: data.estado,
      intentos: data.intentos,
      mensaje_error: data.mensaje_error || null,
      salida: data.salida || null,
      fecha_reporte: data.fecha_reporte || null,
    };
  });

  const resumenDespliegue = { PENDIENTE: 0, EN_PROCESO: 0, COMPLETADO: 0, FALLIDO: 0 };
  for (const item of despliegues) {
    if (resumenDespliegue[item.estado] !== undefined) resumenDespliegue[item.estado] += 1;
  }

  return toPolitica(politica, {
    laboratorio: laboratorio ? { id: laboratorio.id, nombre: laboratorio.nombre } : null,
    despliegues,
    resumen_despliegue: resumenDespliegue,
  });
}

async function list({ limite = 20 } = {}) {
  const politicas = await PoliticaLaboratorio.findAll({
    order: [['fecha_generacion', 'DESC']],
    limit: Math.min(Math.max(Number(limite) || 20, 1), 100),
  });
  const labIds = [...new Set(politicas.map((p) => p.laboratorio_id))];
  const labs = labIds.length ? await Laboratorio.findAll({ where: { id: labIds } }) : [];
  const labPorId = new Map(labs.map((l) => [l.id, toPlain(l)]));

  return politicas.map((politica) => {
    const data = toPlain(politica);
    const lab = labPorId.get(data.laboratorio_id);
    return {
      id: data.id,
      laboratorio_id: data.laboratorio_id,
      laboratorio: lab ? { id: lab.id, nombre: lab.nombre } : null,
      version: data.version,
      resumen: data.resumen || null,
      fecha_generacion: data.fecha_generacion || null,
    };
  });
}

function estaEncendido(equipo, estadosVivos) {
  const vivo = estadosVivos && equipo.mesh_agent_id ? estadosVivos.get(equipo.mesh_agent_id) : null;
  return String(vivo || equipo.estado || '').toUpperCase() === ESTADO_ACTIVO;
}

async function despachar({ politica, equipo }) {
  const fila = await PoliticaDespliegue.findOne({
    where: { politica_id: politica.id, equipo_id: equipo.id },
  });
  if (!fila) return { ok: false };

  if (!equipo.mesh_agent_id) {
    await fila.update({ estado: 'PENDIENTE', mensaje_error: 'El equipo no tiene agente MeshCentral registrado.' });
    return { ok: false };
  }

  await fila.update({
    estado: 'EN_PROCESO',
    intentos: (fila.intentos || 0) + 1,
    mensaje_error: null,
  });

  try {
    const datosPolitica = toPlain(politica);
    const resultado = await mesh.aplicarPolitica({
      nodeid: equipo.mesh_agent_id,
      xml: datosPolitica.contenido,
      nombre: datosPolitica.version,
      scriptFile: datosPolitica.config ? datosPolitica.config.script_file : null,
    });

    if (resultado.equipoApagado) {
      await fila.update({
        estado: 'PENDIENTE',
        fecha_reporte: new Date(),
        mensaje_error: 'El equipo está apagado; la política se aplicará cuando se encienda.',
      });
      return resultado;
    }

    await fila.update({
      estado: resultado.ok ? 'COMPLETADO' : 'FALLIDO',
      fecha_reporte: new Date(),
      salida: resultado.salida || null,
      mensaje_error: resultado.ok
        ? null
        : `No se pudo aplicar la política (código ${resultado.codigo ?? 'desconocido'}).`,
    });
    return resultado;
  } catch (err) {
    const apagado = /not connected|no está conectado|offline/i.test(String(err.message || ''));
    await fila.update({
      estado: apagado ? 'PENDIENTE' : 'FALLIDO',
      fecha_reporte: new Date(),
      mensaje_error: String(err.message || '').slice(0, 500),
    });
    return { ok: false, error: err.message };
  }
}

/** Despliega la política a las PCs del laboratorio (CA-08, CA-09). */
async function desplegar(req, id) {
  const politica = await PoliticaLaboratorio.findByPk(id);
  if (!politica) throw httpError(404, 'Política no encontrada.', 'POLITICA_NO_ENCONTRADA');

  const equipos = await Equipo.findAll({ where: { laboratorio_id: politica.laboratorio_id } });
  if (!equipos.length) {
    throw httpError(409, 'El laboratorio no tiene equipos registrados.', 'SIN_EQUIPOS');
  }

  for (const equipo of equipos) {
    await PoliticaDespliegue.findOrCreate({
      where: { politica_id: politica.id, equipo_id: equipo.id },
      defaults: { estado: 'PENDIENTE', intentos: 0 },
    });
  }

  const estadosVivos = await mesh.estados();
  const activos = equipos.filter((equipo) => estaEncendido(equipo, estadosVivos));

  for (const equipo of activos) {
    despachar({ politica, equipo }).catch((err) => {
      logger.error('No se pudo desplegar la política', { error: err.message });
    });
  }

  await recordAuditEvent(req, {
    accion: 'DESPLEGAR',
    entidad: 'politica',
    entidadId: politica.id,
    detalle: {
      operacion: 'DESPLEGAR_POLITICA',
      version: toPlain(politica).version,
      equipos: equipos.length,
      activos: activos.length,
    },
  });

  return get(politica.id);
}

module.exports = {
  BLOQUEO_DEFAULT,
  matriz,
  bloqueo,
  setBloqueo,
  setPermiso,
  efectivos,
  generar,
  list,
  get,
  desplegar,
  // Exportadas para pruebas.
  escapeXml,
  guidEstable,
  xmlPolitica,
};
