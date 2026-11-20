const { normalizarDominio, esDominioValido } = require('./whitelists.domain');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Alta de dominio en la lista blanca de un grupo (RN-016). */
function validateCrear(body) {
  const errors = [];
  const grupoId = String(body.grupo_id || '').trim();
  const url = String(body.url || '').trim();

  if (!grupoId) errors.push('El grupo es obligatorio.');
  else if (!UUID_PATTERN.test(grupoId)) errors.push('El grupo no es válido.');

  if (!url) {
    errors.push('La URL es obligatoria.');
  } else if (!esDominioValido(normalizarDominio(url))) {
    errors.push('La URL debe ser un dominio válido (por ejemplo ejemplo.com), sin IP ni puerto.');
  }

  if (body.descripcion !== undefined && String(body.descripcion).length > 255) {
    errors.push('La descripción no puede superar los 255 caracteres.');
  }

  return errors;
}

/** Edición de una entrada existente. */
function validateActualizar(body) {
  const errors = [];
  const campos = ['url', 'descripcion', 'activa'];
  if (!campos.some((campo) => body[campo] !== undefined)) {
    errors.push('Debe enviar al menos un campo para actualizar.');
  }

  if (body.url !== undefined) {
    const url = String(body.url || '').trim();
    if (!url) errors.push('La URL no puede quedar vacía.');
    else if (!esDominioValido(normalizarDominio(url))) {
      errors.push('La URL debe ser un dominio válido (por ejemplo ejemplo.com).');
    }
  }

  if (body.descripcion !== undefined && String(body.descripcion).length > 255) {
    errors.push('La descripción no puede superar los 255 caracteres.');
  }

  if (body.activa !== undefined && typeof body.activa !== 'boolean') {
    errors.push('El campo activa debe ser booleano.');
  }

  return errors;
}

function validateGenerar(body) {
  const errors = [];
  const laboratorioId = String(body.laboratorio_id || '').trim();
  if (!laboratorioId) errors.push('El laboratorio es obligatorio.');
  else if (!UUID_PATTERN.test(laboratorioId)) errors.push('El laboratorio no es válido.');
  return errors;
}

/** Registro de sesión del agente de la PC (CA-04). */
function validateSesion(body) {
  const errors = [];
  if (!String(body.hostname || '').trim()) errors.push('El nombre del equipo es obligatorio.');
  if (!String(body.sid || '').trim()) errors.push('El SID del usuario es obligatorio.');
  return errors;
}

module.exports = {
  validateCrear,
  validateActualizar,
  validateGenerar,
  validateSesion,
};
