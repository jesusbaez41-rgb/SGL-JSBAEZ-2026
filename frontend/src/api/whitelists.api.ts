import { http } from './http'

export interface WhitelistGroup {
  id: string
  codigo: string
  descripcion: string | null
  samba_sid: string
  dominios: number
}

export interface WhitelistEntry {
  id: string
  grupo_id: string
  url: string
  descripcion: string | null
  activa: boolean
  fecha_alta: string | null
  updated_at: string | null
}

export interface ProxyConfig {
  host: string
  port: number
}

export interface WhitelistOverview {
  grupos: WhitelistGroup[]
  entradas: WhitelistEntry[]
  proxy: ProxyConfig
}

export interface NavigationConfig {
  proxy: ProxyConfig
  agent_key_configurada: boolean
  squid_config: string
  script_pc: string
  pac: string
  sesion_horas: number
}

export interface EffectiveWhitelist {
  usuario: { id: string; uid: string; nombre_completo: string }
  grupos: Array<{ id: string; codigo: string }>
  dominios: string[]
  sin_grupo: boolean
}

export interface NavigationDeployment {
  id: string
  equipo_id: string
  hostname: string | null
  mac_address: string | null
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO' | 'FALLIDO'
  intentos: number
  mensaje_error: string | null
  salida: string | null
  fecha_reporte: string | null
}

export interface NavigationGenerated {
  id: string
  laboratorio_id: string
  laboratorio: { id: string; nombre: string } | null
  version: string
  resumen: {
    proxy?: ProxyConfig
    dominios?: number
    sesiones?: number
    grupos?: Array<{ codigo: string; dominios: number }>
  } | null
  config_squid?: string
  config_pac?: string | null
  fecha_generacion: string | null
  despliegues?: NavigationDeployment[]
  resumen_despliegue?: Record<string, number> | null
}

export const whitelistsApi = {
  async list(): Promise<WhitelistOverview> {
    const { data } = await http.get('/whitelists')
    return data.data
  },

  async config(): Promise<NavigationConfig> {
    const { data } = await http.get('/whitelists/config')
    return data.data
  },

  async crear(payload: {
    grupo_id: string
    url: string
    descripcion?: string
  }): Promise<WhitelistEntry> {
    const { data } = await http.post('/whitelists', payload)
    return data.data
  },

  async actualizar(
    id: string,
    payload: { url?: string; descripcion?: string; activa?: boolean },
  ): Promise<WhitelistEntry> {
    const { data } = await http.patch(`/whitelists/${id}`, payload)
    return data.data
  },

  async eliminar(id: string): Promise<{ id: string; deleted: boolean }> {
    const { data } = await http.delete(`/whitelists/${id}`)
    return data.data
  },

  async efectivas(usuarioId: string): Promise<EffectiveWhitelist> {
    const { data } = await http.get(`/whitelists/users/${usuarioId}/effective`)
    return data.data
  },

  async generar(laboratorioId: string): Promise<NavigationGenerated> {
    const { data } = await http.post('/whitelists/generate', {
      laboratorio_id: laboratorioId,
    })
    return data.data
  },

  async generadas(): Promise<NavigationGenerated[]> {
    const { data } = await http.get('/whitelists/generated')
    return data.data
  },

  async get(id: string): Promise<NavigationGenerated> {
    const { data } = await http.get(`/whitelists/generated/${id}`)
    return data.data
  },

  async desplegar(id: string): Promise<NavigationGenerated> {
    const { data } = await http.post(`/whitelists/generated/${id}/deploy`)
    return data.data
  },

  async sincronizar(): Promise<{ laboratorios: Array<{ laboratorio: string; equipos: number }> }> {
    const { data } = await http.post('/whitelists/sync')
    return data.data
  },
}
