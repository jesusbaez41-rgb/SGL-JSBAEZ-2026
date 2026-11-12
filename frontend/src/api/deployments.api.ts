import { http } from './http'

export type DeploymentEstado = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO' | 'FALLIDO'
export type DeploymentTipo = 'INSTALAR' | 'DESINSTALAR'

export interface DeploymentResumen {
  PENDIENTE: number
  EN_PROCESO: number
  COMPLETADO: number
  FALLIDO: number
}

export interface DeploymentEquipo {
  id: string
  despliegue_id: string
  equipo_id: string
  hostname: string | null
  mac_address: string | null
  ip_address: string | null
  equipo_estado: string | null
  estado: DeploymentEstado
  fase: string | null
  intentos: number
  mensaje_error: string | null
  salida: string | null
  fecha_reporte: string | null
}

export interface Deployment {
  id: string
  vinculo_id: string
  usuario_id: string
  tipo: DeploymentTipo
  fecha_inicio: string | null
  fecha_fin: string | null
  total_equipos: number
  app: { id: string; nombre: string; version: string } | null
  laboratorio: { id: string; nombre: string } | null
  vinculo: { id: string; version: string | null; activo?: boolean } | null
  resumen: DeploymentResumen
  equipos: DeploymentEquipo[]
}

export interface DeploymentPayload {
  app_id: string
  laboratorio_id: string
  tipo: DeploymentTipo
}

export const deploymentsApi = {
  async list(params: { limite?: number } = {}): Promise<Deployment[]> {
    const { data } = await http.get('/deployments', { params })
    return data.data
  },

  async get(id: string): Promise<Deployment> {
    const { data } = await http.get(`/deployments/${id}`)
    return data.data
  },

  async create(payload: DeploymentPayload): Promise<Deployment> {
    const { data } = await http.post('/deployments', payload)
    return data.data
  },

  async retry(id: string, payload: { equipo_id?: string } = {}): Promise<{
    reintentados: number
    pendientes: number
    despliegue: Deployment
  }> {
    const { data } = await http.post(`/deployments/${id}/retry`, payload)
    return data.data
  },
}
