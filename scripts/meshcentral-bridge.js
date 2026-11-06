#!/usr/bin/env node
/**
 * Puente MeshCentral -> SGL.
 *
 * Consulta MeshCentral con `meshctrl ListDevices --details` y expone una lista
 * normalizada en http://172.18.0.1:4444/devices para el backend SGL.
 *
 * La variante `--details` incluye `net.netif2`, de donde se obtiene la MAC de
 * la interfaz Ethernet. También incluye el estado del agente, IP, usuario
 * activo, último reporte y sistema operativo.
 *
 * Variables:
 *   BRIDGE_HOST   (default 172.18.0.1)
 *   BRIDGE_PORT   (default 4444)
 *   BRIDGE_TOKEN  token compartido con el backend (x-api-key)
 *   BRIDGE_CACHE_MS caché en memoria de la lista (default 5000)
 *   MESHCTRL_PATH ruta a meshctrl.js
 *   MESH_URL      URL WebSocket de MeshCentral (ws://127.0.0.1:4433/mesh)
 *   MESH_USER     usuario MeshCentral
 *   MESH_PASS     contraseña MeshCentral
 */
const http = require('http');
const { execFile } = require('child_process');

const HOST = process.env.BRIDGE_HOST || '172.18.0.1';
const PORT = Number(process.env.BRIDGE_PORT || 4444);
const TOKEN = process.env.BRIDGE_TOKEN || '';
const CACHE_MS = Number(process.env.BRIDGE_CACHE_MS || 5000);
const MESHCTRL_PATH =
  process.env.MESHCTRL_PATH || '/opt/meshcentral/node_modules/meshcentral/meshctrl.js';
const MESH_URL = process.env.MESH_URL || 'ws://127.0.0.1:4433/mesh';
const MESH_USER = process.env.MESH_USER || '';
const MESH_PASS = process.env.MESH_PASS || '';

let cache = { at: 0, devices: null };

function runMeshctrl(args) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [MESHCTRL_PATH, ...args],
      { timeout: 30000, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || '').trim() || 'meshctrl falló'));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function parseJson(text) {
  const trimmed = String(text || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* sigue abajo */
  }

  const startArray = trimmed.indexOf('[');
  const endArray = trimmed.lastIndexOf(']');
  if (startArray >= 0 && endArray > startArray) {
    try {
      return JSON.parse(trimmed.slice(startArray, endArray + 1));
    } catch {
      /* sigue abajo */
    }
  }

  const startObject = trimmed.indexOf('{');
  const endObject = trimmed.lastIndexOf('}');
  if (startObject >= 0 && endObject > startObject) {
    try {
      return JSON.parse(trimmed.slice(startObject, endObject + 1));
    } catch {
      /* sigue abajo */
    }
  }

  throw new Error('No se pudo interpretar la salida JSON de meshctrl');
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

function pickIpv4Interfaces(net) {
  const table = net && (net.netif2 || net.netif);
  if (!table || typeof table !== 'object') return [];

  const result = [];
  for (const [name, entries] of Object.entries(table)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || entry.family !== 'IPv4') continue;
      if (!entry.address || entry.address === '0.0.0.0' || entry.address.startsWith('127.')) continue;
      if (String(entry.status || '').toLowerCase() === 'down') continue;
      result.push({ name, ...entry });
    }
  }
  return result;
}

function pickIpv4(net) {
  const interfaces = pickIpv4Interfaces(net);
  const preferred =
    interfaces.find((entry) => entry.address === net.defaultRouteIp) ||
    interfaces.find((entry) => normalizeMac(entry.mac)) ||
    interfaces[0] ||
    null;
  return preferred;
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
    device.conn === true;

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
    device.lastConnect ??
    node.lastconnect ??
    node.lastConnect ??
    node.agct ??
    (net && net.updateTime) ??
    node.firstconnect ??
    device.firstconnect ??
    null;

  return {
    nodeid: node._id || node.nodeid || device._id || device.nodeid || null,
    hostname: String(
      node.name || node.rname || node.host || device.name || device.rname || device.hostname || '',
    ).toLowerCase(),
    mac_address: normalizeMac(ipv4 && ipv4.mac) || normalizeMac(node.mac) || normalizeMac(device.mac_address),
    ip_address:
      (ipv4 && ipv4.address) ||
      (net && net.defaultRouteIp) ||
      node.ip ||
      node.host ||
      device.ip ||
      device.ip_address ||
      null,
    estado: connected ? 'ENCENDIDO' : 'APAGADO',
    ultimo_reporte: normalizeReport(last),
    usuario_actual: userText || null,
    osdesc: node.osdesc || (sys.hardware && sys.hardware.windows && sys.hardware.windows.osinfo
      ? sys.hardware.windows.osinfo.Caption
      : null),
    groupname: node.groupname || device.groupname || null,
  };
}

async function listDevices() {
  if (cache.devices && Date.now() - cache.at < CACHE_MS) {
    return cache.devices;
  }

  const args = [
    'ListDevices',
    '--details',
    '--loginuser',
    MESH_USER,
    '--loginpass',
    MESH_PASS,
    '--url',
    MESH_URL,
    '--ignorecert',
    '--json',
  ];

  const output = await runMeshctrl(args);
  const parsed = parseJson(output);
  const raw = Array.isArray(parsed) ? parsed : parsed.devices || [];
  const devices = raw.map(normalizeDevice);

  cache = { at: Date.now(), devices };
  return devices;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'sgl-mesh-bridge',
      cached: Boolean(cache.devices),
      cache_age_ms: cache.devices ? Date.now() - cache.at : null,
    });
    return;
  }

  if (url.pathname !== '/devices') {
    sendJson(res, 404, { error: 'Ruta no encontrada' });
    return;
  }

  if (!TOKEN || req.headers['x-api-key'] !== TOKEN) {
    sendJson(res, 401, { error: 'API key inválida' });
    return;
  }

  try {
    const devices = await listDevices();
    sendJson(res, 200, { devices });
  } catch (err) {
    console.error('[mesh-bridge]', err.message);
    sendJson(res, 502, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[mesh-bridge] escuchando en http://${HOST}:${PORT}`);
});
