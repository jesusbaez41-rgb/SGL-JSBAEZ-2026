import type { Policy, PolicyApp, PolicyDeployment, PolicyGroup } from '../api/policies.api'

const CLASES: Record<string, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-700',
  EN_PROCESO: 'bg-blue-50 text-blue-700',
  COMPLETADO: 'bg-emerald-50 text-emerald-700',
  FALLIDO: 'bg-red-50 text-red-700',
}

const ETIQUETAS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  FALLIDO: 'Fallido',
}

export function estadoLabel(estado: string): string {
  return ETIQUETAS[estado] || estado
}

export function estadoBadgeClass(estado: string): string {
  return CLASES[estado] || 'bg-slate-100 text-slate-700'
}

/** Cantidad de grupos con permiso habilitado para una app. */
export function gruposHabilitados(app: PolicyApp): number {
  return Object.values(app.permisos || {}).filter(Boolean).length
}

/** Apps con permisos pero sin ruta de ejecutable: no se pueden bloquear. */
export function appsSinRuta(apps: PolicyApp[]): PolicyApp[] {
  return apps.filter((app) => gruposHabilitados(app) > 0 && !app.ruta_ejecutable)
}

/** Apps que van a entrar en la política generada. */
export function appsEnPolitica(apps: PolicyApp[]): PolicyApp[] {
  return apps.filter((app) => gruposHabilitados(app) > 0 && Boolean(app.ruta_ejecutable))
}

export function totalReglas(apps: PolicyApp[]): number {
  return apps.reduce((total, app) => total + gruposHabilitados(app), 0)
}

export function matrizVacia(grupos: PolicyGroup[], apps: PolicyApp[]): boolean {
  return grupos.length === 0 || apps.length === 0
}

export function resumenDespliegue(despliegues: PolicyDeployment[] = []): Record<string, number> {
  const resumen: Record<string, number> = {
    PENDIENTE: 0,
    EN_PROCESO: 0,
    COMPLETADO: 0,
    FALLIDO: 0,
  }
  for (const item of despliegues) {
    if (resumen[item.estado] !== undefined) resumen[item.estado] += 1
  }
  return resumen
}

export function resumenTexto(resumen: Record<string, number>): string {
  const partes: string[] = []
  if (resumen.COMPLETADO) partes.push(`${resumen.COMPLETADO} completados`)
  if (resumen.EN_PROCESO) partes.push(`${resumen.EN_PROCESO} en proceso`)
  if (resumen.PENDIENTE) partes.push(`${resumen.PENDIENTE} pendientes`)
  if (resumen.FALLIDO) partes.push(`${resumen.FALLIDO} fallidos`)
  return partes.join(' · ') || 'Sin equipos'
}

/** La política está activa mientras haya equipos sin estado final. */
export function politicaActiva(politica: Policy): boolean {
  return (politica.despliegues || []).some(
    (equipo) => equipo.estado === 'PENDIENTE' || equipo.estado === 'EN_PROCESO',
  )
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function resumenGrupos(politica: Policy): string {
  const grupos = politica.resumen?.grupos || []
  if (!grupos.length) return 'Sin grupos con permisos'
  return grupos
    .filter((grupo) => grupo.apps.length > 0)
    .map((grupo) => `${grupo.codigo}: ${grupo.apps.length} app(s)`)
    .join(' · ')
}
