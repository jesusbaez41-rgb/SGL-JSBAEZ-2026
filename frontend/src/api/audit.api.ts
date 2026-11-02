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

export const auditApi = {
  async events(limit = 100): Promise<AuthEvent[]> {
    const { data } = await http.get('/audit/events', { params: { limit } })
    return data.data
  },
}
