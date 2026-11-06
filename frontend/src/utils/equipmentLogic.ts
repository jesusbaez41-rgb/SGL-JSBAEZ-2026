/**
 * Lógica pura de la vista de Equipos (HU-COM-04).
 *
 * Se extrae del componente para poder probar etiquetas, conteos, resumen de
 * sincronización y manejo de errores de MeshCentral sin montar Vue.
 */

export interface EquipmentLike {
  estado: string
  mesh_error?: boolean
  mesh_source?: 'MESHCENTRAL' | 'LOCAL' | string
  usuario_actual?: string | null
  ultimo_reporte?: string | null
  osdesc?: string | null
}

export interface SyncSummaryLike {
  creados: number
  actualizados: number
  total: number
  sin_laboratorio?: number
  sin_mac?: number
  sin_hostname?: number
  errores?: number
}

export interface EquipmentStatusCounts {
  total: number
  encendidos: number
  apagados: number
  desconocidos: number
}

/** Etiqueta legible del estado reportado por MeshCentral. */
export function statusLabel(status: string): string {
  if (status === 'ENCENDIDO') return 'Encendido'
  if (status === 'APAGADO') return 'Apagado'
  return 'Desconocido'
}

/** Clave de estilo estable para el estado. */
export function statusTone(status: string): 'online' | 'offline' | 'unknown' {
  if (status === 'ENCENDIDO') return 'online'
  if (status === 'APAGADO') return 'offline'
  return 'unknown'
}

/** CA-09: ¿algún equipo quedó sin datos de MeshCentral? */
export function hasMeshError(items: EquipmentLike[]): boolean {
  return items.some((item) => Boolean(item.mesh_error))
}

/** Origen del dato mostrado en la fila. */
export function meshSourceLabel(item: EquipmentLike): string {
  return item.mesh_source === 'MESHCENTRAL' ? 'MeshCentral' : 'Local'
}

/** Texto del resumen devuelto por POST /api/equipment/sync. */
export function formatSyncSummary(result: SyncSummaryLike): string {
  const parts = [
    `${result.creados} importadas`,
    `${result.actualizados} actualizadas`,
  ]

  if (result.sin_laboratorio) parts.push(`${result.sin_laboratorio} sin laboratorio`)
  if (result.sin_mac) parts.push(`${result.sin_mac} sin MAC`)
  if (result.sin_hostname) parts.push(`${result.sin_hostname} sin hostname`)
  if (result.errores) parts.push(`${result.errores} con error`)

  return `MeshCentral: ${parts.join(', ')} (${result.total} reportadas).`
}

/** Formatea el último reporte; devuelve un guion si no es una fecha válida. */
export function formatEquipmentReport(
  value: string | null | undefined,
  locale = 'es-PY',
): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale)
}

/** Conteo por estado para el resumen del panel. */
export function countEquipmentByStatus(items: EquipmentLike[]): EquipmentStatusCounts {
  const counts: EquipmentStatusCounts = {
    total: items.length,
    encendidos: 0,
    apagados: 0,
    desconocidos: 0,
  }

  for (const item of items) {
    if (item.estado === 'ENCENDIDO') counts.encendidos += 1
    else if (item.estado === 'APAGADO') counts.apagados += 1
    else counts.desconocidos += 1
  }

  return counts
}

/** Indica si una PC no fue encontrada en MeshCentral (CA-09). */
export function isMissingInMesh(item: EquipmentLike & { mesh_encontrado?: boolean }): boolean {
  return item.mesh_encontrado === false && !item.mesh_error
}
