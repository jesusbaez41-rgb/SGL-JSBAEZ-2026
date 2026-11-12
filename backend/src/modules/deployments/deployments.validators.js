const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = Object.freeze(['INSTALAR', 'DESINSTALAR']);

/**
 * Valida los datos de alta de un despliegue (HU-COM-08).
 * El vínculo app-laboratorio se verifica en el servicio (RN-002).
 */
function validateCreate(body) {
  const errors = [];
  const appId = String(body.app_id || '').trim();
  const labId = String(body.laboratorio_id || '').trim();
  const tipo = String(body.tipo || 'INSTALAR').trim().toUpperCase();

  if (!appId) errors.push('La aplicación es obligatoria.');
  else if (!UUID_PATTERN.test(appId)) errors.push('La aplicación no es válida.');

  if (!labId) errors.push('El laboratorio es obligatorio.');
  else if (!UUID_PATTERN.test(labId)) errors.push('El laboratorio no es válido.');

  if (!TIPOS.includes(tipo)) {
    errors.push('El tipo de despliegue debe ser INSTALAR o DESINSTALAR.');
  }

  return errors;
}

/** Valida el reintento manual de equipos (CA-08). */
function validateRetry(body) {
  const errors = [];
  const equipoId = String((body && body.equipo_id) || '').trim();

  if (equipoId && !UUID_PATTERN.test(equipoId)) {
    errors.push('El equipo no es válido.');
  }

  return errors;
}

module.exports = { TIPOS, validateCreate, validateRetry };
