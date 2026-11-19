import { http } from './http'

export interface AuthEvent {
  id: string
  usuario_id: string | null
  uid_intentado: string
  rol: string | null
  accion: string
  resultado: 'EXITO' | 'FALLO'
  ip_origen: string | null
  detalle: Record<string, unknown> | null
  fecha_evento: string
}

export interface AuditUser {
  id: string
  uid: string
  nombre_completo: string
  rol: string
}

export interface AuditLog {
  id: string
  usuario_id: string
  accion: string
  entidad_afectada: string
  entidad_id: string | null
  detalle: Record<string, unknown> | null
  ip_origen: string | null
  fecha_evento: string
  inmutable: boolean
  laboratorio_id: string | null
  equipo_id: string | null
  usuario?: AuditUser | null
  laboratorio?: { id: string; nombre: string } | null
  equipo?: { id: string; hostname: string } | null
}

export interface AuditLogFilters {
  accion?: string
  entidad?: string
  usuario?: string
  desde?: string
  hasta?: string
  q?: string
  limit?: number
  offset?: number
}

export interface AuditLogPage {
  data: AuditLog[]
  total: number
  limit: number
  offset: number
}

export const auditApi = {
  async logs(filters: AuditLogFilters = {}): Promise<AuditLogPage> {
    const { data } = await http.get('/audit/logs', { params: filters })
    return data
  },

  async events(limit = 100): Promise<AuthEvent[]> {
    const { data } = await http.get('/audit/events', { params: { limit } })
    return data.data
  },
}
