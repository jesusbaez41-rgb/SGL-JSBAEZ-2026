#!/usr/bin/env node
/**
 * Puente MeshCentral -> SGL.
 *
 * Consulta MeshCentral con `meshctrl ListDevices` y expone una lista
 * normalizada en http://172.18.0.1:4444/devices para el backend SGL.
 *
 * Variables:
 *   BRIDGE_HOST   (default 172.18.0.1)
 *   BRIDGE_PORT   (default 4444)
 *   BRIDGE_TOKEN  token compartido con el backend (x-api-key)
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
const MESHCTRL_PATH =
  process.env.MESHCTRL_PATH || '/opt/meshcentral/node_modules/meshcentral/meshctrl.js';
const MESH_URL = process.env.MESH_URL || 'ws://127.0.0.1:4433/mesh';
const MESH_USER = process.env.MESH_USER || '';
const MESH_PASS = process.env.MESH_PASS || '';

function runMeshctrl(args) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [MESHCTRL_PATH, ...args],
      { timeout: 20000, maxBuffer: 10 * 1024 * 1024 },
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

function normalizeDevice(device) {
  const connected =
    device.conn === true ||
    device.conn === 1 ||
    device.conn === '1' ||
    device.connected === true;

  const users = Array.isArray(device.users)
    ? device.users.filter(Boolean).join(', ')
    : device.users || device.user || null;

  return {
    nodeid: device.nodeid || null,
    hostname: String(device.host || device.name || device.rname || ''),
    ip_address: device.ip || null,
    estado: connected ? 'ENCENDIDO' : 'APAGADO',
    ultimo_reporte: device.lastconnect || device.lastConnect || null,
    usuario_actual: users,
  };
}

async function listDevices() {
  const args = [
    'ListDevices',
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
  const devices = Array.isArray(parsed) ? parsed : parsed.devices || [];
  return devices.map(normalizeDevice);
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
    sendJson(res, 200, { ok: true, service: 'sgl-mesh-bridge' });
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
