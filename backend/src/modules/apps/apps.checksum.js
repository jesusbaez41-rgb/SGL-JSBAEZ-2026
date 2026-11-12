const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { installersDir } = require('./apps.paths');

const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i;
const REMOTE_URL_PATTERN = /^(https?|ftp):\/\//i;

/**
 * Normaliza un checksum SHA-256: recorta espacios, elimina el prefijo
 * `sha256:` y pasa a minúsculas (HU-COM-07, CA-01).
 */
function normalizeChecksum(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, '');
}

function isChecksumShape(value) {
  return CHECKSUM_PATTERN.test(normalizeChecksum(value));
}

/**
 * Resuelve la ruta del instalador. Las rutas relativas se resuelven contra
 * APPS_INSTALLERS_DIR; las absolutas se respetan. Las URLs remotas no se
 * pueden verificar localmente y devuelven null.
 */
function resolveInstallerPath(ruta) {
  const raw = String(ruta || '').trim();
  if (!raw) return null;
  if (REMOTE_URL_PATTERN.test(raw)) return null;

  const clean = raw.replace(/^file:\/\//i, '');
  if (path.isAbsolute(clean)) return path.normalize(clean);
  return path.resolve(installersDir(), clean);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function checksumError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/**
 * Verifica que el archivo indicado exista y que su SHA-256 coincida con el
 * checksum declarado. No persiste nada (HU-COM-07, CA-01 / RNF-006).
 */
async function verifyInstallerChecksum({ ruta, checksum }) {
  const expected = normalizeChecksum(checksum);

  if (!CHECKSUM_PATTERN.test(expected)) {
    throw checksumError(
      400,
      'CHECKSUM_FORMATO_INVALIDO',
      'El checksum debe ser un SHA-256 hexadecimal de 64 caracteres.',
      { esperado: expected || null },
    );
  }

  const filePath = resolveInstallerPath(ruta);
  if (!filePath) {
    throw checksumError(
      400,
      'INSTALADOR_NO_ACCESIBLE',
      'La ruta del instalador debe ser local o relativa; no se admiten URLs remotas.',
      { ruta: String(ruta || '') },
    );
  }

  let stats;
  try {
    stats = await fs.promises.stat(filePath);
  } catch (err) {
    throw checksumError(
      400,
      'INSTALADOR_NO_ENCONTRADO',
      'No se encontró el instalador en la ruta indicada.',
      { ruta: filePath },
    );
  }

  if (!stats.isFile()) {
    throw checksumError(
      400,
      'INSTALADOR_NO_ENCONTRADO',
      'La ruta indicada no corresponde a un archivo.',
      { ruta: filePath },
    );
  }

  let actual;
  try {
    actual = await sha256File(filePath);
  } catch (err) {
    throw checksumError(
      500,
      'CHECKSUM_NO_CALCULADO',
      'No se pudo calcular el checksum del instalador.',
      { ruta: filePath },
    );
  }

  if (actual !== expected) {
    throw checksumError(
      400,
      'CHECKSUM_INVALIDO',
      'El checksum declarado no coincide con el archivo del instalador.',
      { esperado: expected, calculado: actual, ruta: filePath },
    );
  }

  return {
    checksum: actual,
    ruta: filePath,
    tamano: stats.size,
  };
}

module.exports = {
  CHECKSUM_PATTERN,
  installersDir,
  normalizeChecksum,
  isChecksumShape,
  resolveInstallerPath,
  sha256File,
  verifyInstallerChecksum,
};
