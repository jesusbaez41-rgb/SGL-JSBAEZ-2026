import { describe, expect, it } from 'vitest'
import {
  dominiosDeGrupo,
  entradasDeGrupo,
  esDominioValido,
  etiquetaProxy,
  mensajeValidacion,
  normalizarDominio,
  puedeGestionar,
  resumenLista,
  unionDominios,
} from '../src/utils/whitelistsLogic'
import type { WhitelistEntry, WhitelistGroup } from '../src/api/whitelists.api'

const GRUPO_A = 'grupo-a'
const GRUPO_B = 'grupo-b'

function entrada(overrides: Partial<WhitelistEntry> = {}): WhitelistEntry {
  return {
    id: 'id-1',
    grupo_id: GRUPO_A,
    url: 'ejemplo.com',
    descripcion: null,
    activa: true,
    fecha_alta: null,
    updated_at: null,
    ...overrides,
  }
}

function grupo(overrides: Partial<WhitelistGroup> = {}): WhitelistGroup {
  return {
    id: GRUPO_A,
    codigo: 'GRP-1A',
    descripcion: null,
    samba_sid: 'S-1-5-21-1-2-3-1111',
    dominios: 0,
    ...overrides,
  }
}

describe('HU09 normalización de dominios', () => {
  it('convierte URLs completas en dominios', () => {
    expect(normalizarDominio('https://es.wikipedia.org/wiki/Portada')).toBe(
      'es.wikipedia.org',
    )
    expect(normalizarDominio('HTTP://WWW.Ejemplo.COM:8080/ruta?x=1')).toBe('ejemplo.com')
    expect(normalizarDominio('*.moodle.org')).toBe('moodle.org')
    expect(normalizarDominio('.foo.bar')).toBe('foo.bar')
    expect(normalizarDominio('  ejemplo.com.  ')).toBe('ejemplo.com')
    expect(normalizarDominio('')).toBe('')
  })

  it('rechaza IP directa, localhost y valores incompletos (CA-03)', () => {
    expect(esDominioValido('192.168.100.10')).toBe(false)
    expect(esDominioValido('http://10.0.0.5/admin')).toBe(false)
    expect(esDominioValido('localhost')).toBe(false)
    expect(esDominioValido('sin-punto')).toBe(false)
    expect(esDominioValido('ejemplo.com')).toBe(true)
    expect(esDominioValido('sub.ejemplo.co.uk')).toBe(true)
  })
})

describe('HU09 unión de listas por grupo (RN-016)', () => {
  const entradas = [
    entrada({ id: '1', grupo_id: GRUPO_A, url: 'wikipedia.org' }),
    entrada({ id: '2', grupo_id: GRUPO_A, url: 'moodle.org' }),
    entrada({ id: '3', grupo_id: GRUPO_B, url: 'python.org' }),
    entrada({ id: '4', grupo_id: GRUPO_B, url: 'moodle.org' }),
    entrada({ id: '5', grupo_id: GRUPO_B, url: 'inactivo.org', activa: false }),
  ]

  it('devuelve los dominios activos del grupo ordenados', () => {
    expect(dominiosDeGrupo(entradas, GRUPO_A)).toEqual(['moodle.org', 'wikipedia.org'])
  })

  it('une los grupos del estudiante sin repetir', () => {
    expect(unionDominios(entradas, [GRUPO_A, GRUPO_B])).toEqual([
      'moodle.org',
      'python.org',
      'wikipedia.org',
    ])
  })

  it('sin grupos no hay navegación', () => {
    expect(unionDominios(entradas, [])).toEqual([])
  })

  it('ordena las entradas del grupo', () => {
    const lista = [
      entrada({ id: '1', url: 'zeta.com' }),
      entrada({ id: '2', url: 'alfa.com' }),
      entrada({ id: '3', grupo_id: GRUPO_B, url: 'beta.com' }),
    ]
    expect(entradasDeGrupo(lista, GRUPO_A).map((item) => item.url)).toEqual([
      'alfa.com',
      'zeta.com',
    ])
  })

  it('resume grupos con lista y dominios únicos', () => {
    const grupos = [grupo(), grupo({ id: GRUPO_B, codigo: 'GRP-1B' })]
    expect(resumenLista(grupos, entradas)).toBe('2/2 grupo(s) con lista · 3 dominio(s)')
    expect(resumenLista([grupo()], [])).toBe('0/1 grupo(s) con lista · 0 dominio(s)')
  })
})

describe('HU09 mensajes y permisos', () => {
  it('valida antes de enviar al backend', () => {
    expect(mensajeValidacion('')).toBe('Ingresá un dominio.')
    expect(mensajeValidacion('http://192.168.1.1/x')).toContain('Dominio inválido')
    expect(mensajeValidacion('https://ejemplo.com/a')).toBeNull()
  })

  it('describe el proxy configurado', () => {
    expect(etiquetaProxy({ host: '192.168.100.58', port: 3128 })).toBe(
      'Proxy 192.168.100.58:3128',
    )
    expect(etiquetaProxy(null)).toBe('Proxy sin configurar')
  })

  it('solo habilita la gestión con whitelists:manage', () => {
    expect(puedeGestionar(['whitelists:read', 'whitelists:manage'])).toBe(true)
    expect(puedeGestionar(['whitelists:read'])).toBe(false)
  })
})
