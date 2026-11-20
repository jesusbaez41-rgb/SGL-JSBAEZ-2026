/**
 * Utilidades puras de HU-COM-09 (RN-016).
 *
 * Un dominio se guarda normalizado: minúsculas, sin esquema, sin ruta, sin
 * puerto y sin el prefijo "www.". Se rechazan IPs literales porque el bloqueo
 * por IP directa es justamente una de las evasiones que hay que impedir
 * (CA-03/CA-06).
 */

const DOMINIO_PATTERN =
  /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Normaliza lo que escribe el administrador a un dominio limpio.
 * Acepta "https://es.wikipedia.org/wiki/Portada" y devuelve
 * "es.wikipedia.org".
 */
function normalizarDominio(value) {
  let texto = String(value == null ? '' : value).trim().toLowerCase();
  if (!texto) return '';

  // Quita esquema y credenciales.
  texto = texto.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  texto = texto.replace(/^[^/@]*@/, '');
  // Se queda con el host (antes de la primera barra, ? o #).
  texto = texto.split(/[/?#]/, 1)[0];
  // Quita el puerto.
  texto = texto.replace(/:\d+$/, '');
  // Quita puntos finales del FQDN.
  texto = texto.replace(/\.+$/, '');
  // Comodines: *.ejemplo.com y .ejemplo.com equivalen a ejemplo.com.
  texto = texto.replace(/^\*?\./, '');
  // "www." es redundante: .ejemplo.com ya cubre el subdominio.
  texto = texto.replace(/^www\./, '');

  return texto;
}

/** true si el dominio normalizado es válido y no es una IP literal. */
function esDominioValido(dominio) {
  const texto = normalizarDominio(dominio);
  if (!texto || IPV4_PATTERN.test(texto)) return false;
  if (texto === 'localhost') return false;
  if (texto.includes('..')) return false;
  // La última etiqueta debe ser alfabética (evita TLDs numéricos raros).
  const etiquetas = texto.split('.');
  if (etiquetas.length < 2) return false;
  if (!/^[a-z]{2,63}$/.test(etiquetas[etiquetas.length - 1])) return false;
  return DOMINIO_PATTERN.test(texto);
}

/** Unión ordenada de dominios (RN-016: unión de los grupos del estudiante). */
function unirDominios(dominios) {
  const vistos = new Set();
  for (const dominio of dominios || []) {
    const limpio = normalizarDominio(dominio);
    if (esDominioValido(limpio)) vistos.add(limpio);
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Formato que entiende Squid en `dstdomain`: el punto inicial hace que el
 * dominio y todos sus subdominios queden permitidos.
 */
function dominioSquid(dominio) {
  const limpio = normalizarDominio(dominio);
  return esDominioValido(limpio) ? `.${limpio}` : null;
}

/** Nombre de ACL seguro (Squid solo admite [a-z0-9_]). */
function nombreAcl(prefijo, valor) {
  const limpio = String(valor || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return `${prefijo}_${limpio || 'x'}`;
}

module.exports = {
  DOMINIO_PATTERN,
  normalizarDominio,
  esDominioValido,
  unirDominios,
  dominioSquid,
  nombreAcl,
};
