const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validación del cambio de permiso app-grupo (HU-COM-06). */
function validatePermiso(body) {
  const errors = [];
  const vinculoId = String(body.vinculo_id || '').trim();
  const grupoId = String(body.grupo_id || '').trim();

  if (!vinculoId) errors.push('El vínculo app-laboratorio es obligatorio.');
  else if (!UUID_PATTERN.test(vinculoId)) errors.push('El vínculo no es válido.');

  if (!grupoId) errors.push('El grupo es obligatorio.');
  else if (!UUID_PATTERN.test(grupoId)) errors.push('El grupo no es válido.');

  if (typeof body.habilitado !== 'boolean') {
    errors.push('El campo habilitado debe ser booleano.');
  }

  return errors;
}

function validateGenerate(body) {
  const errors = [];
  const laboratorioId = String(body.laboratorio_id || '').trim();
  if (!laboratorioId) errors.push('El laboratorio es obligatorio.');
  else if (!UUID_PATTERN.test(laboratorioId)) errors.push('El laboratorio no es válido.');
  return errors;
}

module.exports = { validatePermiso, validateGenerate };
