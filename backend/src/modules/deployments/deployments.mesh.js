const env = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * Cliente del bridge MeshCentral para los despliegues (HU-COM-08).
 *
 * El bridge se ocupa de subir el instalador al equipo y de ejecutar el
 * comando silencioso con `meshctrl RunCommand`; este módulo solo habla con
 * el bridge HTTP local.
 */

function baseUrl() {
  return String(env.meshApiUrl || '').replace(/\/$/, '');
}

function isConfigured() {
  return Boolean(baseUrl());
}

function headers() {
  return {
    'x-api-key': env.meshApiToken || '',
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Fase 1: envía el instalador al equipo (CA-06).
 * El bridge sube el archivo a la carpeta temporal del PC.
 */
async function subir({ nodeid, instalador, parametros }) {
  if (!isConfigured()) {
    throw httpError(503, 'La integración con MeshCentral no está configurada.', 'MESH_NO_CONFIGURADO');
  }

  let response;
  try {
    response = await fetch(`${baseUrl()}/subir`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ nodeid, instalador, parametros: parametros || null }),
      signal: AbortSignal.timeout(Number(env.deploymentUploadTimeoutMs || 300000)),
    });
  } catch (err) {
    throw httpError(502, `No se pudo contactar al bridge MeshCentral: ${err.message}`, 'MESH_NO_CONTACTO');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const mensaje = (payload && payload.error) || `MeshCentral respondió ${response.status}`;
    throw httpError(502, mensaje, 'MESH_ERROR');
  }

  return {
    ok: Boolean(payload && payload.ok),
    rutaRemota: payload ? payload.ruta_remota : null,
    urlDescarga: payload ? payload.url_descarga : null,
    parametros: payload ? payload.parametros : null,
    tipoInstalador: payload ? payload.tipo_instalador : null,
    nombreArchivo: payload ? payload.nombre_archivo : null,
    extension: payload ? payload.extension : null,
    tamano: payload ? payload.tamano : null,
  };
}

/**
 * Fase 2: ejecuta el instalador en el equipo (CA-06, CA-10, CA-11).
 * `ok` indica si la orden terminó correctamente.
 */
async function ejecutar({ nodeid, rutaRemota, urlDescarga, tamano, tipo, parametros, comandoDesinstalacion, resultadoId }) {
  if (!isConfigured()) {
    throw httpError(503, 'La integración con MeshCentral no está configurada.', 'MESH_NO_CONFIGURADO');
  }

  let response;
  try {
    response = await fetch(`${baseUrl()}/ejecutar`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        nodeid,
        ruta_remota: rutaRemota,
        tipo,
        parametros,
        comando_desinstalacion: comandoDesinstalacion || null,
        resultado_id: resultadoId || null,
        url_descarga: urlDescarga || null,
        tamano_instalador: tamano || 0,
      }),
      signal: AbortSignal.timeout(Number(env.deploymentTimeoutMs || 300000)),
    });
  } catch (err) {
    throw httpError(502, `No se pudo contactar al bridge MeshCentral: ${err.message}`, 'MESH_NO_CONTACTO');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const mensaje = (payload && payload.error) || `MeshCentral respondió ${response.status}`;
    throw httpError(502, mensaje, 'MESH_ERROR');
  }

  return {
    ok: Boolean(payload && payload.ok),
    codigo: payload ? payload.codigo : null,
    salida: payload ? payload.salida : null,
    comando: payload ? payload.comando : null,
    // La instalación se lanza desacoplada: hay que consultar el resultado.
    pendiente: Boolean(payload && payload.pendiente),
    equipoApagado: Boolean(payload && payload.error === 'EQUIPO_APAGADO'),
    error: payload && payload.error ? payload.error : null,
  };
}

/**
 * Pide al bridge ejecutar el despliegue en un equipo (CA-06).
 * `ok` indica si la orden terminó correctamente en el equipo (CA-11).
 */
async function desplegar({ nodeid, instalador, tipo, parametros, comandoDesinstalacion }) {
  if (!isConfigured()) {
    throw httpError(503, 'La integración con MeshCentral no está configurada.', 'MESH_NO_CONFIGURADO');
  }

  let response;
  try {
    response = await fetch(`${baseUrl()}/desplegar`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        nodeid,
        instalador,
        tipo,
        parametros,
        comando_desinstalacion: comandoDesinstalacion || null,
      }),
      signal: AbortSignal.timeout(Number(env.deploymentTimeoutMs || 90000)),
    });
  } catch (err) {
    throw httpError(502, `No se pudo contactar al bridge MeshCentral: ${err.message}`, 'MESH_NO_CONTACTO');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const mensaje = (payload && payload.error) || `MeshCentral respondió ${response.status}`;
    throw httpError(502, mensaje, 'MESH_ERROR');
  }

  return {
    ok: Boolean(payload && payload.ok),
    codigo: payload ? payload.codigo : null,
    salida: payload ? payload.salida : null,
    comando: payload ? payload.comando : null,
    // La instalación se lanzó desacoplada: hay que consultar el resultado.
    pendiente: Boolean(payload && payload.pendiente),
    // El agente apagado encola la orden pero no la ejecuta (CA-02).
    equipoApagado: Boolean(payload && payload.error === 'EQUIPO_APAGADO'),
    error: payload && payload.error ? payload.error : null,
  };
}

/**
 * Estados en vivo de todos los equipos, en una sola consulta.
 * Devuelve un Map nodeid -> estado, o null si no se pudo consultar.
 */
async function estados() {
  if (!isConfigured()) return null;

  try {
    const response = await fetch(`${baseUrl()}/devices`, {
      headers: headers(),
      signal: AbortSignal.timeout(Number(env.meshApiTimeoutMs || 15000)),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const devices = Array.isArray(payload) ? payload : payload.devices || [];
    const map = new Map();
    for (const device of devices) {
      if (device.nodeid) map.set(device.nodeid, String(device.estado || '').toUpperCase());
    }
    return map;
  } catch (err) {
    logger.warn('No se pudieron consultar los estados en vivo', { error: err.message });
    return null;
  }
}

/**
 * Lee el resultado de una instalación desacoplada (CA-07, CA-11).
 * Devuelve { listo:false } mientras el instalador siga corriendo.
 */
async function resultado({ nodeid, resultadoId }) {
  if (!isConfigured()) return { listo: false, error: 'MESH_NO_CONFIGURADO' };

  try {
    const response = await fetch(`${baseUrl()}/resultado`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ nodeid, resultado_id: resultadoId }),
      signal: AbortSignal.timeout(Number(env.meshApiTimeoutMs || 15000)),
    });
    if (!response.ok) return { listo: false, error: `HTTP ${response.status}` };
    const payload = await response.json();
    return {
      listo: Boolean(payload && payload.listo),
      ok: Boolean(payload && payload.ok),
      codigo: payload ? payload.codigo : null,
      salida: payload ? payload.salida : null,
      error: payload && payload.error ? payload.error : null,
    };
  } catch (err) {
    return { listo: false, error: err.message };
  }
}

/**
 * Aplica una política AppLocker en el equipo (HU-COM-06, CA-08).
 */
async function aplicarPolitica({ nodeid, xml, nombre, scriptFile, xmlFile }) {
  if (!isConfigured()) {
    throw httpError(503, 'La integración con MeshCentral no está configurada.', 'MESH_NO_CONFIGURADO');
  }

  let response;
  try {
    response = await fetch(`${baseUrl()}/politica`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        nodeid,
        xml,
        nombre,
        script_file: scriptFile || null,
        xml_file: xmlFile || null,
      }),
      signal: AbortSignal.timeout(Number(env.meshApiTimeoutMs || 15000) * 4),
    });
  } catch (err) {
    throw httpError(502, `No se pudo contactar al bridge MeshCentral: ${err.message}`, 'MESH_NO_CONTACTO');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const mensaje = (payload && payload.error) || `MeshCentral respondió ${response.status}`;
    throw httpError(502, mensaje, 'MESH_ERROR');
  }

  return {
    ok: Boolean(payload && payload.ok),
    codigo: payload ? payload.codigo : null,
    salida: payload ? payload.salida : null,
    equipoApagado: Boolean(payload && payload.error === 'EQUIPO_APAGADO'),
    error: payload && payload.error ? payload.error : null,
  };
}

/**
 * Estado actual de un equipo según MeshCentral. Si el bridge no responde se
 * devuelve null y el llamador conserva el estado guardado (CA-02).
 */
async function estadoEquipo(meshAgentId) {
  if (!isConfigured() || !meshAgentId) return null;

  try {
    const response = await fetch(`${baseUrl()}/devices`, {
      headers: headers(),
      signal: AbortSignal.timeout(Number(env.meshApiTimeoutMs || 8000)),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const devices = Array.isArray(payload) ? payload : payload.devices || [];
    const device = devices.find((d) => d.nodeid === meshAgentId);
    if (!device) return null;
    return {
      estado: device.estado,
      hostname: device.hostname,
      ultimo_reporte: device.ultimo_reporte,
    };
  } catch (err) {
    logger.warn('No se pudo consultar el estado del equipo en MeshCentral', { error: err.message });
    return null;
  }
}

module.exports = {
  isConfigured,
  subir,
  ejecutar,
  resultado,
  desplegar,
  estados,
  estadoEquipo,
  aplicarPolitica,
};
