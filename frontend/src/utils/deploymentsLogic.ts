import type { Deployment, DeploymentEquipo, DeploymentEstado, DeploymentResumen } from '../api/deployments.api'

export const DEPLOYMENT_ESTADOS: DeploymentEstado[] = [
  'PENDIENTE',
  'EN_PROCESO',
  'COMPLETADO',
  'FALLIDO',
]

export const DEPLOYMENT_TIPOS = ['INSTALAR', 'DESINSTALAR'] as const

const ETIQUETAS: Record<DeploymentEstado, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  FALLIDO: 'Fallido',
}

const CLASES: Record<DeploymentEstado, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-700',
  EN_PROCESO: 'bg-blue-50 text-blue-700',
  COMPLETADO: 'bg-emerald-50 text-emerald-700',
  FALLIDO: 'bg-red-50 text-red-700',
}

export function estadoLabel(estado: string): string {
  return ETIQUETAS[estado as DeploymentEstado] || estado
}

export function estadoBadgeClass(estado: string): string {
  return CLASES[estado as DeploymentEstado] || 'bg-slate-100 text-slate-700'
}

/** Un estado final no se reintenta automáticamente (CA-02, CA-08). */
export function esFinal(estado: string): boolean {
  return estado === 'COMPLETADO' || estado === 'FALLIDO'
}

export function resumenVacio(): DeploymentResumen {
  return { PENDIENTE: 0, EN_PROCESO: 0, COMPLETADO: 0, FALLIDO: 0 }
}

/** Porcentaje de equipos que ya terminaron (completados o fallidos). */
export function progreso(resumen: DeploymentResumen): number {
  const total =
    (resumen?.PENDIENTE || 0) +
    (resumen?.EN_PROCESO || 0) +
    (resumen?.COMPLETADO || 0) +
    (resumen?.FALLIDO || 0)
  if (!total) return 0
  const terminados = (resumen.COMPLETADO || 0) + (resumen.FALLIDO || 0)
  return Math.round((terminados / total) * 100)
}

export function resumenTexto(resumen: DeploymentResumen): string {
  if (!resumen) return ''
  const partes: string[] = []
  if (resumen.COMPLETADO) partes.push(`${resumen.COMPLETADO} completados`)
  if (resumen.EN_PROCESO) partes.push(`${resumen.EN_PROCESO} en proceso`)
  if (resumen.PENDIENTE) partes.push(`${resumen.PENDIENTE} pendientes`)
  if (resumen.FALLIDO) partes.push(`${resumen.FALLIDO} fallidos`)
  return partes.join(' · ') || 'Sin equipos'
}

/** Un despliegue sigue activo mientras haya equipos sin estado final. */
export function estaActivo(despliegue: Deployment): boolean {
  return (despliegue?.equipos || []).some((equipo) => !esFinal(equipo.estado))
}

/** Hay algo que reintentar si quedó algún equipo pendiente o fallido (CA-08). */
export function puedeReintentar(despliegue: Deployment): boolean {
  return (despliegue?.equipos || []).some(
    (equipo) => equipo.estado === 'PENDIENTE' || equipo.estado === 'FALLIDO',
  )
}

export function equiposPendientes(despliegue: Deployment): DeploymentEquipo[] {
  return (despliegue?.equipos || []).filter((equipo) => equipo.estado === 'PENDIENTE')
}

export function equiposFallidos(despliegue: Deployment): DeploymentEquipo[] {
  return (despliegue?.equipos || []).filter((equipo) => equipo.estado === 'FALLIDO')
}

const FASES: Record<string, string> = {
  PREPARANDO: 'Preparando el envío…',
  ENVIANDO: 'Enviando el instalador al equipo…',
  EJECUTANDO: 'Ejecutando el instalador en el equipo…',
  FINALIZADO: 'Finalizado',
  ESPERANDO: 'Esperando que el equipo se encienda…',
}

/** Texto de la fase actual del despliegue (visible en la interfaz). */
export function faseLabel(fase: string | null): string {
  if (!fase) return ''
  return FASES[fase] || fase
}

export function tipoLabel(tipo: string): string {
  return tipo === 'DESINSTALAR' ? 'Desinstalación' : 'Instalación'
}

export function deploymentSubtitle(despliegue: Deployment): string {
  const app = despliegue?.app
  const lab = despliegue?.laboratorio
  if (!app) return 'Aplicación eliminada'
  return `${app.nombre} ${app.version || ''} · ${lab ? lab.nombre : 'laboratorio desconocido'}`.trim()
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

export interface DeploymentFormValues {
  app_id: string
  laboratorio_id: string
  tipo: string
}

export function validateDeploymentForm(form: DeploymentFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!String(form.laboratorio_id || '').trim()) {
    errors.laboratorio_id = 'Elegí el laboratorio destino.'
  }
  if (!String(form.app_id || '').trim()) {
    errors.app_id = 'Elegí la aplicación a desplegar.'
  }
  if (!DEPLOYMENT_TIPOS.includes(form.tipo as (typeof DEPLOYMENT_TIPOS)[number])) {
    errors.tipo = 'El tipo de despliegue no es válido.'
  }
  return errors
}
