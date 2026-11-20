const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
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
} = require('../../models');
const { recordAuditEvent } = require('../audit/audit.service');
const mesh = require('../deployments/deployments.mesh');
const { installersDir } = require('../apps/apps.paths');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { clientIp } = require('../../utils/request');
const {
  normalizarDominio,
  esDominioValido,
  unirDominios,
  dominioSquid,
} = require('./whitelists.domain');
const {
  DOMINIOS_BASE,
  construirSquidConfig,
  construirSquidGuard,
  construirPac,
  construirScriptPc,
  normalizarProxy,
} = require('./whitelists.config');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADO_ACTIVO = 'ENCENDIDO';
const NOMBRE_SCRIPT = 'sgl-navegacion.ps1';
const NOMBRE_SQUID = 'sgl-squid.conf';
const NOMBRE_PAC = 'sgl-proxy.pac';

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
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

function proxyConfig() {
  return normalizarProxy({ host: env.navProxyHost, port: env.navProxyPort });
}

function apiBase() {
  return String(env.navApiBase || '').replace(/\/$/, '');
}

/** Escribe un archivo en el directorio publicado por Nginx (/instaladores). */
function publicar(nombre, contenido) {
  const destino = path.join(installersDir(), nombre);
  fs.mkdirSync(installersDir(), { recursive: true });
  fs.writeFileSync(destino, contenido, 'utf8');
  return destino;
}

function hashContenido(...partes) {
  return crypto.createHash('sha256').update(partes.join('\n')).digest('hex').slice(0, 16);
}

/** Grupos del estudiante (RN-016: unión de sus grupos activos). */
async function gruposDeUsuario(usuarioId) {
  const membresias = await MembresiaGrupo.findAll({
    where: { usuario_id: usuarioId, activa: true },
  });
  const ids = [...new Set(membresias.map((m) => m.grupo_id))];
  if (!ids.length) return [];
  const grupos = await Grupo.findAll({ where: { id: ids }, order: [['codigo', 'ASC']] });
  return grupos.map((grupo) => toPlain(grupo));
}

/** Lista blanca efectiva: unión de los dominios de los grupos del usuario. */
async function efectivas(usuarioId) {
  assertValidId(usuarioId, 'Identificador de usuario');
  const usuario = await Usuario.findByPk(usuarioId);
  if (!usuario) throw httpError(404, 'Usuario no encontrado.', 'USUARIO_NO_ENCONTRADO');

  const grupos = await gruposDeUsuario(usuarioId);
  const entradas = grupos.length
    ? await ListaBlancaUrl.findAll({
        where: { grupo_id: grupos.map((grupo) => grupo.id), activa: true },
      })
    : [];

  const datos = toPlain(usuario);
  return {
    usuario: { id: datos.id, uid: datos.uid, nombre_completo: datos.nombre_completo },
    grupos: grupos.map((grupo) => ({ id: grupo.id, codigo: grupo.codigo })),
    dominios: unirDominios([
      ...entradas.map((entrada) => toPlain(entrada).url),
      ...(grupos.length ? DOMINIOS_BASE : []),
    ]),
    sin_grupo: grupos.length === 0,
  };
}

/** Listado de grupos con sus dominios (panel de administración). */
async function list() {
  const grupos = await Grupo.findAll({ order: [['codigo', 'ASC']] });
  const entradas = await ListaBlancaUrl.findAll({ order: [['url', 'ASC']] });
  const porGrupo = new Map();

  for (const fila of entradas) {
    const data = toPlain(fila);
    if (!porGrupo.has(data.grupo_id)) porGrupo.set(data.grupo_id, []);
    porGrupo.get(data.grupo_id).push({
      id: data.id,
      grupo_id: data.grupo_id,
      url: data.url,
      descripcion: data.descripcion || null,
      activa: Boolean(data.activa),
      fecha_alta: data.fecha_alta || null,
      updated_at: data.updated_at || null,
    });
  }

  return {
    grupos: grupos.map((grupo) => {
      const data = toPlain(grupo);
      const lista = porGrupo.get(data.id) || [];
      return {
        id: data.id,
        codigo: data.codigo,
        descripcion: data.descripcion || null,
        samba_sid: data.samba_sid,
        dominios: lista.filter((item) => item.activa).length,
      };
    }),
    entradas: [...porGrupo.values()].flat(),
    proxy: proxyConfig(),
  };
}

async function crear(req, payload) {
  assertValidId(payload.grupo_id, 'Identificador de grupo');
  const grupo = await Grupo.findByPk(payload.grupo_id);
  if (!grupo) throw httpError(404, 'Grupo no encontrado.', 'GRUPO_NO_ENCONTRADO');

  const dominio = normalizarDominio(payload.url);
  if (!esDominioValido(dominio)) {
    throw httpError(
      400,
      'La URL no es válida. Ingresá un dominio como ejemplo.com (sin IP ni puerto).',
      'URL_INVALIDA',
    );
  }

  const existente = await ListaBlancaUrl.findOne({
    where: { grupo_id: grupo.id, url: dominio },
  });
  if (existente) {
    throw httpError(409, 'El dominio ya está en la lista blanca del grupo.', 'URL_DUPLICADA');
  }

  const fila = await ListaBlancaUrl.create({
    grupo_id: grupo.id,
    url: dominio,
    descripcion: payload.descripcion ? String(payload.descripcion).trim().slice(0, 255) : null,
    creado_por: req.user.id,
    activa: payload.activa === undefined ? true : Boolean(payload.activa),
  });

  await recordAuditEvent(req, {
    accion: 'CREAR',
    entidad: 'lista_blanca_url',
    entidadId: fila.id,
    detalle: { grupo: grupo.codigo, dominio, descripcion: payload.descripcion || null },
  });

  programarSincronizacion(req, 'ALTA_URL');
  return toPlain(fila);
}

async function actualizar(req, id, payload) {
  assertValidId(id, 'Identificador de lista blanca');
  const fila = await ListaBlancaUrl.findByPk(id);
  if (!fila) throw httpError(404, 'Entrada no encontrada.', 'LISTA_NO_ENCONTRADA');

  const cambios = {};
  if (payload.url !== undefined) {
    const dominio = normalizarDominio(payload.url);
    if (!esDominioValido(dominio)) {
      throw httpError(400, 'La URL no es válida.', 'URL_INVALIDA');
    }
    if (dominio !== fila.url) {
      const existente = await ListaBlancaUrl.findOne({
        where: { grupo_id: fila.grupo_id, url: dominio },
      });
      if (existente && existente.id !== fila.id) {
        throw httpError(409, 'El dominio ya está en la lista blanca del grupo.', 'URL_DUPLICADA');
      }
      cambios.url = dominio;
    }
  }
  if (payload.descripcion !== undefined) {
    cambios.descripcion = payload.descripcion
      ? String(payload.descripcion).trim().slice(0, 255)
      : null;
  }
  if (payload.activa !== undefined) cambios.activa = Boolean(payload.activa);

  if (!Object.keys(cambios).length) return toPlain(fila);

  cambios.updated_at = new Date();
  await fila.update(cambios);

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'lista_blanca_url',
    entidadId: fila.id,
    detalle: { campos: Object.keys(cambios), anterior: toPlain(fila), actual: cambios },
  });

  programarSincronizacion(req, 'EDICION_URL');
  return toPlain(fila);
}

async function eliminar(req, id) {
  assertValidId(id, 'Identificador de lista blanca');
  const fila = await ListaBlancaUrl.findByPk(id);
  if (!fila) throw httpError(404, 'Entrada no encontrada.', 'LISTA_NO_ENCONTRADA');

  const datos = toPlain(fila);
  await fila.destroy();

  await recordAuditEvent(req, {
    accion: 'ELIMINAR',
    entidad: 'lista_blanca_url',
    entidadId: id,
    detalle: { grupo_id: datos.grupo_id, dominio: datos.url },
  });

  programarSincronizacion(req, 'BAJA_URL');
  return { id, url: datos.url, deleted: true };
}

/**
 * Genera y publica el squid.conf global con las sesiones activas (CA-07).
 * El servicio del host valida el archivo y recarga Squid (scripts/squid-sync.sh).
 */
async function regenerarSquid() {
  const proxy = proxyConfig();
  const grupos = await Grupo.findAll({ order: [['codigo', 'ASC']] });
  const listas = await ListaBlancaUrl.findAll({ where: { activa: true } });

  const limite = new Date(Date.now() - Number(env.navSessionHours || 12) * 3600 * 1000);
  const sesiones = await SesionActiva.findAll({ where: { activa: true } });

  const sesionesVigentes = sesiones.filter((sesion) => {
    const data = toPlain(sesion);
    return data.activa && data.ip_origen && new Date(data.hora_inicio) >= limite;
  });

  const { texto, resumen } = construirSquidConfig({
    proxy,
    grupos: grupos.map((grupo) => toPlain(grupo)),
    listas: listas.map((fila) => toPlain(fila)),
    sesiones: sesionesVigentes.map((sesion) => {
      const data = toPlain(sesion);
      const gruposSesion = Array.isArray(data.grupos) ? data.grupos : [];
      return { ip: data.ip_origen, grupo_ids: gruposSesion };
    }),
  });

  const version = hashContenido(texto);
  publicar(NOMBRE_SQUID, texto);
  publicar(`sgl-squid-${version}.conf`, texto);

  return { texto, resumen, version, sesiones: sesionesVigentes.length };
}

/** Snippet por grupo que se guarda en config_filtrado (CA-07). */
function construirSnippetGrupo(grupo, dominios) {
  const codigo = String(grupo.codigo || 'grupo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  const lista = unirDominios(dominios).map(dominioSquid).filter(Boolean);
  return [
    `# SGL - ${grupo.codigo} (RN-016)`,
    `acl sgl_g_${codigo} src 0.0.0.0/0`,
    `acl sgl_d_${codigo} dstdomain ${lista.join(' ') || 'sgl_sin_dominios'}`,
    `http_access allow sgl_g_${codigo} sgl_d_${codigo}`,
    '',
  ].join('\n');
}

async function generarBundle(req, laboratorioId) {
  assertValidId(laboratorioId, 'Identificador de laboratorio');
  const laboratorio = await Laboratorio.findByPk(laboratorioId);
  if (!laboratorio) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');

  const grupos = await Grupo.findAll({ order: [['codigo', 'ASC']] });
  const listas = await ListaBlancaUrl.findAll({ where: { activa: true } });
  const listasPorGrupo = new Map();
  for (const fila of listas) {
    const data = toPlain(fila);
    if (!listasPorGrupo.has(data.grupo_id)) listasPorGrupo.set(data.grupo_id, []);
    listasPorGrupo.get(data.grupo_id).push(data.url);
  }

  // CA-06: Windows Firewall aplica reglas por SID de usuario (no de grupo),
  // así que el script incluye a los estudiantes con membresía activa.
  const grupoIds = new Set(grupos.map((grupo) => toPlain(grupo).id));
  const membresias = await MembresiaGrupo.findAll({
    where: { activa: true },
    attributes: ['usuario_id', 'grupo_id'],
  });
  const usuarioIds = [
    ...new Set(
      membresias
        .map((membresia) => toPlain(membresia))
        .filter((membresia) => grupoIds.has(membresia.grupo_id))
        .map((membresia) => membresia.usuario_id),
    ),
  ];
  const usuarios = usuarioIds.length
    ? await Usuario.findAll({
        where: { id: usuarioIds, activo: true, samba_sid: { [Op.ne]: null } },
        attributes: ['id', 'uid', 'samba_sid'],
      })
    : [];

  let dominiosTotales = 0;
  for (const grupo of grupos) {
    const data = toPlain(grupo);
    // google.com va siempre habilitado para los grupos (DOMINIOS_BASE).
    const dominios = [...new Set([...unirDominios(listasPorGrupo.get(data.id) || []), ...DOMINIOS_BASE])];
    dominiosTotales += dominios.length;
    const configSquid = construirSnippetGrupo(data, dominios);
    const configSquidGuard = construirSquidGuard(data, dominios);
    const version = hashContenido(configSquid, configSquidGuard);

    const existente = await ConfigFiltrado.findOne({
      where: { grupo_id: data.id, laboratorio_id: laboratorio.id },
    });
    if (existente) {
      await existente.update({
        config_squid: configSquid,
        config_squidguard: configSquidGuard,
        version,
        fecha_generacion: new Date(),
      });
    } else {
      await ConfigFiltrado.create({
        grupo_id: data.id,
        laboratorio_id: laboratorio.id,
        config_squid: configSquid,
        config_squidguard: configSquidGuard,
        version,
      });
    }
  }

  const squid = await regenerarSquid();
  const proxy = proxyConfig();
  const pac = construirPac(proxy);
  const script = construirScriptPc({
    usuarios: usuarios.map((usuario) => toPlain(usuario)),
    proxy,
    agentKey: env.navAgentKey,
    apiBase: apiBase(),
    exencionAdmin: true,
  });
  const version = hashContenido(squid.texto, script);

  // Nombres fijos: la PC siempre descarga la última versión publicada.
  publicar(NOMBRE_SCRIPT, script);
  publicar(`sgl-navegacion-${version}.ps1`, script);
  publicar(NOMBRE_PAC, pac);

  const resumen = {
    laboratorio: { id: laboratorio.id, nombre: laboratorio.nombre },
    proxy,
    grupos: grupos.map((grupo) => {
      const data = toPlain(grupo);
      return {
        codigo: data.codigo,
        dominios: new Set([
          ...unirDominios(listasPorGrupo.get(data.id) || []),
          ...DOMINIOS_BASE,
        ]).size,
      };
    }),
    dominios: dominiosTotales,
    sesiones: squid.sesiones,
    usuarios: usuarios.length,
    squid_version: squid.version,
    script_file: NOMBRE_SCRIPT,
  };

  const fila = await NavegacionLaboratorio.create({
    laboratorio_id: laboratorio.id,
    generada_por: req.user.id,
    version,
    config_squid: squid.texto,
    config_pac: pac,
    script_pc: script,
    resumen,
  });

  return fila;
}

function toNavegacion(fila, extras = {}) {
  const data = toPlain(fila);
  return {
    id: data.id,
    laboratorio_id: data.laboratorio_id,
    version: data.version,
    resumen: data.resumen || null,
    config_squid: data.config_squid,
    config_pac: data.config_pac || null,
    fecha_generacion: data.fecha_generacion || null,
    laboratorio: extras.laboratorio || null,
    despliegues: extras.despliegues || [],
    resumen_despliegue: extras.resumen_despliegue || null,
  };
}

async function get(id) {
  assertValidId(id, 'Identificador de navegación');
  const fila = await NavegacionLaboratorio.findByPk(id);
  if (!fila) throw httpError(404, 'Configuración no encontrada.', 'NAVEGACION_NO_ENCONTRADA');

  const laboratorio = await Laboratorio.findByPk(fila.laboratorio_id);
  const despliegues = await NavegacionDespliegue.findAll({ where: { navegacion_id: fila.id } });
  const equipoIds = [...new Set(despliegues.map((d) => d.equipo_id))];
  const equipos = equipoIds.length ? await Equipo.findAll({ where: { id: equipoIds } }) : [];
  const equipoPorId = new Map(equipos.map((e) => [e.id, toPlain(e)]));

  const detalle = despliegues.map((filaDespliegue) => {
    const data = toPlain(filaDespliegue);
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
  for (const item of detalle) {
    if (resumenDespliegue[item.estado] !== undefined) resumenDespliegue[item.estado] += 1;
  }

  return toNavegacion(fila, {
    laboratorio: laboratorio ? { id: laboratorio.id, nombre: laboratorio.nombre } : null,
    despliegues: detalle,
    resumen_despliegue: resumenDespliegue,
  });
}

async function listarGeneradas({ limite = 20 } = {}) {
  const filas = await NavegacionLaboratorio.findAll({
    order: [['fecha_generacion', 'DESC']],
    limit: Math.min(Math.max(Number(limite) || 20, 1), 100),
  });
  const labs = await Laboratorio.findAll();
  const labPorId = new Map(labs.map((lab) => [lab.id, toPlain(lab)]));

  return filas.map((fila) => {
    const data = toPlain(fila);
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

async function generar(req, laboratorioId) {
  const fila = await generarBundle(req, laboratorioId);

  await recordAuditEvent(req, {
    accion: 'EJECUTAR',
    entidad: 'navegacion',
    entidadId: fila.id,
    laboratorioId: fila.laboratorio_id,
    detalle: {
      operacion: 'GENERAR',
      version: fila.version,
      dominios: toPlain(fila).resumen ? toPlain(fila).resumen.dominios : null,
      script_file: NOMBRE_SCRIPT,
    },
  });

  return get(fila.id);
}

function estaEncendido(equipo, estadosVivos) {
  const vivo = estadosVivos && equipo.mesh_agent_id ? estadosVivos.get(equipo.mesh_agent_id) : null;
  return String(vivo || equipo.estado || '').toUpperCase() === ESTADO_ACTIVO;
}

async function despachar({ navegacion, equipo }) {
  const fila = await NavegacionDespliegue.findOne({
    where: { navegacion_id: navegacion.id, equipo_id: equipo.id },
  });
  if (!fila) return { ok: false };

  if (!equipo.mesh_agent_id) {
    await fila.update({
      estado: 'PENDIENTE',
      mensaje_error: 'El equipo no tiene agente MeshCentral registrado.',
    });
    return { ok: false };
  }

  await fila.update({
    estado: 'EN_PROCESO',
    intentos: (fila.intentos || 0) + 1,
    mensaje_error: null,
  });

  try {
    const datos = toPlain(navegacion);
    const resultado = await mesh.aplicarNavegacion({
      nodeid: equipo.mesh_agent_id,
      scriptFile: NOMBRE_SCRIPT,
      version: datos.version,
    });

    if (resultado.equipoApagado) {
      await fila.update({
        estado: 'PENDIENTE',
        fecha_reporte: new Date(),
        mensaje_error: 'El equipo está apagado; la configuración se aplicará cuando se encienda.',
      });
      return resultado;
    }

    await fila.update({
      estado: resultado.ok ? 'COMPLETADO' : 'FALLIDO',
      fecha_reporte: new Date(),
      salida: resultado.salida || null,
      mensaje_error: resultado.ok
        ? null
        : `No se pudo aplicar la configuración (código ${resultado.codigo ?? 'desconocido'}).`,
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

async function desplegar(req, id) {
  const navegacion = await NavegacionLaboratorio.findByPk(id);
  if (!navegacion) throw httpError(404, 'Configuración no encontrada.', 'NAVEGACION_NO_ENCONTRADA');

  const equipos = await Equipo.findAll({ where: { laboratorio_id: navegacion.laboratorio_id } });
  if (!equipos.length) {
    throw httpError(409, 'El laboratorio no tiene equipos registrados.', 'SIN_EQUIPOS');
  }

  for (const equipo of equipos) {
    await NavegacionDespliegue.findOrCreate({
      where: { navegacion_id: navegacion.id, equipo_id: equipo.id },
      defaults: { estado: 'PENDIENTE', intentos: 0 },
    });
  }

  let activos = equipos;
  try {
    const estadosVivos = await mesh.estados();
    if (estadosVivos) activos = equipos.filter((equipo) => estaEncendido(equipo, estadosVivos));
  } catch (err) {
    logger.warn('No se pudieron consultar los estados para el despliegue', { error: err.message });
  }

  for (const equipo of activos) {
    despachar({ navegacion, equipo }).catch((err) => {
      logger.error('No se pudo desplegar la configuración de navegación', { error: err.message });
    });
  }

  await recordAuditEvent(req, {
    accion: 'DESPLEGAR',
    entidad: 'navegacion',
    entidadId: navegacion.id,
    laboratorioId: navegacion.laboratorio_id,
    detalle: {
      operacion: 'DESPLEGAR_NAVEGACION',
      version: toPlain(navegacion).version,
      equipos: equipos.length,
      activos: activos.length,
    },
  });

  return get(navegacion.id);
}

/**
 * CA-09: al cambiar una lista blanca se regenera la configuración y se
 * redespliega en todos los laboratorios con equipos.
 */
async function sincronizar(req, motivo = 'CAMBIO_LISTA') {
  const squid = await regenerarSquid();
  const laboratorios = await Laboratorio.findAll();
  const detalle = [];

  for (const laboratorio of laboratorios) {
    const data = toPlain(laboratorio);
    const equipos = await Equipo.findAll({ where: { laboratorio_id: data.id } });
    if (!equipos.length) continue;

    const navegacion = await generarBundle(req, data.id);
    for (const equipo of equipos) {
      await NavegacionDespliegue.findOrCreate({
        where: { navegacion_id: navegacion.id, equipo_id: equipo.id },
        defaults: { estado: 'PENDIENTE', intentos: 0 },
      });
    }
    detalle.push({
      laboratorio: data.nombre,
      navegacion_id: navegacion.id,
      equipos: equipos.length,
    });

    let activos = equipos;
    try {
      const estadosVivos = await mesh.estados();
      if (estadosVivos) activos = equipos.filter((equipo) => estaEncendido(equipo, estadosVivos));
    } catch (err) {
      logger.warn('Sin estados en vivo para el redespliegue', { error: err.message });
    }

    for (const equipo of activos) {
      despachar({ navegacion, equipo }).catch((err) => {
        logger.error('No se pudo redesplegar la configuración de navegación', {
          error: err.message,
        });
      });
    }

    await recordAuditEvent(req, {
      accion: 'DESPLEGAR',
      entidad: 'navegacion',
      entidadId: navegacion.id,
      laboratorioId: data.id,
      detalle: {
        operacion: 'REDESPLEGUE_AUTOMATICO',
        motivo,
        version: toPlain(navegacion).version,
        equipos: equipos.length,
        activos: activos.length,
      },
    });
  }

  return {
    motivo,
    squid_version: squid.version,
    sesiones: squid.sesiones,
    laboratorios: detalle,
  };
}

/** Dispara la sincronización sin bloquear la respuesta HTTP. */
function programarSincronizacion(req, motivo) {
  sincronizar(req, motivo).catch((err) => {
    logger.error('No se pudo sincronizar la configuración de navegación', {
      motivo,
      error: err.message,
    });
  });
}

function compararSeguro(a, b) {
  const bufferA = Buffer.from(String(a || ''));
  const bufferB = Buffer.from(String(b || ''));
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Registro de sesión del agente de la PC (CA-04).
 *
 * La PC informa qué usuario de SGL inició sesión y desde qué IP; se guarda en
 * sesion_activa y se regenera el Squid para que el filtrado aplique la unión
 * de listas de sus grupos.
 */
async function sesionAgente(req, payload = {}) {
  const clave = req.headers ? req.headers['x-agent-key'] : null;
  if (!compararSeguro(clave, env.navAgentKey)) {
    throw httpError(401, 'Agente no autorizado.', 'AGENTE_NO_AUTORIZADO');
  }

  const hostname = String(payload.hostname || '').trim();
  const sid = String(payload.sid || '').trim();
  if (!hostname) throw httpError(400, 'Falta el nombre del equipo.', 'EQUIPO_REQUERIDO');
  if (!/^S-1-5-[\d-]+$/.test(sid) || sid === 'S-1-5-18') {
    throw httpError(400, 'El SID del usuario no es válido.', 'SID_INVALIDO');
  }

  const equipo = await Equipo.findOne({ where: { hostname: { [Op.iLike]: hostname } } });
  if (!equipo) throw httpError(404, 'El equipo no está registrado en SGL.', 'EQUIPO_NO_REGISTRADO');

  const usuario = await Usuario.findOne({ where: { samba_sid: sid } });
  const ip = /^[0-9a-f.:]+$/i.test(String(payload.ip || '').trim())
    ? String(payload.ip).trim()
    : clientIp(req);

  if (!usuario || usuario.rol !== 'ESTUDIANTE' || !usuario.activo) {
    // Los usuarios fuera de SGL (administradores, docentes) no usan proxy.
    return {
      exento: true,
      proxy: proxyConfig(),
      grupos: [],
      dominios: [],
      mensaje: 'Usuario sin lista blanca: no se aplica proxy.',
    };
  }

  const grupos = await gruposDeUsuario(usuario.id);
  const grupoIds = grupos.map((grupo) => grupo.id);
  const entradas = grupoIds.length
    ? await ListaBlancaUrl.findAll({ where: { grupo_id: grupoIds, activa: true } })
    : [];
  const dominios = unirDominios([
    ...entradas.map((entrada) => toPlain(entrada).url),
    ...(grupos.length ? DOMINIOS_BASE : []),
  ]);

  // Una PC tiene una única sesión activa a la vez.
  const anteriores = await SesionActiva.findAll({
    where: { equipo_id: equipo.id, activa: true },
  });
  for (const anterior of anteriores) {
    if (toPlain(anterior).usuario_id !== usuario.id) {
      await anterior.update({ activa: false, hora_fin: new Date() });
    }
  }

  const actual = anteriores.find((fila) => toPlain(fila).usuario_id === usuario.id) || null;
  const datosSesion = {
    usuario_id: usuario.id,
    equipo_id: equipo.id,
    activa: true,
    hora_fin: null,
    hora_inicio: new Date(),
    ip_origen: ip,
    grupos: grupoIds,
  };
  if (actual) {
    await actual.update(datosSesion);
  } else {
    await SesionActiva.create(datosSesion);
  }

  const squid = await regenerarSquid();

  // RN-010: la aplicación del filtrado es una acción crítica. El actor es el
  // estudiante cuya sesión se está registrando.
  const reqActor = {
    user: { id: usuario.id, uid: usuario.uid, rol: usuario.rol },
    headers: req.headers || {},
    ip: req.ip,
    socket: req.socket,
    method: 'POST',
    originalUrl: '/api/navigation/session',
  };
  await recordAuditEvent(reqActor, {
    accion: 'EJECUTAR',
    entidad: 'navegacion',
    entidadId: equipo.id,
    equipoId: equipo.id,
    laboratorioId: equipo.laboratorio_id,
    detalle: {
      operacion: 'SESION_NAVEGACION',
      equipo: equipo.hostname,
      uid: usuario.uid,
      ip,
      grupos: grupos.map((grupo) => grupo.codigo),
      dominios: dominios.length,
      squid_version: squid.version,
    },
  });

  return {
    exento: false,
    proxy: proxyConfig(),
    grupos: grupos.map((grupo) => grupo.codigo),
    dominios,
    bloqueado: dominios.length === 0,
  };
}

async function configuracion() {
  return {
    proxy: proxyConfig(),
    agent_key_configurada: Boolean(env.navAgentKey),
    squid_config: NOMBRE_SQUID,
    script_pc: NOMBRE_SCRIPT,
    pac: NOMBRE_PAC,
    sesion_horas: Number(env.navSessionHours || 12),
  };
}

module.exports = {
  list,
  crear,
  actualizar,
  eliminar,
  efectivas,
  sesionAgente,
  generar,
  listarGeneradas,
  get,
  desplegar,
  sincronizar,
  regenerarSquid,
  configuracion,
  // Exportadas para pruebas.
  construirSnippetGrupo,
  NOMBRE_SCRIPT,
  NOMBRE_SQUID,
  NOMBRE_PAC,
};
