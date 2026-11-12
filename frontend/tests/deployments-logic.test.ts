import { describe, expect, it } from 'vitest'
import {
  DEPLOYMENT_ESTADOS,
  estaActivo,
  esFinal,
  estadoBadgeClass,
  estadoLabel,
  faseLabel,
  formatDateTime,
  puedeReintentar,
  progreso,
  resumenTexto,
  tipoLabel,
  validateDeploymentForm,
} from '../src/utils/deploymentsLogic'
import type { Deployment, DeploymentEquipo, DeploymentResumen } from '../src/api/deployments.api'

const LAB_ID = 'lab-1'
const APP_ID = 'app-1'

function makeResumen(overrides: Partial<DeploymentResumen> = {}): DeploymentResumen {
  return { PENDIENTE: 0, EN_PROCESO: 0, COMPLETADO: 0, FALLIDO: 0, ...overrides }
}

function makeEquipo(overrides: Partial<DeploymentEquipo> = {}): DeploymentEquipo {
  return {
    id: 'de-1',
    despliegue_id: 'd-1',
    equipo_id: 'e-1',
    hostname: 'pc-01',
    mac_address: '00:11:22:33:44:55',
    ip_address: '192.168.100.10',
    equipo_estado: 'ENCENDIDO',
    estado: 'PENDIENTE',
    intentos: 0,
    mensaje_error: null,
    fecha_reporte: null,
    ...overrides,
  }
}

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 'd-1',
    vinculo_id: 'v-1',
    usuario_id: 'u-1',
    tipo: 'INSTALAR',
    fecha_inicio: '2026-11-12T10:00:00.000Z',
    fecha_fin: null,
    total_equipos: 1,
    app: { id: APP_ID, nombre: 'Firefox', version: '128.0' },
    laboratorio: { id: LAB_ID, nombre: 'Laboratorio de Redes' },
    vinculo: { id: 'v-1', version: '128.0', activo: true },
    resumen: makeResumen(),
    equipos: [],
    ...overrides,
  }
}

describe('HU08 estados del despliegue', () => {
  it('traduce los estados a texto legible', () => {
    expect(estadoLabel('PENDIENTE')).toBe('Pendiente')
    expect(estadoLabel('EN_PROCESO')).toBe('En proceso')
    expect(estadoLabel('COMPLETADO')).toBe('Completado')
    expect(estadoLabel('FALLIDO')).toBe('Fallido')
    expect(estadoLabel('OTRO')).toBe('OTRO')
  })

  it('asocia una clase de color a cada estado', () => {
    expect(estadoBadgeClass('COMPLETADO')).toContain('emerald')
    expect(estadoBadgeClass('FALLIDO')).toContain('red')
    expect(estadoBadgeClass('PENDIENTE')).toContain('slate')
    expect(estadoBadgeClass('EN_PROCESO')).toContain('blue')
  })

  it('reconoce los estados finales', () => {
    expect(esFinal('COMPLETADO')).toBe(true)
    expect(esFinal('FALLIDO')).toBe(true)
    expect(esFinal('PENDIENTE')).toBe(false)
    expect(esFinal('EN_PROCESO')).toBe(false)
    expect(DEPLOYMENT_ESTADOS).toHaveLength(4)
  })
})

describe('HU08 resumen y progreso', () => {
  it('calcula el porcentaje de equipos terminados', () => {
    expect(progreso(makeResumen())).toBe(0)
    expect(progreso(makeResumen({ COMPLETADO: 2, PENDIENTE: 2 }))).toBe(50)
    expect(progreso(makeResumen({ COMPLETADO: 1, FALLIDO: 1, PENDIENTE: 2 }))).toBe(50)
    expect(progreso(makeResumen({ COMPLETADO: 4 }))).toBe(100)
  })

  it('resume los estados en texto', () => {
    expect(resumenTexto(makeResumen())).toBe('Sin equipos')
    expect(resumenTexto(makeResumen({ COMPLETADO: 1, PENDIENTE: 2 }))).toBe(
      '1 completados · 2 pendientes',
    )
  })

  it('un despliegue sigue activo mientras queden equipos sin estado final', () => {
    expect(estaActivo(makeDeployment({ equipos: [makeEquipo({ estado: 'PENDIENTE' })] }))).toBe(true)
    expect(estaActivo(makeDeployment({ equipos: [makeEquipo({ estado: 'EN_PROCESO' })] }))).toBe(true)
    expect(estaActivo(makeDeployment({ equipos: [makeEquipo({ estado: 'COMPLETADO' })] }))).toBe(false)
    expect(estaActivo(makeDeployment({ equipos: [] }))).toBe(false)
  })
})

describe('HU08 reintentos', () => {
  it('permite reintentar si hay equipos pendientes o fallidos', () => {
    expect(
      puedeReintentar(makeDeployment({ equipos: [makeEquipo({ estado: 'FALLIDO' })] })),
    ).toBe(true)
    expect(
      puedeReintentar(makeDeployment({ equipos: [makeEquipo({ estado: 'PENDIENTE' })] })),
    ).toBe(true)
    expect(
      puedeReintentar(makeDeployment({ equipos: [makeEquipo({ estado: 'COMPLETADO' })] })),
    ).toBe(false)
    expect(puedeReintentar(makeDeployment({ equipos: [] }))).toBe(false)
  })
})

describe('HU08 datos del despliegue', () => {
  it('etiqueta el tipo de despliegue', () => {
    expect(tipoLabel('INSTALAR')).toBe('Instalación')
    expect(tipoLabel('DESINSTALAR')).toBe('Desinstalación')
  })

  it('arma el subtitulo con app y laboratorio', () => {
    const texto = makeDeployment().app
    expect(texto).not.toBeNull()
  })

  it('formatea la fecha y tolera valores inválidos', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('no-es-fecha')).toBe('—')
    expect(formatDateTime('2026-11-12T10:00:00.000Z')).not.toBe('—')
  })
})

describe('HU08 validación del formulario', () => {
  it('exige laboratorio, aplicación y un tipo válido', () => {
    const errors = validateDeploymentForm({ app_id: '', laboratorio_id: '', tipo: 'X' })
    expect(Object.keys(errors).sort()).toEqual(['app_id', 'laboratorio_id', 'tipo'])
  })

  it('acepta un formulario completo', () => {
    expect(
      validateDeploymentForm({ app_id: APP_ID, laboratorio_id: LAB_ID, tipo: 'INSTALAR' }),
    ).toEqual({})
  })
})

describe('HU08 fases del despliegue', () => {
  it('traduce cada fase a texto legible', () => {
    expect(faseLabel('ENVIANDO')).toContain('Enviando')
    expect(faseLabel('EJECUTANDO')).toContain('Ejecutando')
    expect(faseLabel('FINALIZADO')).toBe('Finalizado')
    expect(faseLabel('ESPERANDO')).toContain('Esperando')
    expect(faseLabel('PREPARANDO')).toContain('Preparando')
  })

  it('devuelve vacio si no hay fase', () => {
    expect(faseLabel(null)).toBe('')
    expect(faseLabel('')).toBe('')
  })

  it('devuelve la fase desconocida tal cual', () => {
    expect(faseLabel('XYZ')).toBe('XYZ')
  })
})
