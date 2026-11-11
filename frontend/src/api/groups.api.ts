import { http } from './http'
import type { UserRow } from './users.api'

export interface GroupRow {
  id: string
  codigo: string
  descripcion: string | null
  samba_sid: string | null
  samba_dn: string | null
  created_at: string | null
  estudiantes: number
  docentes: number
}

export interface GroupDetail {
  id: string
  codigo: string
  descripcion: string | null
  samba_sid: string | null
  samba_dn: string | null
  created_at: string | null
  estudiantes: UserRow[]
  docentes: UserRow[]
}

export interface CreateGroupPayload {
  codigo: string
  descripcion?: string
}

export interface UpdateGroupPayload {
  codigo?: string
  descripcion?: string
}

export interface GroupMutationResult {
  created?: boolean
  removed?: boolean
  grupo: GroupDetail
}

export interface GroupDeleteResult {
  id: string
  codigo: string
  deleted: boolean
  estudiantes_liberados: number
  docentes_liberados: number
}

export const groupsApi = {
  async list(): Promise<GroupRow[]> {
    const { data } = await http.get('/groups')
    return data.data
  },

  async get(id: string): Promise<GroupDetail> {
    const { data } = await http.get(`/groups/${id}`)
    return data.data
  },

  async create(payload: CreateGroupPayload): Promise<GroupRow> {
    const { data } = await http.post('/groups', payload)
    return data.data
  },

  async update(id: string, payload: UpdateGroupPayload): Promise<GroupRow> {
    const { data } = await http.patch(`/groups/${id}`, payload)
    return data.data
  },

  async remove(id: string): Promise<GroupDeleteResult> {
    const { data } = await http.delete(`/groups/${id}`)
    return data.data
  },

  async addStudent(id: string, usuarioId: string): Promise<GroupMutationResult> {
    const { data } = await http.post(`/groups/${id}/members`, {
      usuario_id: usuarioId,
    })
    return data.data
  },

  async removeStudent(id: string, usuarioId: string): Promise<GroupMutationResult> {
    const { data } = await http.delete(`/groups/${id}/members/${usuarioId}`)
    return data.data
  },

  async addTeacher(id: string, usuarioId: string): Promise<GroupMutationResult> {
    const { data } = await http.post(`/groups/${id}/teachers`, {
      usuario_id: usuarioId,
    })
    return data.data
  },

  async removeTeacher(id: string, usuarioId: string): Promise<GroupMutationResult> {
    const { data } = await http.delete(`/groups/${id}/teachers/${usuarioId}`)
    return data.data
  },
}
