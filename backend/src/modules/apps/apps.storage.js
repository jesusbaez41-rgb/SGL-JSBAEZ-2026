const fs = require('fs');
const path = require('path');
const { installersDir } = require('./apps.paths');

/**
 * Almacenamiento de instaladores subidos por el administrador (HU-COM-07).
 *
 * - Solo se aceptan extensiones de instalador conocidas.
 * - El nombre final es legible: `<app>-<version><ext>`; si ya existe, se
 *   agrega un sufijo numérico para no sobrescribir un instalador en uso.
 * - Solo se borran archivos que estén dentro de APPS_INSTALLERS_DIR.
 */
const ALLOWED_EXTENSIONS = Object.freeze(['.msi', '.exe', '.msix', '.appx', '.zip']);
const MAX_SLUG_LENGTH = 64;

function httpError(status, message, code, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function extensionOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

function isAllowedExtension(filename) {
  return ALLOWED_EXTENSIONS.includes(extensionOf(filename));
}

function slugify(value, maxLength = MAX_SLUG_LENGTH) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug.slice(0, maxLength) || 'instalador';
}

function buildInstallerFileName(nombre, version, extension) {
  const ext = extension && extension.startsWith('.') ? extension.toLowerCase() : '';
  return `${slugify(nombre)}-${slugify(version, 32)}${ext}`;
}

function maxUploadBytes() {
  const mb = Number(process.env.APPS_MAX_UPLOAD_MB || 1024);
  return Math.max(1, Number.isFinite(mb) ? mb : 1024) * 1024 * 1024;
}

function ensureInstallersDir() {
  const dir = installersDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isInsideInstallersDir(filePath) {
  const dir = path.resolve(installersDir());
  const target = path.resolve(String(filePath || ''));
  return target.startsWith(dir + path.sep);
}

async function resolveAvailablePath(dir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  let counter = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}

/**
 * Mueve el archivo temporal al directorio de instaladores con un nombre
 * legible y único. Devuelve la ruta final y el tamaño.
 */
async function storeInstaller(tempPath, originalName, { nombre, version }) {
  const extension = extensionOf(originalName);

  if (!isAllowedExtension(originalName)) {
    throw httpError(
      400,
      'Extensión de instalador no permitida.',
      'INSTALADOR_EXTENSION_INVALIDA',
      { extensiones: ALLOWED_EXTENSIONS },
    );
  }

  const dir = ensureInstallersDir();
  const fileName = buildInstallerFileName(nombre, version, extension);
  const target = await resolveAvailablePath(dir, fileName);

  try {
    await fs.promises.rename(tempPath, target);
  } catch (err) {
    await fs.promises.copyFile(tempPath, target);
    await fs.promises.unlink(tempPath).catch(() => {});
  }

  const stats = await fs.promises.stat(target);
  return {
    ruta: target,
    nombre_archivo: path.basename(target),
    extension,
    tamano: stats.size,
  };
}

/**
 * Elimina un instalador almacenado. Solo opera dentro de APPS_INSTALLERS_DIR.
 */
async function removeInstaller(filePath) {
  if (!filePath || !isInsideInstallersDir(filePath)) return false;
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Elimina el archivo temporal de una subida fallida.
 */
async function removeTempFile(filePath) {
  if (!filePath) return false;
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_SLUG_LENGTH,
  httpError,
  extensionOf,
  isAllowedExtension,
  slugify,
  buildInstallerFileName,
  maxUploadBytes,
  ensureInstallersDir,
  isInsideInstallersDir,
  resolveAvailablePath,
  storeInstaller,
  removeInstaller,
  removeTempFile,
};