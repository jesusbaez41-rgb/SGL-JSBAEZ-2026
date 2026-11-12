import type { AppLink, AppRow } from '../api/apps.api'

export const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i
export const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/
export const REMOTE_URL_PATTERN = /^(https?|ftp):\/\//i
export const MAX_PARAMS = 2000
export const MAX_COMANDO = 2000

export interface AppFormValues {
  nombre: string
  ruta_instalador: string
  parametros_silenciosos?: string
  version: string
  checksum: string
  comando_desinstalacion?: string
}

/** Quita espacios, el prefijo `sha256:` y pasa a minúsculas (HU-COM-07). */
export function normalizeChecksum(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, '')
}

export function isValidChecksum(value: string): boolean {
  return CHECKSUM_PATTERN.test(normalizeChecksum(value))
}

export function isValidVersion(value: string): boolean {
  return VERSION_PATTERN.test(String(value || '').trim())
}

export function isValidInstallerPath(value: string): boolean {
  const ruta = String(value || '').trim()
  if (!ruta || ruta.length > 512) return false
  return !REMOTE_URL_PATTERN.test(ruta)
}

export function validateAppForm(form: AppFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  const nombre = String(form.nombre || '').trim()
  const ruta = String(form.ruta_instalador || '').trim()
  const version = String(form.version || '').trim()
  const checksum = String(form.checksum || '').trim()
  const parametros = String(form.parametros_silenciosos || '')

  if (!nombre) errors.nombre = 'El nombre de la aplicación es obligatorio.'
  else if (nombre.length > 128) errors.nombre = 'El nombre no puede superar los 128 caracteres.'

  if (!ruta) errors.ruta_instalador = 'La ruta del instalador es obligatoria.'
  else if (!isValidInstallerPath(ruta)) {
    errors.ruta_instalador = 'Use una ruta local o relativa de hasta 512 caracteres (sin URLs remotas).'
  }

  if (!version) errors.version = 'La versión es obligatoria.'
  else if (!isValidVersion(version)) {
    errors.version = 'Formato de versión inválido, por ejemplo 128.0.'
  }

  if (!checksum) errors.checksum = 'El checksum SHA-256 es obligatorio.'
  else if (!isValidChecksum(checksum)) {
    errors.checksum = 'El checksum debe ser un SHA-256 hexadecimal de 64 caracteres.'
  }

  if (parametros.length > MAX_PARAMS) {
    errors.parametros_silenciosos = `Los parámetros no pueden superar los ${MAX_PARAMS} caracteres.`
  }

  const comando = String(form.comando_desinstalacion || '')
  if (comando.length > MAX_COMANDO) {
    errors.comando_desinstalacion = `El comando no puede superar los ${MAX_COMANDO} caracteres.`
  }

  return errors
}

export function shortChecksum(value: string, size = 12): string {
  const normalized = normalizeChecksum(value)
  if (!normalized) return '—'
  if (normalized.length <= size) return normalized
  return `${normalized.slice(0, size)}…`
}

export function appSummary(app: AppRow): string {
  const total = Number(app.vinculos_activos || 0)
  return `${app.nombre} ${app.version} · ${total} laboratorio${total === 1 ? '' : 's'}`
}

/** RN-007: otra versión activa de la misma app en el laboratorio. */
export function versionConflict(app: AppRow, links: AppLink[]): AppLink | null {
  const nombre = String(app.nombre || '').toLowerCase()
  return (
    links.find(
      (link) =>
        link.activo &&
        String(link.app_nombre || '').toLowerCase() === nombre &&
        link.app_id !== app.id,
    ) || null
  )
}

export function linkedToLab(
  app: AppRow,
  laboratorioId: string,
  links: AppLink[],
): AppLink | null {
  return (
    links.find(
      (link) =>
        link.activo &&
        link.app_id === app.id &&
        link.laboratorio_id === laboratorioId,
    ) || null
  )
}

export function canLinkToLab(app: AppRow, laboratorioId: string, links: AppLink[]): boolean {
  return !linkedToLab(app, laboratorioId, links) && !versionConflict(app, links)
}

export function countActiveLinks(links: AppLink[]): number {
  return links.filter((link) => link.activo).length
}

export function sortAppsByName(apps: AppRow[]): AppRow[] {
  return [...apps].sort(
    (a, b) =>
      String(a.nombre).localeCompare(String(b.nombre), 'es') ||
      String(b.version).localeCompare(String(a.version), 'es'),
  )
}

export function matchesAppSearch(app: AppRow, term: string): boolean {
  const needle = String(term || '').trim().toLowerCase()
  if (!needle) return true
  return [app.nombre, app.version, app.ruta_instalador]
    .map((value) => String(value || '').toLowerCase())
    .some((value) => value.includes(needle))
}

/* ------------------------------------------------------------------ */
/* Subida de instaladores (HU-COM-07)                                   */
/* ------------------------------------------------------------------ */

export const ALLOWED_INSTALLER_EXTENSIONS = ['.msi', '.exe', '.msix', '.appx', '.zip']
export const MAX_UPLOAD_MB = 1024

export function installerExtension(filename: string): string {
  const name = String(filename || '').trim().toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot)
}

export function isAllowedInstallerFile(filename: string): boolean {
  return ALLOWED_INSTALLER_EXTENSIONS.includes(installerExtension(filename))
}

export function formatFileSize(bytes: number): string {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return '0 KB'
  const mb = value / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}

/** Valida el instalador que se arrastra al formulario. */
export function validateInstallerFile(file: { name: string; size: number } | null): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!file) return errors

  if (!isAllowedInstallerFile(file.name)) {
    errors.archivo = `Extensión no permitida. Se aceptan: ${ALLOWED_INSTALLER_EXTENSIONS.join(', ')}.`
  }
  if (!Number(file.size || 0)) {
    errors.archivo = 'El archivo está vacío.'
  } else if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    errors.archivo = `El archivo supera el máximo de ${MAX_UPLOAD_MB} MB.`
  }
  return errors
}

/** Nombre final que el backend dará al instalador (app-version.ext). */
export function installerTargetName(nombre: string, version: string, filename: string): string {
  const slug = (value: string) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
  const ext = installerExtension(filename)
  return `${slug(nombre) || 'instalador'}-${slug(version) || '1.0'}${ext}`
}

/**
 * Valida los metadatos cuando el instalador se sube desde el navegador.
 * La ruta y el checksum los resuelve el backend, asi que no se exigen.
 */
export function validateUploadForm(form: AppFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  const nombre = String(form.nombre || '').trim()
  const version = String(form.version || '').trim()
  const parametros = String(form.parametros_silenciosos || '')

  if (!nombre) errors.nombre = 'El nombre de la aplicación es obligatorio.'
  else if (nombre.length > 128) errors.nombre = 'El nombre no puede superar los 128 caracteres.'

  if (!version) errors.version = 'La versión es obligatoria.'
  else if (!isValidVersion(version)) errors.version = 'Formato de versión inválido, por ejemplo 128.0.'

  if (parametros.length > MAX_PARAMS) {
    errors.parametros_silenciosos = `Los parámetros no pueden superar los ${MAX_PARAMS} caracteres.`
  }

  return errors
}
