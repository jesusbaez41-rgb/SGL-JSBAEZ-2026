import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))

vi.mock('../src/api/http', () => ({
  http: { get, post, patch },
}))

import { equipmentApi } from '../src/api/equipment.api'

describe('HU04 contrato del cliente de equipos', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
  })

  it('lista todos los equipos sin filtro', async () => {
    get.mockResolvedValue({ data: { data: [] } })

    const result = await equipmentApi.list()

    expect(result).toEqual([])
    expect(get).toHaveBeenCalledWith('/equipment', { params: undefined })
  })

  it('envía el laboratorio como query string (CA-04)', async () => {
    get.mockResolvedValue({ data: { data: [] } })

    await equipmentApi.list('lab-1')

    expect(get).toHaveBeenCalledWith('/equipment', {
      params: { laboratorio_id: 'lab-1' },
    })
  })

  it('sincroniza sin laboratorio explícito', async () => {
    post.mockResolvedValue({
      data: { data: { creados: 0, actualizados: 1, total: 1, errores: 0, detalle: [] } },
    })

    const result = await equipmentApi.sync()

    expect(post).toHaveBeenCalledWith('/equipment/sync', {
      laboratorio_id: undefined,
    })
    expect(result.actualizados).toBe(1)
  })

  it('sincroniza un laboratorio concreto', async () => {
    post.mockResolvedValue({
      data: { data: { creados: 1, actualizados: 0, total: 1, errores: 0, detalle: [] } },
    })

    await equipmentApi.sync('lab-1')

    expect(post).toHaveBeenCalledWith('/equipment/sync', {
      laboratorio_id: 'lab-1',
    })
  })

  it('refresca un equipo por id', async () => {
    post.mockResolvedValue({ data: { data: { id: 'eq-1', estado: 'ENCENDIDO' } } })

    const result = await equipmentApi.refresh('eq-1')

    expect(post).toHaveBeenCalledWith('/equipment/eq-1/refresh')
    expect(result.estado).toBe('ENCENDIDO')
  })

  it('crea un equipo con el payload esperado', async () => {
    post.mockResolvedValue({ data: { data: { id: 'eq-1' } } })
    const payload = {
      mac_address: '08:00:27:DB:58:6E',
      hostname: 'sgl-win',
      ip_address: '192.168.100.100',
      laboratorio_id: 'lab-1',
      mesh_agent_id: 'node/1',
    }

    await equipmentApi.create(payload)

    expect(post).toHaveBeenCalledWith('/equipment', payload)
  })

  it('actualiza un equipo por id', async () => {
    patch.mockResolvedValue({ data: { data: { id: 'eq-1' } } })

    await equipmentApi.update('eq-1', { hostname: 'sgl-win-2' })

    expect(patch).toHaveBeenCalledWith('/equipment/eq-1', {
      hostname: 'sgl-win-2',
    })
    expect(post).not.toHaveBeenCalled()
  })
})
