const {
  Aplicacion,
  Despliegue,
  DespliegueEquipo,
  Equipo,
  Laboratorio,
  VinculoAppLab,
} = require('../../models');
const { recordAuditEvent } = require('../audit/audit.service');
const { assertAppLinked } = require('../apps/apps.service');
const mesh = require('./deployments.mesh');
const logger = require('../../utils/logger');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS = Object.freeze(['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FALLIDO']);
const TIPOS = Object.freeze(['INSTALAR', 'DESINSTALAR']);
const ESTADO_ACTIVO = 'ENCENDIDO';

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

function normalizeTipo(tipo) {
  const value = String(tipo || 'INSTALAR').trim().toUpperCase();
  if (!TIPOS.includes(value)) {
    throw httpError(400, 'Tipo de despliegue inválido.', 'TIPO_INVALIDO', { tipos: TIPOS });
  }
  return value;
}

/**
 * Un equipo apagado no es un fallo: queda PENDIENTE (CA-02).
 * Un timeout del bridge, en cambio, es un fallo de la orden: FALLIDO.
 */
function esEquipoApagado(mensaje) {
  const texto = String(mensaje || '').toLowerCase();

  if (
    texto.includes('timeout') ||
    texto.includes('timed out') ||
    texto.includes('abortado') ||
    texto.includes('no se pudo contactar')
  ) {
    return false;
  }

  return (
    texto.includes('not connected') ||
    texto.includes('offline') ||
    texto.includes('no está conectado') ||
    texto.includes('desconectado') ||
    texto.includes('apagado')
  );
}

/**
 * Indica si el equipo está encendido AHORA. Usa el estado en vivo de
 * MeshCentral y cae al estado guardado si no se pudo consultar.
 * Esto evita desplegar (o dejar pendiente) por un dato viejo de la BD.
 */
function estaEncendido(equipo, estadosVivos) {
  const vivo = estadosVivos && equipo.mesh_agent_id
    ? estadosVivos.get(equipo.mesh_agent_id)
    : null;
  const estado = String(vivo || equipo.estado || '').toUpperCase();
  return estado === ESTADO_ACTIVO;
}

function resumenDe(estados) {
  const resumen = { PENDIENTE: 0, EN_PROCESO: 0, COMPLETADO: 0, FALLIDO: 0 };
  for (const estado of estados) {
    if (resumen[estado] !== undefined) resumen[estado] += 1;
  }
  return resumen;
}

function toEquipo(row, equipo) {
  const data = toPlain(row);
  const eq = toPlain(equipo) || {};
  return {
    id: data.id,
    despliegue_id: data.despliegue_id,
    equipo_id: data.equipo_id,
    hostname: eq.hostname || null,
    mac_address: eq.mac_address || null,
    ip_address: eq.ip_address || null,
    equipo_estado: eq.estado || null,
    estado: data.estado,
    fase: data.fase || null,
    intentos: data.intentos,
    mensaje_error: data.mensaje_error || null,
    salida: data.salida || null,
    fecha_reporte: data.fecha_reporte || null,
  };
}

function toDespliegue(despliegue, filas = [], extras = {}) {
  const data = toPlain(despliegue);
  const equipos = filas.map((fila) => toEquipo(fila.row, fila.equipo));

  return {
    id: data.id,
    vinculo_id: data.vinculo_id,
    usuario_id: data.usuario_id,
    tipo: data.tipo,
    fecha_inicio: data.fecha_inicio || null,
    fecha_fin: data.fecha_fin || null,
    total_equipos: data.total_equipos || 0,
    app: extras.app || null,
    laboratorio: extras.laboratorio || null,
    vinculo: extras.vinculo || null,
    usuario: extras.usuario || null,
    resumen: resumenDe(equipos.map((e) => e.estado)),
    equipos,
  };
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

/**
 * Lista los despliegues con el resumen de estados por equipo (CA-03).
 */
async function list({ limite = 50 } = {}) {
  const despliegues = await Despliegue.findAll({
    order: [['fecha_inicio', 'DESC']],
    limit: Math.min(Math.max(Number(limite) || 50, 1), 200),
  });

  const ids = despliegues.map((d) => d.id);
  const filas = ids.length
    ? await DespliegueEquipo.findAll({ where: { despliegue_id: ids } })
    : [];

  const vinculos = await VinculoAppLab.findAll({
    where: { id: despliegues.map((d) => d.vinculo_id) },
  });
  const vinculoPorId = new Map(vinculos.map((v) => [v.id, toPlain(v)]));
  const appIds = [...new Set(vinculos.map((v) => v.app_id))];
  const apps = appIds.length ? await Aplicacion.findAll({ where: { id: appIds } }) : [];
  const appPorId = new Map(apps.map((a) => [a.id, toPlain(a)]));
  const labIds = [...new Set(vinculos.map((v) => v.laboratorio_id))];
  const labs = labIds.length ? await Laboratorio.findAll({ where: { id: labIds } }) : [];
  const labPorId = new Map(labs.map((l) => [l.id, toPlain(l)]));

  return despliegues.map((despliegue) => {
    const propias = filas.filter((f) => f.despliegue_id === despliegue.id);
    const vinculo = vinculoPorId.get(despliegue.vinculo_id) || null;
    const app = vinculo ? appPorId.get(vinculo.app_id) || null : null;
    const lab = vinculo ? labPorId.get(vinculo.laboratorio_id) || null : null;

    return toDespliegue(despliegue, propias.map((row) => ({ row, equipo: null })), {
      app: app ? { id: app.id, nombre: app.nombre, version: app.version } : null,
      laboratorio: lab ? { id: lab.id, nombre: lab.nombre } : null,
      vinculo: vinculo ? { id: vinculo.id, version: vinculo.version } : null,
    });
  });
}

/**
 * Detalle de un despliegue con el estado de cada equipo (CA-03).
 */
async function get(id) {
  assertValidId(id, 'Identificador de despliegue');

  const despliegue = await Despliegue.findByPk(id);
  if (!despliegue) throw httpError(404, 'Despliegue no encontrado.', 'DESPLIEGUE_NO_ENCONTRADO');

  const filas = await DespliegueEquipo.findAll({
    where: { despliegue_id: despliegue.id },
    order: [['id', 'ASC']],
  });

  const equipoIds = [...new Set(filas.map((f) => f.equipo_id))];
  const equipos = equipoIds.length
    ? await Equipo.findAll({ where: { id: equipoIds } })
    : [];
  const equipoPorId = new Map(equipos.map((e) => [e.id, e]));

  const vinculo = await VinculoAppLab.findByPk(despliegue.vinculo_id);
  let app = null;
  let laboratorio = null;
  if (vinculo) {
    const appRow = await Aplicacion.findByPk(vinculo.app_id);
    const labRow = await Laboratorio.findByPk(vinculo.laboratorio_id);
    app = appRow
      ? { id: appRow.id, nombre: appRow.nombre, version: appRow.version }
      : null;
    laboratorio = labRow ? { id: labRow.id, nombre: labRow.nombre } : null;
  }

  return toDespliegue(
    despliegue,
    filas.map((row) => ({ row, equipo: equipoPorId.get(row.equipo_id) || null })),
    {
      app,
      laboratorio,
      vinculo: vinculo
        ? { id: vinculo.id, version: vinculo.version, activo: Boolean(vinculo.activo) }
        : null,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Despacho                                                            */
/* ------------------------------------------------------------------ */

/**
 * Espera el resultado de una instalación desacoplada consultando el
 * archivo de resultado con comandos cortos (el agente queda libre).
 */
async function esperarResultado({
  nodeid,
  resultadoId,
  timeoutMs = 600000,
  intervaloMs = Number(process.env.DEPLOYMENT_POLL_MS || 1000),
}) {
  const fin = Date.now() + timeoutMs;
  while (Date.now() < fin) {
    const estado = await mesh.resultado({ nodeid, resultadoId });
    if (estado.listo) return estado;
    if (estado.error === 'EQUIPO_APAGADO') return { ...estado, equipoApagado: true };
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
  }
  return { listo: false, timeout: true };
}

/** Cierra el despliegue cuando todos sus equipos terminaron. */
async function refrescarEstadoDespliegue(despliegueId) {
  const filas = await DespliegueEquipo.findAll({ where: { despliegue_id: despliegueId } });
  if (!filas.length) return;

  const pendientes = filas.filter((f) => f.estado === 'PENDIENTE' || f.estado === 'EN_PROCESO');
  const despliegue = await Despliegue.findByPk(despliegueId);
  if (!despliegue) return;

  if (pendientes.length === 0 && !despliegue.fecha_fin) {
    await despliegue.update({ fecha_fin: new Date() });
  }
}

/**
 * Envía la orden a un equipo y actualiza su estado (CA-06, CA-07, CA-11).
 *
 * Un equipo que no responde porque está apagado vuelve a PENDIENTE y queda
 * en la cola de reintentos (CA-02).
 */
async function despacharEquipo({ row, equipo, app, tipo }) {
  const nodeid = equipo.mesh_agent_id;

  if (!nodeid) {
    await row.update({
      estado: 'PENDIENTE',
      fase: 'ESPERANDO',
      mensaje_error: 'El equipo no tiene agente MeshCentral registrado.',
    });
    return { ok: false, motivo: 'SIN_AGENTE' };
  }

  await row.update({
    estado: 'EN_PROCESO',
    fase: 'PREPARANDO',
    intentos: (row.intentos || 0) + 1,
    mensaje_error: null,
    salida: null,
    fecha_reporte: null,
  });

  // Fase 1: envio del instalador al equipo (CA-06).
  let subida = null;
  try {
    await row.update({ fase: 'ENVIANDO' });
    subida = await mesh.subir({
      nodeid,
      instalador: app.ruta_instalador,
      parametros: app.parametros_silenciosos,
    });
  } catch (err) {
    const apagado = esEquipoApagado(err.message);
    await row.update({
      estado: apagado ? 'PENDIENTE' : 'FALLIDO',
      fase: apagado ? 'ESPERANDO' : 'FINALIZADO',
      fecha_reporte: new Date(),
      mensaje_error: apagado
        ? 'El equipo está apagado; la orden se reintentará al encenderse.'
        : `No se pudo enviar el instalador: ${String(err.message || '').slice(0, 400)}`,
    });
    await refrescarEstadoDespliegue(row.despliegue_id);
    return { ok: false, error: err.message, equipoApagado: apagado };
  }

  // Fase 2: ejecucion silenciosa en el equipo (CA-06, CA-10, CA-11).
  try {
    await row.update({ fase: 'EJECUTANDO' });
    const result = await mesh.ejecutar({
      nodeid,
      rutaRemota: subida.rutaRemota,
      urlDescarga: subida.urlDescarga,
      tamano: subida.tamano,
      tipo,
      parametros: subida.parametros || app.parametros_silenciosos,
      comandoDesinstalacion: app.comando_desinstalacion,
      resultadoId: row.id,
    });

    // Instalación desacoplada: se consulta el resultado por polling para no
    // dejar al agente bloqueado mientras corre el instalador.
    const final = result.pendiente
      ? await esperarResultado({ nodeid, resultadoId: row.id })
      : result;

    if (final.timeout) {
      await row.update({
        estado: 'FALLIDO',
        fase: 'FINALIZADO',
        fecha_reporte: new Date(),
        mensaje_error: 'El instalador no terminó en el tiempo esperado.',
      });
      await refrescarEstadoDespliegue(row.despliegue_id);
      return { ok: false, timeout: true };
    }

    if (final.equipoApagado) {
      await row.update({
        estado: 'PENDIENTE',
        fase: 'ESPERANDO',
        fecha_reporte: new Date(),
        salida: final.salida || null,
        mensaje_error:
          'El equipo está apagado; la orden se reintentará al encenderse.',
      });
      await refrescarEstadoDespliegue(row.despliegue_id);
      return final;
    }

    const resultFinal = {
      ok: Boolean(final.ok),
      codigo: final.codigo ?? null,
      salida: final.salida || null,
    };

    await row.update({
      estado: resultFinal.ok ? 'COMPLETADO' : 'FALLIDO',
      fase: 'FINALIZADO',
      fecha_reporte: new Date(),
      salida: resultFinal.salida,
      mensaje_error: resultFinal.ok
        ? null
        : String(resultFinal.salida || '').includes('SGL_MOTIVO=TIMEOUT')
          ? 'El instalador no terminó en 3 minutos: revisá los parámetros silenciosos (por ejemplo /S o /qn).'
          : `El instalador terminó con el código ${resultFinal.codigo ?? 'desconocido'}.`,
    });

    await refrescarEstadoDespliegue(row.despliegue_id);
    return resultFinal;
  } catch (err) {
    const apagado = esEquipoApagado(err.message);
    await row.update({
      estado: apagado ? 'PENDIENTE' : 'FALLIDO',
      fase: apagado ? 'ESPERANDO' : 'FINALIZADO',
      fecha_reporte: new Date(),
      mensaje_error: apagado
        ? 'El equipo está apagado; la orden se reintentará al encenderse.'
        : `No se pudo ejecutar la orden: ${String(err.message || '').slice(0, 400)}`,
    });
    await refrescarEstadoDespliegue(row.despliegue_id);
    return { ok: false, error: err.message, equipoApagado: apagado };
  }
}

/**
 * Crea un despliegue masivo (RN-003).
 *
 * La app debe estar vinculada al laboratorio (CA-05 / RN-002). A todos los
 * equipos del laboratorio se les crea fila: los encendidos se despachan de
 * inmediato y los apagados quedan PENDIENTE (CA-02).
 */
async function create(req, payload) {
  const tipo = normalizeTipo(payload.tipo);
  assertValidId(payload.app_id, 'Identificador de aplicación');
  assertValidId(payload.laboratorio_id, 'Identificador de laboratorio');

  const app = await Aplicacion.findByPk(payload.app_id);
  if (!app) throw httpError(404, 'Aplicación no encontrada.', 'APP_NO_ENCONTRADA');

  const laboratorio = await Laboratorio.findByPk(payload.laboratorio_id);
  if (!laboratorio) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');

  // CA-05 / RN-002: sin vínculo previo no hay despliegue.
  await assertAppLinked(laboratorio.id, app.id);

  const vinculo = await VinculoAppLab.findOne({
    where: { app_id: app.id, laboratorio_id: laboratorio.id, activo: true },
  });
  if (!vinculo) {
    throw httpError(409, 'La aplicación no está vinculada al laboratorio.', 'APP_NO_VINCULADA');
  }

  if (tipo === 'DESINSTALAR' && !app.comando_desinstalacion) {
    const esMsi = String(app.ruta_instalador || '').toLowerCase().endsWith('.msi');
    if (!esMsi) {
      throw httpError(
        400,
        'La aplicación no define comando de desinstalación.',
        'DESINSTALACION_NO_DEFINIDA',
      );
    }
  }

  // RN-003: todas las PCs del laboratorio; solo las activas se despachan.
  const equipos = await Equipo.findAll({
    where: { laboratorio_id: laboratorio.id },
    order: [['hostname', 'ASC']],
  });

  const despliegue = await Despliegue.create({
    vinculo_id: vinculo.id,
    usuario_id: req.user.id,
    tipo,
    total_equipos: equipos.length,
  });

  const filas = [];
  for (const equipo of equipos) {
    const row = await DespliegueEquipo.create({
      despliegue_id: despliegue.id,
      equipo_id: equipo.id,
      estado: 'PENDIENTE',
      intentos: 0,
    });
    filas.push({ row, equipo });
  }

  await recordAuditEvent(req, {
    accion: 'DESPLEGAR',
    entidad: 'despliegue',
    entidadId: despliegue.id,
    laboratorioId: laboratorio.id,
    detalle: {
      tipo,
      app: app.nombre,
      version: app.version,
      laboratorio: laboratorio.nombre,
      total_equipos: equipos.length,
      instalador: app.ruta_instalador,
    },
  });

  // CA-01: la orden se envía sin esperar la respuesta del equipo, así que la
  // API responde de inmediato y el resultado se va reflejando por equipo.
  // El estado se consulta EN VIVO a MeshCentral, no se confía en la BD.
  const estadosVivos = await mesh.estados();
  const activos = filas.filter(({ equipo }) => estaEncendido(equipo, estadosVivos));
  const despachos = activos.map(({ row, equipo }) =>
    despacharEquipo({ row, equipo, app, tipo }),
  );
  Promise.allSettled(despachos).catch(() => {});
  for (const despacho of despachos) {
    despacho.catch((err) => {
      logger.error('No se pudo despachar un equipo', { error: err.message });
    });
  }

  return get(despliegue.id);
}

/**
 * Reintenta los equipos PENDIENTE o FALLIDO de un despliegue (CA-08).
 * Solo se despachan los que están encendidos; los demás siguen PENDIENTE.
 */
async function retry(req, id, payload = {}) {
  assertValidId(id, 'Identificador de despliegue');

  const despliegue = await Despliegue.findByPk(id);
  if (!despliegue) throw httpError(404, 'Despliegue no encontrado.', 'DESPLIEGUE_NO_ENCONTRADO');

  const vinculo = await VinculoAppLab.findByPk(despliegue.vinculo_id);
  if (!vinculo) {
    throw httpError(409, 'El vínculo de la aplicación ya no existe.', 'VINCULO_NO_ENCONTRADO');
  }
  const app = await Aplicacion.findByPk(vinculo.app_id);
  if (!app) throw httpError(404, 'Aplicación no encontrada.', 'APP_NO_ENCONTRADA');

  const where = { despliegue_id: despliegue.id };
  if (payload.equipo_id) {
    assertValidId(payload.equipo_id, 'Identificador de equipo');
    where.equipo_id = payload.equipo_id;
  }

  const filas = await DespliegueEquipo.findAll({ where });
  const reintentables = filas.filter((f) => f.estado === 'PENDIENTE' || f.estado === 'FALLIDO');

  if (!reintentables.length) {
    return { reintentados: 0, pendientes: 0, despliegue: await get(despliegue.id) };
  }

  const equipos = await Equipo.findAll({
    where: { id: [...new Set(reintentables.map((f) => f.equipo_id))] },
  });
  const equipoPorId = new Map(equipos.map((e) => [e.id, e]));

  let reintentados = 0;
  let pendientes = 0;

  const estadosVivos = await mesh.estados();

  for (const fila of reintentables) {
    const equipo = equipoPorId.get(fila.equipo_id);
    if (!equipo) {
      pendientes += 1;
      continue;
    }

    // CA-02: el estado real se consulta en MeshCentral antes de reintentar.
    const enLinea = estadosVivos
      ? estaEncendido(equipo, estadosVivos)
      : estaEncendido(equipo, null);

    if (!enLinea) {
      await fila.update({
        estado: 'PENDIENTE',
        fase: 'ESPERANDO',
        mensaje_error: 'El equipo está apagado; se reintentará al encenderse.',
      });
      pendientes += 1;
      continue;
    }

    await fila.update({ estado: 'PENDIENTE', mensaje_error: null });
    despacharEquipo({ row: fila, equipo, app, tipo: despliegue.tipo }).catch((err) => {
      logger.error('No se pudo reintentar un equipo', { error: err.message });
    });
    reintentados += 1;
  }

  await recordAuditEvent(req, {
    accion: 'DESPLEGAR',
    entidad: 'despliegue',
    entidadId: despliegue.id,
    detalle: {
      operacion: 'REINTENTAR',
      tipo: despliegue.tipo,
      reintentados,
      pendientes,
    },
  });

  return { reintentados, pendientes, despliegue: await get(despliegue.id) };
}

/**
 * Barrido de reintentos: las PCs que se encendieron reciben la orden
 * pendiente sin intervención del administrador (CA-02).
 */
async function sweep() {
  const filas = await DespliegueEquipo.findAll({ where: { estado: 'PENDIENTE' } });
  if (!filas.length) return { reintentados: 0, equipos: 0 };

  const despliegueIds = [...new Set(filas.map((f) => f.despliegue_id))];
  const despliegues = await Despliegue.findAll({ where: { id: despliegueIds } });
  const desplieguePorId = new Map(despliegues.map((d) => [d.id, d]));

  const equipos = await Equipo.findAll({
    where: { id: [...new Set(filas.map((f) => f.equipo_id))] },
  });
  const equipoPorId = new Map(equipos.map((e) => [e.id, e]));

  const vinculoIds = [...new Set(despliegues.map((d) => d.vinculo_id))];
  const vinculos = await VinculoAppLab.findAll({ where: { id: vinculoIds } });
  const vinculoPorId = new Map(vinculos.map((v) => [v.id, v]));

  let reintentados = 0;

  const estadosVivos = await mesh.estados();

  for (const fila of filas) {
    const despliegue = desplieguePorId.get(fila.despliegue_id);
    if (!despliegue) continue;

    const equipo = equipoPorId.get(fila.equipo_id);
    if (!equipo) continue;

    if (!estadosVivos) continue;
    if (!estaEncendido(equipo, estadosVivos)) continue;

    const vinculo = vinculoPorId.get(despliegue.vinculo_id);
    if (!vinculo) continue;
    const app = await Aplicacion.findByPk(vinculo.app_id);
    if (!app) continue;

    await fila.update({ estado: 'PENDIENTE', mensaje_error: null });
    despacharEquipo({ row: fila, equipo, app, tipo: despliegue.tipo }).catch((err) => {
      logger.error('No se pudo reintentar un equipo encendiéndose', { error: err.message });
    });
    reintentados += 1;
  }

  if (reintentados > 0) {
    logger.info('Barrido de despliegues: equipos reintentados', { reintentados });
  }

  return { reintentados, equipos: filas.length };
}

module.exports = {
  ESTADOS,
  TIPOS,
  list,
  get,
  create,
  retry,
  sweep,
  despacharEquipo,
  refrescarEstadoDespliegue,
};
