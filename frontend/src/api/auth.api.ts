import { http } from './http'

export type Rol = 'ADMIN_ACADEMICO' | 'ADMIN_TECNICO' | 'DOCENTE' | 'ESTUDIANTE' | string

export interface SglUser {
  id: string
  uid: string
  nombre: string
  email: string
  rol: Rol
}

export interface SessionInfo {
  id?: string
  jti: string
  expiresAt: string
  idleMinutes: number
}

export interface LoginResponse {
  token: string
  user: SglUser
  permissions: string[]
  session: SessionInfo
}

export interface MeResponse {
  user: SglUser
  permissions: string[]
  session: SessionInfo
}

export interface HeartbeatResponse {
  ok: boolean
  session: SessionInfo
}

export const authApi = {
  async login(uid: string, password: string): Promise<LoginResponse> {
    const { data } = await http.post<LoginResponse>('/auth/login', { uid, password })
    return data
  },

  async me(): Promise<MeResponse> {
    const { data } = await http.get<MeResponse>('/auth/me')
    return data
  },

  async logout(): Promise<void> {
    await http.post('/auth/logout')
  },

  async heartbeat(): Promise<HeartbeatResponse> {
    const { data } = await http.post<HeartbeatResponse>('/auth/heartbeat')
    return data
  },
}
