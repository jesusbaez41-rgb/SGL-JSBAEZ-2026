import type { ProxyConfig, WhitelistEntry, WhitelistGroup } from '../api/whitelists.api'

/**
 * Lógica pura de HU-COM-09 (RN-016), testeable sin montar componentes.
 */

const DOMINIO_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Normaliza lo que escribe el administrador a un dominio limpio. */
export function normalizarDominio(value: string | null | undefined): string {
  let texto = String(value ?? '').trim().toLowerCase()
  if (!texto) return ''
  texto = texto.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  texto = texto.replace(/^[^/@]*@/, '')
  texto = texto.split(/[/?#]/, 1)[0]
  texto = texto.replace(/:\d+$/, '')
  texto = texto.replace(/\.+$/, '')
  texto = texto.replace(/^\*?\./, '')
  texto = texto.replace(/^www\./, '')
  return texto
}

export function esDominioValido(value: string | null | undefined): boolean {
  const texto = normalizarDominio(value)
  if (!texto) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(texto)) return false
  if (texto === 'localhost') return false
  return DOMINIO_PATTERN.test(texto)
}

/** Dominios activos de un grupo, ordenados y sin repetidos. */
export function dominiosDeGrupo(entradas: WhitelistEntry[], grupoId: string): string[] {
  const vistos = new Set<string>()
  for (const entrada of entradas) {
    if (entrada.grupo_id !== grupoId || !entrada.activa) continue
    const dominio = normalizarDominio(entrada.url)
    if (esDominioValido(dominio)) vistos.add(dominio)
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, 'es'))
}

/** Unión de dominios de varios grupos (RN-016). */
export function unionDominios(entradas: WhitelistEntry[], grupoIds: string[]): string[] {
  const vistos = new Set<string>()
  for (const grupoId of grupoIds) {
    for (const dominio of dominiosDeGrupo(entradas, grupoId)) vistos.add(dominio)
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, 'es'))
}

export function entradasDeGrupo(entradas: WhitelistEntry[], grupoId: string): WhitelistEntry[] {
  return entradas
    .filter((entrada) => entrada.grupo_id === grupoId)
    .slice()
    .sort((a, b) => a.url.localeCompare(b.url, 'es'))
}

export function resumenLista(grupos: WhitelistGroup[], entradas: WhitelistEntry[]): string {
  const gruposConLista = grupos.filter((grupo) => dominiosDeGrupo(entradas, grupo.id).length > 0)
  // Los dominios se cuentan una sola vez aunque estén en varios grupos.
  const total = unionDominios(
    entradas,
    grupos.map((grupo) => grupo.id),
  ).length
  return `${gruposConLista.length}/${grupos.length} grupo(s) con lista · ${total} dominio(s)`
}

export function etiquetaProxy(proxy: ProxyConfig | null | undefined): string {
  if (!proxy || !proxy.host || !proxy.port) return 'Proxy sin configurar'
  return `Proxy ${proxy.host}:${proxy.port}`
}

/** Texto para el alta: avisa antes de enviar al backend. */
export function mensajeValidacion(url: string): string | null {
  const dominio = normalizarDominio(url)
  if (!dominio) return 'Ingresá un dominio.'
  if (!esDominioValido(dominio)) {
    return 'Dominio inválido: usá ejemplo.com (sin http, ruta, puerto ni IP).'
  }
  return null
}

export function puedeGestionar(permisos: string[]): boolean {
  return permisos.includes('whitelists:manage')
}
