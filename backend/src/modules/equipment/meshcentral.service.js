const env = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * Cliente del bridge MeshCentral.
 *
 * El bridge es un servicio local en el host que consulta la CLI de
 * MeshCentral y expone una lista normalizada de dispositivos.
 * Si no está configurado, las funciones devuelven null y la API usa
 * únicamente los datos almacenados en PostgreSQL.
 */

function isConfigured() {
  return Boolean(env.meshApiUrl);
}

function normalizeDevice(device) {
  const hostname = String(device.hostname || device.name || device.host || '').toLowerCase();
  const connected = device.conn === true || device.connected === true;
  const users = Array.isArray(device.users)
    ? device.users.filter(Boolean).join(', ')
    : null;

  return {
    nodeid: device.nodeid || device.mesh_agent_id || null,
    hostname,
    estado: device.estado || (connected ? 'ENCENDIDO' : 'APAGADO'),
    ip_address: device.ip_address || device.ip || null,
    ultimo_reporte: device.ultimo_reporte || device.lastconnect || device.lastConnect || null,
    usuario_actual: device.usuario_actual || device.user || users || null,
  };
}

async function fetchDevices() {
  if (!isConfigured()) return null;

  const base = env.meshApiUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/devices`, {
    headers: {
      'x-api-key': env.meshApiToken || '',
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`MeshCentral bridge HTTP ${response.status}`);
  }

  const payload = await response.json();
  const devices = Array.isArray(payload) ? payload : payload.devices;

  if (!Array.isArray(devices)) {
    throw new Error('Respuesta inválida del bridge MeshCentral');
  }

  return devices.map(normalizeDevice);
}

async function getDevice({ hostname, meshAgentId }) {
  try {
    const devices = await fetchDevices();
    if (!devices) return null;

    const wantedHost = String(hostname || '').toLowerCase();
    return (
      devices.find((d) => meshAgentId && d.nodeid === meshAgentId) ||
      devices.find((d) => wantedHost && d.hostname === wantedHost) ||
      null
    );
  } catch (err) {
    logger.warn('No se pudo consultar MeshCentral', { error: err.message });
    return null;
  }
}

module.exports = { isConfigured, fetchDevices, getDevice };
