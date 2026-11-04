import { http } from './http'

export type EquipmentStatus = 'ENCENDIDO' | 'APAGADO' | 'DESCONOCIDO'

export interface Equipment {
  id: string
  mac_address: string
  hostname: string
  ip_address: string | null
  laboratorio_id: string
  laboratorio_nombre: string
  estado: EquipmentStatus | string
  mesh_agent_id: string | null
  ultimo_reporte: string | null
  usuario_actual: string | null
  mesh_source?: 'MESHCENTRAL' | 'LOCAL'
  mesh_encontrado?: boolean
}

export interface EquipmentPayload {
  mac_address: string
  hostname: string
  ip_address?: string
  laboratorio_id: string
  mesh_agent_id?: string
}

export const equipmentApi = {
  async list(): Promise<Equipment[]> {
    const { data } = await http.get('/equipment')
    return data.data
  },

  async get(id: string): Promise<Equipment> {
    const { data } = await http.get(`/equipment/${id}`)
    return data.data
  },

  async create(payload: EquipmentPayload): Promise<Equipment> {
    const { data } = await http.post('/equipment', payload)
    return data.data
  },

  async update(id: string, payload: Partial<EquipmentPayload>): Promise<Equipment> {
    const { data } = await http.patch(`/equipment/${id}`, payload)
    return data.data
  },

  async refresh(id: string): Promise<Equipment> {
    const { data } = await http.post(`/equipment/${id}/refresh`)
    return data.data
  },

  async sync(): Promise<{ actualizados: number; total: number }> {
    const { data } = await http.post('/equipment/sync')
    return data.data
  },
}
