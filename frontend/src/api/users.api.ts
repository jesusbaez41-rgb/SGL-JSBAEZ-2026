import { http } from './http'

export type Rol =
  | 'ADMIN_ACADEMICO'
  | 'ADMIN_TECNICO'
  | 'DOCENTE'
  | 'ESTUDIANTE'

export interface UserRow {
  id: string
  uid: string
  email: string
  nombre_completo: string
  rol: Rol | string
  activo: boolean
  ultimo_login?: string | null
  created_at?: string | null
}

export interface CreateUserPayload {
  uid: string
  email: string
  nombre_completo: string
  rol: string
  password: string
}

export interface UpdateUserPayload {
  email?: string
  nombre_completo?: string
  rol?: string
  activo?: boolean
  password?: string
}

export const usersApi = {
  async list(): Promise<UserRow[]> {
    const { data } = await http.get('/users')
    return data.data
  },

  async get(id: string): Promise<UserRow> {
    const { data } = await http.get(`/users/${id}`)
    return data.data
  },

  async create(payload: CreateUserPayload): Promise<UserRow> {
    const { data } = await http.post('/users', payload)
    return data.data
  },

  async update(id: string, payload: UpdateUserPayload): Promise<UserRow> {
    const { data } = await http.patch(`/users/${id}`, payload)
    return data.data
  },

  async setStatus(id: string, activo: boolean): Promise<UserRow> {
    const { data } = await http.patch(`/users/${id}/status`, { activo })
    return data.data
  },
}
