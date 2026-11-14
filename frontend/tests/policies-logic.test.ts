import { describe, expect, it } from 'vitest'
import {
  appsEnPolitica,
  appsSinRuta,
  estadoBadgeClass,
  estadoLabel,
  formatDateTime,
  gruposHabilitados,
  matrizVacia,
  politicaActiva,
  resumenDespliegue,
  resumenGrupos,
  resumenTexto,
  totalReglas,
} from '../src/utils/policiesLogic'
import type { Policy, PolicyApp, PolicyDeployment, PolicyGroup } from '../src/api/policies.api'

const GRUPO_A = 'grupo-a'
const GRUPO_B = 'grupo-b'

function makeApp(overrides: Partial<PolicyApp> = {}): PolicyApp {
  return {
    vinculo_id: 'v-1',
    app_id: 'a-1',
    nombre: '7-Zip',
    version: '24.08',
    ruta_ejecutable: 'C:\\Program Files\\7-Zip\\7zFM.exe',
    permisos: { [GRUPO_A]: true, [GRUPO_B]: false },
    ...overrides,
  }
}

function makeGrupo(overrides: Partial<PolicyGroup> = {}): PolicyGroup {
  return {
    id: GRUPO_A,
    codigo: 'GRP-1A',
    descripcion: null,
    samba_sid: 'S-1-5-21-1-2-3-1111',
    ...overrides,
  }
}

function makeDeployment(overrides: Partial<PolicyDeployment> = {}): PolicyDeployment {
  return {
    id: 'd-1',
    equipo_id: 'e-1',
    hostname: 'pc-01',
    mac_address: '00:11:22:33:44:55',
    estado: 'COMPLETADO',
    intentos: 1,
    mensaje_error: null,
    salida: 'SGL_EXITCODE=0',
    fecha_reporte: '2026-11-14T10:00:00.000Z',
    ...overrides,
  }
}

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'p-1',
    laboratorio_id: 'lab-1',
    laboratorio: { id: 'lab-1', nombre: 'Laboratorio de Redes' },
    version: 'abc123',
    resumen: {
      grupos: [
        { codigo: 'GRP-1A', apps: ['7-Zip'] },
        { codigo: 'GRP-1B', apps: [] },
      ],
    },
    fecha_generacion: '2026-11-14T10:00:00.000Z',
    despliegues: [],
    ...overrides,
  }
}

describe('HU06 permisos por grupo', () => {
  it('cuenta los grupos habilitados por app', () => {
    expect(gruposHabilitados(makeApp())).toBe(1)
    expect(gruposHabilitados(makeApp({ permisos: {} }))).toBe(0)
    expect(gruposHabilitados(makeApp({ permisos: { [GRUPO_A]: true, [GRUPO_B]: true } }))).toBe(2)
  })

  it('detecta apps con permisos pero sin ruta de ejecutable', () => {
    const apps = [
      makeApp(),
      makeApp({ app_id: 'a-2', nombre: 'Sin ruta', ruta_ejecutable: null }),
      makeApp({ app_id: 'a-3', nombre: 'Sin permisos', permisos: {}, ruta_ejecutable: null }),
    ]
    expect(appsSinRuta(apps).map((app) => app.nombre)).toEqual(['Sin ruta'])
  })

  it('solo incluye en la política las apps con permiso y ruta', () => {
    const apps = [
      makeApp(),
      makeApp({ app_id: 'a-2', ruta_ejecutable: null }),
      makeApp({ app_id: 'a-3', permisos: {} }),
    ]
    expect(appsEnPolitica(apps).map((app) => app.app_id)).toEqual(['a-1'])
  })

  it('cuenta el total de reglas (app × grupo habilitado)', () => {
    const apps = [
      makeApp(),
      makeApp({ app_id: 'a-2', permisos: { [GRUPO_A]: true, [GRUPO_B]: true } }),
    ]
    expect(totalReglas(apps)).toBe(3)
  })

  it('detecta la matriz vacía', () => {
    expect(matrizVacia([], [])).toBe(true)
    expect(matrizVacia([makeGrupo()], [])).toBe(true)
    expect(matrizVacia([makeGrupo()], [makeApp()])).toBe(false)
  })
})

describe('HU06 despliegue de políticas', () => {
  it('etiqueta los estados', () => {
    expect(estadoLabel('COMPLETADO')).toBe('Completado')
    expect(estadoLabel('PENDIENTE')).toBe('Pendiente')
    expect(estadoBadgeClass('FALLIDO')).toContain('red')
    expect(estadoBadgeClass('COMPLETADO')).toContain('emerald')
  })

  it('resume los estados del despliegue', () => {
    const resumen = resumenDespliegue([
      makeDeployment(),
      makeDeployment({ id: 'd-2', estado: 'PENDIENTE' }),
      makeDeployment({ id: 'd-3', estado: 'FALLIDO' }),
    ])
    expect(resumen).toEqual({ PENDIENTE: 1, EN_PROCESO: 0, COMPLETADO: 1, FALLIDO: 1 })
    expect(resumenTexto(resumen)).toBe('1 completados · 1 pendientes · 1 fallidos')
    expect(resumenTexto(resumenDespliegue([]))).toBe('Sin equipos')
  })

  it('la política sigue activa mientras haya equipos sin estado final', () => {
    expect(politicaActiva(makePolicy({ despliegues: [makeDeployment({ estado: 'EN_PROCESO' })] }))).toBe(true)
    expect(politicaActiva(makePolicy({ despliegues: [makeDeployment()] }))).toBe(false)
    expect(politicaActiva(makePolicy({ despliegues: [] }))).toBe(false)
  })

  it('resume los grupos de la política', () => {
    expect(resumenGrupos(makePolicy())).toBe('GRP-1A: 1 app(s)')
    expect(resumenGrupos(makePolicy({ resumen: { grupos: [] } }))).toBe('Sin grupos con permisos')
    expect(resumenGrupos(makePolicy({ resumen: null }))).toBe('Sin grupos con permisos')
  })

  it('formatea la fecha y tolera valores inválidos', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('no-es-fecha')).toBe('—')
    expect(formatDateTime('2026-11-14T10:00:00.000Z')).not.toBe('—')
  })
})
