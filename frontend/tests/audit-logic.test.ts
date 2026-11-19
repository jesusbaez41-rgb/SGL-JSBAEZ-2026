import { describe, expect, it } from 'vitest'
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  EMPTY_FILTERS,
  actionClass,
  actionLabel,
  buildAuditParams,
  detailPreview,
  entityLabel,
  formatAuditDate,
  hasFilters,
  pageInfo,
  totalPages,
} from '../src/utils/auditLogic'

describe('HU12 auditoría de acciones administrativas', () => {
  it('construye los parámetros omitiendo filtros vacíos', () => {
    expect(buildAuditParams(EMPTY_FILTERS, 50, 0)).toEqual({ limit: 50, offset: 0 })
    expect(buildAuditParams(EMPTY_FILTERS, 50, 0, true)).toEqual({
      limit: 50,
      offset: 0,
      excluir_sincronizacion: 1,
    })

    const params = buildAuditParams(
      {
        ...EMPTY_FILTERS,
        accion: ' CREAR ',
        entidad: 'equipo',
        usuario: 'ana',
        q: '   ',
      },
      20,
      40,
    )
    expect(params).toEqual({
      limit: 20,
      offset: 40,
      accion: 'CREAR',
      entidad: 'equipo',
      usuario: 'ana',
    })
    expect(params).not.toHaveProperty('q')
  })

  it('detecta si hay filtros activos', () => {
    expect(hasFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasFilters({ ...EMPTY_FILTERS, q: '7-Zip' })).toBe(true)
    expect(hasFilters({ ...EMPTY_FILTERS, desde: '2026-11-01' })).toBe(true)
  })

  it('traduce acciones y entidades conocidas', () => {
    expect(actionLabel('CREAR')).toBe('Crear')
    expect(actionLabel('CAMBIO_PERMISO')).toBe('Cambio de permiso')
    expect(actionLabel('OTRA')).toBe('OTRA')
    expect(actionLabel('')).toBe('—')

    expect(entityLabel('vinculo_app_lab')).toBe('Vínculo app-laboratorio')
    expect(entityLabel('permiso_app_grupo')).toBe('Permiso app-grupo')
    expect(entityLabel('desconocida')).toBe('desconocida')
  })

  it('asigna colores por tipo de acción', () => {
    expect(actionClass('CREAR')).toContain('emerald')
    expect(actionClass('ACTUALIZAR')).toContain('sky')
    expect(actionClass('ELIMINAR')).toContain('red')
    expect(actionClass('DESPLEGAR')).toContain('indigo')
    expect(actionClass('CAMBIO_PERMISO')).toContain('amber')
    expect(actionClass('EJECUTAR')).toContain('violet')
    expect(actionClass('LOGIN')).toContain('emerald')
    expect(actionClass('ACCESO_DENEGADO')).toContain('red')
    expect(actionClass('SESION_EXPIRADA')).toContain('amber')
    expect(actionClass('OTRA')).toContain('slate')
  })

  it('resume el detalle sin romper la tabla', () => {
    expect(detailPreview(null)).toBe('—')
    expect(detailPreview({ hostname: 'pc-01' })).toBe('{"hostname":"pc-01"}')
    const largo = detailPreview({ texto: 'x'.repeat(200) }, 30)
    expect(largo.endsWith('…')).toBe(true)
    expect(largo.length).toBe(31)
  })

  it('calcula páginas y rangos', () => {
    expect(totalPages(0, 50)).toBe(0)
    expect(totalPages(120, 50)).toBe(3)
    expect(pageInfo(0, 50, 0)).toEqual({ from: 0, to: 0, page: 0, pages: 0 })
    expect(pageInfo(0, 50, 120)).toEqual({ from: 1, to: 50, page: 1, pages: 3 })
    expect(pageInfo(100, 50, 120)).toEqual({ from: 101, to: 120, page: 3, pages: 3 })
  })

  it('formatea fechas válidas e inválidas', () => {
    expect(formatAuditDate('2026-11-15T12:00:00.000Z')).not.toBe('—')
    expect(formatAuditDate('no-es-fecha')).toBe('—')
  })

  it('expone las acciones y entidades del dominio', () => {
    expect(AUDIT_ACTIONS).toContain('CAMBIO_PERMISO')
    expect(AUDIT_ACTIONS).toContain('DESPLEGAR')
    expect(AUDIT_ENTITIES.map((item) => item.value)).toContain('equipo')
    expect(AUDIT_ENTITIES.map((item) => item.value)).toContain('politica')
  })
})
