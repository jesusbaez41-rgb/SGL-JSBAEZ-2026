import { http } from './http'

export interface PolicyGroup {
  id: string
  codigo: string
  descripcion: string | null
  samba_sid: string
}

export interface PolicyApp {
  vinculo_id: string
  app_id: string
  nombre: string | null
  version: string | null
  ruta_ejecutable: string | null
  permisos: Record<string, boolean>
}

export interface PolicyMatrix {
  laboratorio: { id: string; nombre: string }
  grupos: PolicyGroup[]
  apps: PolicyApp[]
}

export interface PolicyDeployment {
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

export interface PolicySummary {
  laboratorio?: { id: string; nombre: string }
  grupos?: Array<{ codigo: string; apps: string[] }>
  apps_sin_ruta?: string[]
  apps_incluidas?: string[]
}

export interface Policy {
  id: string
  laboratorio_id: string
  laboratorio: { id: string; nombre: string } | null
  version: string
  resumen: PolicySummary | null
  contenido?: string
  fecha_generacion: string | null
  despliegues?: PolicyDeployment[]
  resumen_despliegue?: Record<string, number> | null
}

export interface EffectivePolicy {
  usuario: { id: string; uid: string; nombre_completo: string }
  grupos: Array<{ id: string; codigo: string }>
  laboratorios: Array<{
    laboratorio: { id: string; nombre: string } | null
    apps: Array<{ id: string; nombre: string; version: string; ruta_ejecutable: string | null }>
  }>
}

export interface LockdownConfig {
  activo: boolean
  navegadores: string[]
  carpetas: string[]
  programacion: string[]
  exencion_admin: boolean
  restricciones: Record<string, boolean>
}

export interface LockdownResponse {
  laboratorio: { id: string; nombre: string }
  config: LockdownConfig
}

export const policiesApi = {
  async bloqueo(laboratorioId: string): Promise<LockdownResponse> {
    const { data } = await http.get('/policies/lockdown', {
      params: { laboratorio_id: laboratorioId },
    })
    return data.data
  },

  async setBloqueo(
    laboratorioId: string,
    config: LockdownConfig,
  ): Promise<LockdownResponse> {
    const { data } = await http.put('/policies/lockdown', {
      laboratorio_id: laboratorioId,
      config,
    })
    return data.data
  },

  async matriz(laboratorioId: string): Promise<PolicyMatrix> {
    const { data } = await http.get('/policies/permissions', {
      params: { laboratorio_id: laboratorioId },
    })
    return data.data
  },

  async setPermiso(payload: {
    vinculo_id: string
    grupo_id: string
    habilitado: boolean
  }): Promise<{ vinculo_id: string; grupo_id: string; habilitado: boolean }> {
    const { data } = await http.put('/policies/permissions', payload)
    return data.data
  },

  async efectivos(usuarioId: string): Promise<EffectivePolicy> {
    const { data } = await http.get(`/policies/users/${usuarioId}/effective`)
    return data.data
  },

  async generar(laboratorioId: string): Promise<Policy> {
    const { data } = await http.post('/policies/generate', {
      laboratorio_id: laboratorioId,
    })
    return data.data
  },

  async list(): Promise<Policy[]> {
    const { data } = await http.get('/policies')
    return data.data
  },

  async get(id: string): Promise<Policy> {
    const { data } = await http.get(`/policies/${id}`)
    return data.data
  },

  async desplegar(id: string): Promise<Policy> {
    const { data } = await http.post(`/policies/${id}/deploy`)
    return data.data
  },
}
