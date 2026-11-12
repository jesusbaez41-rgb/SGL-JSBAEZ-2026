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
 * HU-COM-08: además expone POST /desplegar, que sube el instalador al equipo
 * y ejecuta la instalación (o desinstalación) silenciosa con MeshCentral:
 *   - `meshctrl Upload` deja el instalador en una carpeta temporal del PC;
 *   - `meshctrl RunCommand --powershell --reply` ejecuta el comando con
 *     privilegios del agente (servicio de sistema) y devuelve la salida.
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
 *   INSTALLERS_DIR  directorio local con los instaladores (default /opt/sgl-instaladores)
 *   REMOTE_TEMP_DIR carpeta temporal en el PC (default C:\Windows\Temp)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
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
const INSTALLERS_DIR = process.env.INSTALLERS_DIR || '/opt/sgl-instaladores';
const REMOTE_TEMP_DIR = process.env.REMOTE_TEMP_DIR || 'C:\\Windows\\Temp';
const COMMAND_TIMEOUT_MS = Number(process.env.MESH_COMMAND_TIMEOUT_MS || 240000);
// HU-COM-08: los equipos descargan el instalador por HTTP desde SGL.
const INSTALADORES_URL = process.env.INSTALADORES_URL || 'http://192.168.100.58:8080/instaladores';
// Timeout del instalador en el equipo: evita que un dialogo invisible
// (por ejemplo, un paquete invalido) deje el comando colgado para siempre.
const INSTALL_TIMEOUT_MS = Number(process.env.MESH_INSTALL_TIMEOUT_MS || 180000);
// El polling del resultado usa un timeout corto: si el agente esta ocupado
// conviene reintentar pronto y no bloquear el ciclo.
const POLL_TIMEOUT_MS = Number(process.env.MESH_POLL_TIMEOUT_MS || 10000);

let cache = { at: 0, devices: null };

function runMeshctrl(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [MESHCTRL_PATH, ...args],
      { timeout: timeoutMs || COMMAND_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
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

/** Argumentos comunes de autenticación contra MeshCentral. */
function authArgs() {
  return [
    '--loginuser',
    MESH_USER,
    '--loginpass',
    MESH_PASS,
    '--url',
    MESH_URL,
    '--ignorecert',
  ];
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

  return interfaces;
}

function pickIpv4(net) {
  const interfaces = pickIpv4Interfaces(net);
  if (!interfaces.length) return null;

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

/* ------------------------------------------------------------------ */
/* HU-COM-08: despliegue remoto de instaladores                       */
/* ------------------------------------------------------------------ */

/** Cita un valor para PowerShell (comillas simples escapadas). */
function psQuote(value) {
  return `'${String(value == null ? '' : value).replace(/'/g, "''")}'`;
}

/**
 * Detecta el tipo de instalador leyendo el archivo y devuelve los
 * parametros silenciosos que corresponden a ese tipo.
 *
 * No hay un flag universal: MSI usa msiexec, NSIS /S, Inno Setup
 * /VERYSILENT, InstallShield /s y WiX Burn /quiet. Si el administrador
 * definio parametros propios, esos tienen prioridad.
 */
function detectarInstalador(localFile) {
  const extension = path.extname(localFile).toLowerCase();

  if (extension === '.msi') {
    return { tipo: 'msi', parametros: '/qn /norestart' };
  }

  let firma = '';
  try {
    const tamano = fs.statSync(localFile).size;
    const limite = Math.min(tamano, 8 * 1024 * 1024);
    const fd = fs.openSync(localFile, 'r');
    const buffer = Buffer.alloc(limite);
    fs.readSync(fd, buffer, 0, limite, 0);
    fs.closeSync(fd);
    firma = buffer.toString('latin1');
  } catch (err) {
    return { tipo: 'desconocido', parametros: '' };
  }

  if (firma.includes('Nullsoft') || firma.includes('NSIS')) {
    return { tipo: 'nsis', parametros: '/S' };
  }
  if (firma.includes('Inno Setup') || firma.includes('InnoSetup')) {
    // /CLOSEAPPLICATIONS y /FORCECLOSEAPPLICATIONS cierran la app si esta
    // corriendo; sin esto el instalador se aborta (exit 1).
    return {
      tipo: 'inno',
      parametros: '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /FORCECLOSEAPPLICATIONS',
    };
  }
  if (firma.includes('InstallShield')) {
    return { tipo: 'installshield', parametros: '/s /v"/qn"' };
  }
  if (firma.includes('WixBundle') || firma.includes('burn.exe') || firma.includes('Burn')) {
    return { tipo: 'wix', parametros: '/quiet' };
  }

  // Sin firma conocida: /S es la opcion mas comun en instaladores pequenos.
  return { tipo: 'desconocido', parametros: '/S' };
}

/**
 * Divide los parametros silenciosos en argumentos sueltos.
 */
function splitParams(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Comando PowerShell de instalación silenciosa (CA-10).
 * El agente de MeshCentral corre como servicio de sistema (CA-09).
 */
function buildInstallCommand({ remotePath, extension, parametros }) {
  const params = splitParams(parametros);

  if (extension === '.msi') {
    const args = ['/i', remotePath, '/qn', '/norestart', ...params].map(psQuote).join(',');
    return (
      `$p = Start-Process -FilePath 'msiexec.exe' ` +
      `-ArgumentList ${args} ` +
      `-PassThru -WindowStyle Hidden; ` +
      `if ($p.WaitForExit(${INSTALL_TIMEOUT_MS})) { $code = $p.ExitCode } else { $p.Kill(); $code = 1603; $motivo = 'TIMEOUT' }`
    );
  }

  const args = params.map(psQuote).join(',');
  const argList = args ? ` -ArgumentList ${args}` : '';
  return (
    `$p = Start-Process -FilePath ${psQuote(remotePath)}${argList} ` +
    `-PassThru -WindowStyle Hidden; ` +
    `if ($p.WaitForExit(${INSTALL_TIMEOUT_MS})) { $code = $p.ExitCode } else { $p.Kill(); $code = 1603; $motivo = 'TIMEOUT' }`
  );
}

/** Comando PowerShell de desinstalación (CA-04). */
function buildUninstallCommand({ remotePath, extension, parametros, comandoDesinstalacion }) {
  const custom = String(comandoDesinstalacion || '').trim();
  if (custom) return custom;

  if (extension === '.msi') {
    const params = splitParams(parametros);
    const args = ['/x', remotePath, '/qn', '/norestart', ...params].map(psQuote).join(',');
    return (
      `$p = Start-Process -FilePath 'msiexec.exe' ` +
      `-ArgumentList ${args} ` +
      `-PassThru -WindowStyle Hidden; ` +
      `if ($p.WaitForExit(${INSTALL_TIMEOUT_MS})) { $code = $p.ExitCode } else { $p.Kill(); $code = 1603 }`
    );
  }

  throw new Error('La aplicación no define comando de desinstalación');
}

/** Extrae el código de salida que reporta el script remoto. */
function parseExitCode(output) {
  const text = String(output || '');
  const match = text.match(/SGL_EXITCODE=(-?\d+)/);
  if (match) return Number(match[1]);
  return null;
}

/**
 * Detecta que el agente no está conectado. MeshCentral encola la orden
 * para un equipo apagado pero no la ejecuta: el despliegue debe quedar
 * PENDIENTE, no completado (CA-02).
 */
function equipoSinConexion(texto) {
  const t = String(texto || '').toLowerCase();
  return (
    t.includes('agent not connected') ||
    t.includes('unable to route') ||
    t.includes('not connected') ||
    t.includes('device is offline')
  );
}

/** Sube un archivo local al equipo objetivo. */
async function uploadToDevice(nodeid, localFile, targetDir) {
  const args = [
    'Upload',
    '--id',
    nodeid,
    '--file',
    localFile,
    '--target',
    targetDir,
    ...authArgs(),
    '--json',
  ];
  const output = await runMeshctrl(args);
  if (equipoSinConexion(output)) {
    throw new Error('El equipo no está conectado en MeshCentral (agente apagado).');
  }
  return output;
}

/** Ejecuta un comando en el equipo y devuelve la salida del agente. */
async function runCommandOnDevice(nodeid, command, timeoutMs) {
  const args = [
    'RunCommand',
    '--id',
    nodeid,
    '--run',
    command,
    '--powershell',
    '--reply',
    ...authArgs(),
  ];
  return runMeshctrl(args, timeoutMs);
}

/**
 * Sube el instalador al equipo y devuelve la ruta remota.
 * Es la fase 1 del despliegue: el backend la usa para mostrar el avance.
 */
async function subirAlEquipo(nodeid, instalador, instaladorParametros) {
  const raw = String(instalador || '').trim();
  if (!raw) throw new Error('Falta la ruta del instalador');

  const localFile = path.isAbsolute(raw) ? raw : path.join(INSTALLERS_DIR, raw);
  if (!fs.existsSync(localFile)) throw new Error('No se encontró el instalador en el servidor');

  const fileName = path.basename(localFile);
  // La PC lo descarga directo del servidor por HTTP: no depende del upload
  // de MeshCentral (que en este agente cierra la conexión).
  const url = `${INSTALADORES_URL.replace(/\/$/, '')}/${encodeURIComponent(fileName)}`;

  const detectado = detectarInstalador(localFile);
  const propios = String(instaladorParametros || '').trim();

  return {
    ok: true,
    ruta_remota: `${REMOTE_TEMP_DIR}\\${fileName}`,
    url_descarga: url,
    nombre_archivo: fileName,
    extension: path.extname(localFile).toLowerCase(),
    tipo_instalador: detectado.tipo,
    parametros: propios || detectado.parametros,
    tamano: fs.statSync(localFile).size,
  };
}

/**
 * Ejecuta un comando en el equipo y devuelve la salida del agente.
 * Es la fase 2 del despliegue.
 */
async function ejecutarEnEquipo(nodeid, comando) {
  const salida = await runCommandOnDevice(nodeid, comando);

  if (equipoSinConexion(salida)) {
    return {
      ok: false,
      codigo: null,
      error: 'EQUIPO_APAGADO',
      salida: String(salida || '').trim(),
    };
  }

  const codigo = parseExitCode(salida);
  if (codigo === null) {
    return {
      ok: false,
      codigo: null,
      error: 'SIN_EJECUCION',
      salida: String(salida || '').trim(),
    };
  }

  return {
    ok: codigo === 0,
    codigo,
    salida: String(salida || '').trim(),
  };
}

/**
 * Ejecuta el despliegue completo de un instalador en un equipo.
 * - INSTALAR: sube el archivo y lanza el instalador en modo silencioso.
 * - DESINSTALAR: lanza el comando de desinstalacion definido para la app.
 */
async function deployToDevice(payload) {
  const nodeid = String(payload.nodeid || '').trim();
  if (!nodeid) throw new Error('Falta el identificador del equipo (nodeid)');

  const tipo = String(payload.tipo || 'INSTALAR').toUpperCase();
  const parametros = String(payload.parametros || '').trim();
  const instalador = String(payload.instalador || '').trim();

  const subida =
    tipo === 'INSTALAR'
      ? await subirAlEquipo(nodeid, instalador, parametros)
      : null;

  const remotePath = subida
    ? subida.ruta_remota
    : String(payload.ruta_remota || instalador || '').trim();
  const extension = subida
    ? subida.extension
    : path.extname(remotePath).toLowerCase();

  const command =
    tipo === 'INSTALAR'
      ? buildInstallCommand({ remotePath, extension, parametros })
      : buildUninstallCommand({
          remotePath,
          extension,
          parametros,
          comandoDesinstalacion: payload.comando_desinstalacion,
        });

  const resultado = await ejecutarEnEquipo(nodeid, command);
  return Object.assign({}, resultado, { comando: command, instalador: subida });
}


/**
 * Lanza la instalacion DESACOPLADA del agente.
 *
 * El agente de MeshCentral tiene un solo slot de comandos: si un
 * instalador se cuelga, rechaza todo lo demas. Por eso el comando que se
 * envia termina en ~1 segundo: inicia un PowerShell aparte que ejecuta el
 * instalador, espera el resultado y lo deja en un archivo. Luego el
 * backend consulta ese archivo con comandos cortos.
 */
function lanzarDesacoplado(nodeid, comandoInstalacion, resultadoPath, descarga) {
  const sufijo = path.basename(resultadoPath).replace('sgl-res-', '').replace('.txt', '');
  const interno = [
    "$ErrorActionPreference='SilentlyContinue'",
    `Remove-Item '${resultadoPath}' -Force`,
    "$motivo = ''",
    descarga
      ? [
          "$ProgressPreference='SilentlyContinue'",
          `$destino = '${descarga.destino}'`,
          `$tamano = ${Number(descarga.tamano || 0)}`,
          "$bajar = $true",
          "if ((Test-Path $destino) -and ((Get-Item $destino).Length -eq $tamano)) { $bajar = $false }",
          `if ($bajar) { Invoke-WebRequest -Uri '${descarga.url}' -OutFile $destino -UseBasicParsing }`,
        ].join('; ')
      : null,
    comandoInstalacion,
    "Set-Content -Path '" + resultadoPath + "' -Value ('SGL_EXITCODE=' + $code + \"`nSGL_MOTIVO=$motivo\") -Encoding ASCII",
  ].filter(Boolean).join('; ');

  // -EncodedCommand evita todos los problemas de comillas.
  const b64 = Buffer.from(interno, 'utf16le').toString('base64');
  // Redirigir stdout/stderr a archivos reales evita que el proceso hijo
  // herede los pipes del agente y lo deje ocupado (un solo slot de comandos).
  const outFile = `${REMOTE_TEMP_DIR}\\sgl-out-${sufijo}.log`;
  const errFile = `${REMOTE_TEMP_DIR}\\sgl-err-${sufijo}.log`;
  const lanzador =
    `Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-WindowStyle','Hidden','-EncodedCommand','${b64}' ` +
    `-WindowStyle Hidden -RedirectStandardOutput '${outFile}' -RedirectStandardError '${errFile}'; ` +
    `Write-Output 'SGL_EXITCODE=0'`;

  return runCommandOnDevice(nodeid, lanzador);
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Cuerpo demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
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

  if (!TOKEN || req.headers['x-api-key'] !== TOKEN) {
    sendJson(res, 401, { error: 'API key inválida' });
    return;
  }

  if (url.pathname === '/devices') {
    try {
      const devices = await listDevices();
      sendJson(res, 200, { devices });
    } catch (err) {
      console.error('[mesh-bridge]', err.message);
      sendJson(res, 502, { error: err.message });
    }
    return;
  }

  // HU-COM-08: despliegue remoto de instaladores.
  if (url.pathname === '/desplegar' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = await deployToDevice(body);
      sendJson(res, result.ok ? 200 : 500, result);
    } catch (err) {
      console.error('[mesh-bridge]', err.message);
      sendJson(res, 502, { error: err.message });
    }
    return;
  }

  // HU-COM-08 fase 1: enviar el instalador al equipo.
  if (url.pathname === '/subir' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const nodeid = String(body.nodeid || '').trim();
      if (!nodeid) throw new Error('Falta el identificador del equipo (nodeid)');
      const resultado = await subirAlEquipo(nodeid, body.instalador, body.parametros);
      sendJson(res, 200, resultado);
    } catch (err) {
      console.error('[mesh-bridge]', err.message);
      sendJson(res, 502, { error: err.message });
    }
    return;
  }

  // HU-COM-08 fase 2: ejecutar el instalador en el equipo.
  if (url.pathname === '/ejecutar' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const nodeid = String(body.nodeid || '').trim();
      if (!nodeid) throw new Error('Falta el identificador del equipo (nodeid)');
      const remotePath = String(body.ruta_remota || '').trim();
      const extension = path.extname(remotePath).toLowerCase();
      const parametros = String(body.parametros || '').trim();
      const tipo = String(body.tipo || 'INSTALAR').toUpperCase();

      const command =
        tipo === 'INSTALAR'
          ? buildInstallCommand({ remotePath, extension, parametros })
          : buildUninstallCommand({
              remotePath,
              extension,
              parametros,
              comandoDesinstalacion: body.comando_desinstalacion,
            });

      const resultadoId = String(body.resultado_id || '').replace(/[^a-zA-Z0-9-]/g, '');
      if (!resultadoId) throw new Error('Falta el identificador de resultado');
      const resultadoPath = `${REMOTE_TEMP_DIR}\\sgl-res-${resultadoId}.txt`;
      const urlDescarga = String(body.url_descarga || '').trim();

      const descarga =
        tipo === 'INSTALAR' && urlDescarga && remotePath
          ? { url: urlDescarga, destino: remotePath, tamano: body.tamano_instalador || 0 }
          : null;

      await lanzarDesacoplado(nodeid, command, resultadoPath, descarga);
      sendJson(res, 200, {
        ok: true,
        pendiente: true,
        codigo: null,
        salida: 'Instalación lanzada en el equipo.',
        comando: command,
        resultado_id: resultadoId,
      });
    } catch (err) {
      console.error('[mesh-bridge]', err.message);
      sendJson(res, 502, { error: err.message });
    }
    return;
  }

  // HU-COM-08 fase 3: leer el resultado de la instalación desacoplada.
  if (url.pathname === '/resultado' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const nodeid = String(body.nodeid || '').trim();
      const resultadoId = String(body.resultado_id || '').replace(/[^a-zA-Z0-9-]/g, '');
      if (!nodeid || !resultadoId) throw new Error('Faltan datos para leer el resultado');

      const resultadoPath = `${REMOTE_TEMP_DIR}\\sgl-res-${resultadoId}.txt`;
      const salida = await runCommandOnDevice(nodeid, `cmd /c type "${resultadoPath}"`, POLL_TIMEOUT_MS);

      if (equipoSinConexion(salida)) {
        sendJson(res, 200, { listo: false, salida: String(salida || '').trim(), error: 'EQUIPO_APAGADO' });
        return;
      }

      const codigo = parseExitCode(salida);
      if (codigo === null) {
        sendJson(res, 200, { listo: false, salida: String(salida || '').trim() });
        return;
      }

      sendJson(res, 200, { listo: true, codigo, ok: codigo === 0, salida: String(salida || '').trim() });
    } catch (err) {
      console.error('[mesh-bridge]', err.message);
      sendJson(res, 502, { error: err.message });
    }
    return;
  }

  // HU-COM-08: consola remota. Ejecuta un comando en el equipo y devuelve
  // la salida del agente (equivalente a una terminal de administracion).
  if (url.pathname === '/terminal' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const nodeid = String(body.nodeid || '').trim();
      const comando = String(body.comando || '').trim();
      if (!nodeid) throw new Error('Falta el identificador del equipo (nodeid)');
      if (!comando) throw new Error('Falta el comando');
      if (comando.length > 2000) throw new Error('El comando es demasiado largo');

      const salida = await runCommandOnDevice(nodeid, comando);
      sendJson(res, 200, { ok: !equipoSinConexion(salida), salida: String(salida || '').trim() });
    } catch (err) {
      console.error('[mesh-bridge]', err.message);
      sendJson(res, 502, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Ruta no encontrada' });
});

server.listen(PORT, HOST, () => {
  console.log(`[mesh-bridge] escuchando en http://${HOST}:${PORT}`);
});
