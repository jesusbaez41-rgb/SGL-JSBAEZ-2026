import { describe, expect, it } from 'vitest'
import {
  countEquipmentByStatus,
  formatEquipmentReport,
  formatSyncSummary,
  hasMeshError,
  isMissingInMesh,
  meshSourceLabel,
  statusLabel,
  statusTone,
} from '../src/utils/equipmentLogic'

describe('HU04 etiquetas y estado de equipos', () => {
  it('traduce los estados de MeshCentral', () => {
    expect(statusLabel('ENCENDIDO')).toBe('Encendido')
    expect(statusLabel('APAGADO')).toBe('Apagado')
    expect(statusLabel('DESCONOCIDO')).toBe('Desconocido')
    expect(statusLabel('CUALQUIERA')).toBe('Desconocido')
  })

  it('asigna un tono estable por estado', () => {
    expect(statusTone('ENCENDIDO')).toBe('online')
    expect(statusTone('APAGADO')).toBe('offline')
    expect(statusTone('DESCONOCIDO')).toBe('unknown')
  })

  it('detecta cuando MeshCentral no respondió (CA-09)', () => {
    expect(hasMeshError([{ estado: 'APAGADO' }])).toBe(false)
    expect(hasMeshError([{ estado: 'DESCONOCIDO', mesh_error: true }])).toBe(true)
    expect(hasMeshError([])).toBe(false)
  })

  it('identifica el origen del dato', () => {
    expect(meshSourceLabel({ estado: 'ENCENDIDO', mesh_source: 'MESHCENTRAL' })).toBe(
      'MeshCentral',
    )
    expect(meshSourceLabel({ estado: 'APAGADO', mesh_source: 'LOCAL' })).toBe('Local')
    expect(meshSourceLabel({ estado: 'DESCONOCIDO' })).toBe('Local')
  })
})

describe('HU04 resumen de sincronización', () => {
  it('construye el mensaje de importación y actualización', () => {
    const message = formatSyncSummary({
      creados: 2,
      actualizados: 5,
      total: 7,
      sin_laboratorio: 0,
      sin_mac: 0,
      errores: 0,
    })

    expect(message).toBe('MeshCentral: 2 importadas, 5 actualizadas (7 reportadas).')
  })

  it('incluye motivos de omisión y errores', () => {
    const message = formatSyncSummary({
      creados: 0,
      actualizados: 1,
      total: 4,
      sin_laboratorio: 1,
      sin_mac: 2,
      errores: 1,
    })

    expect(message).toContain('1 sin laboratorio')
    expect(message).toContain('2 sin MAC')
    expect(message).toContain('1 con error')
    expect(message).toContain('4 reportadas')
  })

  it('omite los motivos cuando no hay omisiones', () => {
    const message = formatSyncSummary({
      creados: 0,
      actualizados: 0,
      total: 0,
    })

    expect(message).not.toContain('sin laboratorio')
    expect(message).not.toContain('sin MAC')
    expect(message).not.toContain('con error')
  })
})

describe('HU04 fechas y conteos', () => {
  it('formatea un último reporte válido', () => {
    const formatted = formatEquipmentReport('2026-11-05T17:11:49.418Z', 'es-PY')
    expect(formatted).not.toBe('—')
    expect(formatted.length).toBeGreaterThan(5)
  })

  it('devuelve guion para nulos o fechas inválidas', () => {
    expect(formatEquipmentReport(null)).toBe('—')
    expect(formatEquipmentReport(undefined)).toBe('—')
    expect(formatEquipmentReport('no-es-fecha')).toBe('—')
  })

  it('cuenta equipos por estado', () => {
    const counts = countEquipmentByStatus([
      { estado: 'ENCENDIDO' },
      { estado: 'ENCENDIDO' },
      { estado: 'APAGADO' },
      { estado: 'DESCONOCIDO' },
      { estado: 'OTRO' },
    ])

    expect(counts).toEqual({
      total: 5,
      encendidos: 2,
      apagados: 1,
      desconocidos: 2,
    })
  })

  it('marca una PC ausente en MeshCentral solo si no fue un error de conexión', () => {
    expect(isMissingInMesh({ estado: 'DESCONOCIDO', mesh_encontrado: false })).toBe(true)
    expect(
      isMissingInMesh({ estado: 'DESCONOCIDO', mesh_encontrado: false, mesh_error: true }),
    ).toBe(false)
    expect(isMissingInMesh({ estado: 'ENCENDIDO', mesh_encontrado: true })).toBe(false)
  })
})
