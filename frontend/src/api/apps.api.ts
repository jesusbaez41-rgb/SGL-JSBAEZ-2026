import { http } from './http'

export interface AppRow {
  id: string
  nombre: string
  ruta_instalador: string
  parametros_silenciosos: string | null
  version: string
  checksum: string
  origen: string
  created_at: string | null
  vinculos_activos: number
  laboratorios: string[]
}

export interface AppLink {
  id: string
  app_id: string
  laboratorio_id: string
  version: string | null
  app_nombre: string | null
  activo: boolean
  fecha_vinculacion: string | null
  laboratorio?: {
    id: string
    nombre: string
    ubicacion: string
    subred: string
  } | null
}

export interface AppDetail extends AppRow {
  vinculos: AppLink[]
}

export interface AppPayload {
  nombre: string
  ruta_instalador: string
  parametros_silenciosos?: string
  version: string
  checksum: string
}

export interface VerifyResult {
  id: string
  valido: boolean
  checksum: string
  ruta: string
  tamano: number
}

export interface LinkResult {
  created: boolean
  vinculo: AppLink
  app: AppRow
}

export interface UploadResult {
  app: AppRow
  instalador: {
    ruta: string
    nombre_archivo: string
    extension: string
    tamano: number
    checksum: string
  }
}

export const appsApi = {
  async list(params: { search?: string; laboratorio_id?: string } = {}): Promise<AppRow[]> {
    const { data } = await http.get('/apps', { params })
    return data.data
  },

  async get(id: string): Promise<AppDetail> {
    const { data } = await http.get(`/apps/${id}`)
    return data.data
  },

  /**
   * Sube el instalador al servidor: el backend lo guarda en
   * APPS_INSTALLERS_DIR, calcula su SHA-256 y da de alta la app.
   */
  async upload(form: FormData): Promise<UploadResult> {
    const { data } = await http.post('/apps/upload', form, { timeout: 600000 })
    return { app: data.data, instalador: data.instalador }
  },

  /**
   * Reemplaza el instalador de una app existente y recalcula el SHA-256.
   */
  async replaceInstaller(id: string, form: FormData): Promise<UploadResult> {
    const { data } = await http.post(`/apps/${id}/installer`, form, { timeout: 600000 })
    return { app: data.data, instalador: data.instalador }
  },

  async create(payload: AppPayload): Promise<AppRow> {
    const { data } = await http.post('/apps', payload)
    return data.data
  },

  async update(id: string, payload: Partial<AppPayload>): Promise<AppRow> {
    const { data } = await http.patch(`/apps/${id}`, payload)
    return data.data
  },

  async remove(id: string): Promise<{ id: string; nombre: string; deleted: boolean }> {
    const { data } = await http.delete(`/apps/${id}`)
    return data.data
  },

  async verifyChecksum(id: string): Promise<VerifyResult> {
    const { data } = await http.post(`/apps/${id}/verify-checksum`)
    return data.data
  },

  async listLinks(id: string): Promise<AppLink[]> {
    const { data } = await http.get(`/apps/${id}/links`)
    return data.data
  },

  async link(id: string, laboratorioId: string): Promise<LinkResult> {
    const { data } = await http.post(`/apps/${id}/links`, {
      laboratorio_id: laboratorioId,
    })
    return data.data
  },

  async unlink(id: string, laboratorioId: string): Promise<{ removed: boolean; vinculo: AppLink }> {
    const { data } = await http.delete(`/apps/${id}/links/${laboratorioId}`)
    return data.data
  },
}
