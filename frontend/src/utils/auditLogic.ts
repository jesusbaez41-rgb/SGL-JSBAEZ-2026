/**
 * Lógica pura de la vista de auditoría (HU-COM-12).
 * Se separa del componente para poder probarla sin montar Vue.
 */

export const AUDIT_ACTIONS = [
  'CREAR',
  'ACTUALIZAR',
  'ELIMINAR',
  'DESPLEGAR',
  'CAMBIO_PERMISO',
  'EJECUTAR',
] as const

export const AUDIT_ENTITIES = [
  { value: 'usuario', label: 'Usuario' },
  { value: 'grupo', label: 'Grupo' },
  { value: 'laboratorio', label: 'Laboratorio' },
  { value: 'equipo', label: 'Equipo' },
  { value: 'aplicacion', label: 'Aplicación' },
  { value: 'vinculo_app_lab', label: 'Vínculo app-laboratorio' },
  { value: 'despliegue', label: 'Despliegue' },
  { value: 'politica', label: 'Política' },
  { value: 'permiso_app_grupo', label: 'Permiso app-grupo' },
] as const

const ACTION_LABELS: Record<string, string> = {
  CREAR: 'Crear',
  ACTUALIZAR: 'Actualizar',
  ELIMINAR: 'Eliminar',
  DESPLEGAR: 'Desplegar',
  CAMBIO_PERMISO: 'Cambio de permiso',
  EJECUTAR: 'Ejecutar',
}

const ENTITY_LABELS: Record<string, string> = Object.fromEntries(
  AUDIT_ENTITIES.map((item) => [item.value, item.label]),
)

export interface AuditFilterState {
  accion: string
  entidad: string
  usuario: string
  desde: string
  hasta: string
  q: string
}

export const EMPTY_FILTERS: AuditFilterState = Object.freeze({
  accion: '',
  entidad: '',
  usuario: '',
  desde: '',
  hasta: '',
  q: '',
})

/** Construye los parámetros HTTP omitiendo los filtros vacíos. */
export function buildAuditParams(
  filters: AuditFilterState,
  limit = 50,
  offset = 0,
  excluirSincronizacion = false,
): Record<string, string | number> {
  const params: Record<string, string | number> = { limit, offset }
  for (const key of ['accion', 'entidad', 'usuario', 'desde', 'hasta', 'q'] as const) {
    const value = String(filters[key] ?? '').trim()
    if (value) params[key] = value
  }
  if (excluirSincronizacion) params.excluir_sincronizacion = 1
  return params
}

export function hasFilters(filters: AuditFilterState): boolean {
  return Object.values(filters).some((value) => String(value ?? '').trim() !== '')
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action || '—'
}

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] || entity || '—'
}

export function actionClass(action: string): string {
  switch (action) {
    case 'CREAR':
      return 'bg-emerald-50 text-emerald-700'
    case 'ACTUALIZAR':
      return 'bg-sky-50 text-sky-700'
    case 'ELIMINAR':
      return 'bg-red-50 text-red-700'
    case 'DESPLEGAR':
      return 'bg-indigo-50 text-indigo-700'
    case 'CAMBIO_PERMISO':
      return 'bg-amber-50 text-amber-700'
    case 'EJECUTAR':
      return 'bg-violet-50 text-violet-700'
    case 'LOGIN':
      return 'bg-emerald-50 text-emerald-700'
    case 'LOGOUT':
      return 'bg-slate-100 text-slate-600'
    case 'ACCESO_DENEGADO':
    case 'LOGIN_FALLIDO':
    case 'LOGIN_BLOQUEADO':
      return 'bg-red-50 text-red-700'
    case 'SESION_EXPIRADA':
    case 'SESION_REVOCADA':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

export function formatAuditDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-PY')
}

export function detailPreview(detalle: Record<string, unknown> | null, max = 120): string {
  if (!detalle) return '—'
  const text = JSON.stringify(detalle)
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function totalPages(total: number, limit: number): number {
  if (!total || !limit) return 0
  return Math.ceil(total / limit)
}

export interface PageInfo {
  from: number
  to: number
  page: number
  pages: number
}

export function pageInfo(offset: number, limit: number, total: number): PageInfo {
  const pages = totalPages(total, limit)
  if (!total) return { from: 0, to: 0, page: 0, pages }
  const from = Math.min(offset + 1, total)
  const to = Math.min(offset + limit, total)
  const page = Math.floor(offset / limit) + 1
  return { from, to, page, pages }
}
