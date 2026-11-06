const env = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * Cliente del bridge MeshCentral (HU-COM-03 / HU-COM-04).
 *
 * El bridge es un servicio local en el host que consulta la CLI de
 * MeshCentral y expone una lista normalizada de dispositivos, incluyendo
 * MAC, hostname, IP, estado, usuario activo y último reporte.
 * Si no está configurado, las funciones devuelven null y la API usa
 * únicamente los datos almacenados en PostgreSQL.
 */

function isConfigured() {
  return Boolean(env.meshApiUrl);
}

function normalizeMac(value) {
  const raw = String(value || '').trim().replace(/-/g, ':').toUpperCase();
  const match = raw.match(/([0-9A-F]{2}:){5}[0-9A-F]{2}/);
  if (!match) return null;
  return match[0] === '00:00:00:00:00:00' ? null : match[0];
}

function normalizeReport(value) {
  if (value == null) return null;
  const raw = typeof value === 'object' ? value.time ?? value.timeStamp ?? null : value;
  if (raw == null) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function pickIpv4(net) {
  const table = net && (net.netif2 || net.netif);
  if (!table || typeof table !== 'object') return null;

  const interfaces = [];
  for (const entries of Object.values(table)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || entry.family !== 'IPv4') continue;
      if (!entry.address || entry.address === '0.0.0.0' || entry.address.startsWith('127.')) continue;
      if (String(entry.status || '').toLowerCase() === 'down') continue;
      interfaces.push(entry);
    }
  }

  return (
    interfaces.find((entry) => entry.address === net.defaultRouteIp) ||
    interfaces.find((entry) => normalizeMac(entry.mac)) ||
    interfaces[0] ||
    null
  );
}

function normalizeDevice(device) {
  const node = device.node || device;
  const net = device.net || device.netif || device.netif2 || {};
  const sys = device.sys || device.sysinfo || {};
  const ipv4 = pickIpv4(net);

  const connected =
    node.conn === true ||
    node.conn === 1 ||
    node.conn === '1' ||
    node.connected === true ||
    device.conn === true ||
    device.connected === true;

  const users =
    node.users ||
    node.lusers ||
    node.upnusers ||
    device.users ||
    device.lusers ||
    device.user ||
    null;
  const userText = Array.isArray(users) ? users.filter(Boolean).join(', ') : users;

  const last =
    device.ultimo_reporte ??
    device.lastConnect ??
    node.lastconnect ??
    node.lastConnect ??
    node.agct ??
    (net && net.updateTime) ??
    node.firstconnect ??
    device.firstconnect ??
    null;

  const osinfo = sys.hardware && sys.hardware.windows && sys.hardware.windows.osinfo;

  return {
    nodeid: node._id || node.nodeid || device._id || device.nodeid || null,
    hostname: String(
      node.name || node.rname || node.host || device.name || device.rname || device.hostname || '',
    ).toLowerCase(),
    mac_address:
      normalizeMac(ipv4 && ipv4.mac) ||
      normalizeMac(node.mac) ||
      normalizeMac(device.mac) ||
      normalizeMac(device.mac_address),
    ip_address:
      (ipv4 && ipv4.address) ||
      (net && net.defaultRouteIp) ||
      node.ip ||
      node.host ||
      device.ip ||
      device.ip_address ||
      null,
    estado: device.estado || (connected ? 'ENCENDIDO' : 'APAGADO'),
    ultimo_reporte: normalizeReport(last),
    usuario_actual: device.usuario_actual || userText || null,
    osdesc: node.osdesc || (osinfo ? osinfo.Caption : null),
    groupname: node.groupname || device.groupname || null,
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
    signal: AbortSignal.timeout(Number(env.meshApiTimeoutMs || 8000)),
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

async function getDevice({ hostname, meshAgentId, macAddress }) {
  try {
    const devices = await fetchDevices();
    if (!devices) return null;

    const wantedHost = String(hostname || '').toLowerCase();
    const wantedMac = normalizeMac(macAddress);
    return (
      devices.find((d) => meshAgentId && d.nodeid === meshAgentId) ||
      devices.find((d) => wantedMac && d.mac_address === wantedMac) ||
      devices.find((d) => wantedHost && d.hostname === wantedHost) ||
      null
    );
  } catch (err) {
    logger.warn('No se pudo consultar MeshCentral', { error: err.message });
    return null;
  }
}

module.exports = {
  isConfigured,
  normalizeDevice,
  fetchDevices,
  getDevice,
};
