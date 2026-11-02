import { http } from './http'

export interface MonitoringGroup {
  id: string
  codigo: string
  descripcion: string | null
  estudiantes: string | number
}

export interface MonitoringSession {
  id: string
  hora_inicio: string
  hora_fin: string | null
  activa: boolean
  estudiante_uid: string
  estudiante: string
  grupos: string[]
  hostname: string
  ip_address: string | null
  laboratorio: string
}

export interface MonitoringOverview {
  grupos: MonitoringGroup[]
  sesiones: MonitoringSession[]
}

export const monitoringApi = {
  async overview(): Promise<MonitoringOverview> {
    const { data } = await http.get('/monitoring/overview')
    return data.data
  },
}
