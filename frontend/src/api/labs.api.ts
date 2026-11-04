import { http } from './http'

export interface Lab {
  id: string
  nombre: string
  ubicacion: string
  subred: string
  equipos?: number
  created_at?: string
}

export interface LabPayload {
  nombre: string
  ubicacion: string
  subred: string
}

export const labsApi = {
  async list(): Promise<Lab[]> {
    const { data } = await http.get('/labs')
    return data.data
  },

  async get(id: string): Promise<Lab> {
    const { data } = await http.get(`/labs/${id}`)
    return data.data
  },

  async create(payload: LabPayload): Promise<Lab> {
    const { data } = await http.post('/labs', payload)
    return data.data
  },

  async update(id: string, payload: Partial<LabPayload>): Promise<Lab> {
    const { data } = await http.patch(`/labs/${id}`, payload)
    return data.data
  },
}
