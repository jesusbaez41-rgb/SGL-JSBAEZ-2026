/**
 * Validación de entrada del catálogo de aplicaciones (HU-COM-07).
 *
 * Nota de diseño: las reglas de forma del checksum y de rutas remotas NO se
 * validan aquí, sino en `apps.checksum.js`, que es la única fuente de verdad
 * y devuelve los códigos de error específicos del contrato (
 * CHECKSUM_FORMATO_INVALIDO, INSTALADOR_NO_ACCESIBLE).
 */
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/;
const MAX_PARAMS = 2000;

function validateCreateApp(body) {
  const errors = [];
  const nombre = String(body.nombre || '').trim();
  const ruta = String(body.ruta_instalador || '').trim();
  const version = String(body.version || '').trim();
  const checksum = String(body.checksum || '').trim();
  const parametros = String(body.parametros_silenciosos || '');

  if (!nombre) errors.push('El nombre de la aplicación es obligatorio.');
  else if (nombre.length > 128) errors.push('El nombre no puede superar los 128 caracteres.');

  if (!ruta) errors.push('La ruta del instalador es obligatoria.');
  else if (ruta.length > 512) errors.push('La ruta no puede superar los 512 caracteres.');

  if (!version) errors.push('La versión es obligatoria.');
  else if (!VERSION_PATTERN.test(version)) {
    errors.push('La versión debe comenzar con letra o número y usar solo letras, números, punto, guion, guion bajo o más.');
  }

  if (!checksum) errors.push('El checksum SHA-256 es obligatorio.');

  if (parametros.length > MAX_PARAMS) {
    errors.push(`Los parámetros silenciosos no pueden superar los ${MAX_PARAMS} caracteres.`);
  }

  return errors;
}

function validateUpdateApp(body) {
  const errors = [];
  const fields = ['nombre', 'ruta_instalador', 'version', 'checksum', 'parametros_silenciosos'];
  const hasField = fields.some((key) => body[key] !== undefined);

  if (!hasField) errors.push('Debe enviar al menos un campo para actualizar.');

  if (body.nombre !== undefined) {
    const nombre = String(body.nombre || '').trim();
    if (!nombre) errors.push('El nombre no puede quedar vacío.');
    else if (nombre.length > 128) errors.push('El nombre no puede superar los 128 caracteres.');
  }

  if (body.ruta_instalador !== undefined) {
    const ruta = String(body.ruta_instalador || '').trim();
    if (!ruta) errors.push('La ruta del instalador no puede quedar vacía.');
    else if (ruta.length > 512) errors.push('La ruta no puede superar los 512 caracteres.');
  }

  if (body.version !== undefined) {
    const version = String(body.version || '').trim();
    if (!version) errors.push('La versión no puede quedar vacía.');
    else if (!VERSION_PATTERN.test(version)) errors.push('La versión no tiene un formato válido.');
  }

  if (body.checksum !== undefined && !String(body.checksum || '').trim()) {
    errors.push('El checksum SHA-256 no puede quedar vacío.');
  }

  if (
    body.parametros_silenciosos !== undefined &&
    String(body.parametros_silenciosos || '').length > MAX_PARAMS
  ) {
    errors.push(`Los parámetros silenciosos no pueden superar los ${MAX_PARAMS} caracteres.`);
  }

  return errors;
}

/**
 * Valida los metadatos de una subida. El checksum no se recibe: lo calcula
 * el backend sobre el archivo almacenado (CA-01).
 */
function validateUploadApp(body) {
  const errors = [];
  const nombre = String(body.nombre || '').trim();
  const version = String(body.version || '').trim();
  const parametros = String(body.parametros_silenciosos || '');

  if (!nombre) errors.push('El nombre de la aplicación es obligatoria.');
  else if (nombre.length > 128) errors.push('El nombre no puede superar los 128 caracteres.');

  if (!version) errors.push('La versión es obligatoria.');
  else if (!VERSION_PATTERN.test(version)) {
    errors.push('La versión debe comenzar con letra o número y usar solo letras, números, punto, guion, guion bajo o más.');
  }

  if (parametros.length > MAX_PARAMS) {
    errors.push(`Los parámetros silenciosos no pueden superar los ${MAX_PARAMS} caracteres.`);
  }

  return errors;
}

function validateLink(body) {
  const errors = [];
  if (!String(body.laboratorio_id || '').trim()) {
    errors.push('El laboratorio es obligatorio.');
  }
  return errors;
}

module.exports = {
  VERSION_PATTERN,
  MAX_PARAMS,
  validateCreateApp,
  validateUpdateApp,
  validateUploadApp,
  validateLink,
};
