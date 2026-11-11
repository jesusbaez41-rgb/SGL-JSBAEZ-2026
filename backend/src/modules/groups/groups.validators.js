const CODIGO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/;

function validateCreateGroup(body) {
  const errors = [];
  const codigo = String(body.codigo || '').trim();
  const descripcion = String(body.descripcion || '').trim();

  if (!codigo) {
    errors.push('El código del grupo es obligatorio.');
  } else if (!CODIGO_PATTERN.test(codigo)) {
    errors.push(
      'El código debe tener entre 3 y 32 caracteres (letras, números, punto, guion o guion bajo) y comenzar con letra o número.',
    );
  }

  if (descripcion.length > 255) {
    errors.push('La descripción no puede superar los 255 caracteres.');
  }

  return errors;
}

function validateUpdateGroup(body) {
  const errors = [];
  const hasField = ['codigo', 'descripcion'].some((key) => body[key] !== undefined);

  if (!hasField) {
    errors.push('Debe enviar al menos un campo para actualizar.');
  }

  if (body.codigo !== undefined) {
    const codigo = String(body.codigo || '').trim();
    if (!codigo) {
      errors.push('El código del grupo no puede quedar vacío.');
    } else if (!CODIGO_PATTERN.test(codigo)) {
      errors.push('El código del grupo no tiene un formato válido.');
    }
  }

  if (body.descripcion !== undefined) {
    const descripcion = String(body.descripcion || '').trim();
    if (descripcion.length > 255) {
      errors.push('La descripción no puede superar los 255 caracteres.');
    }
  }

  return errors;
}

function validateMember(body) {
  const errors = [];
  if (!String(body.usuario_id || '').trim()) {
    errors.push('El estudiante es obligatorio.');
  }
  return errors;
}

function validateTeacher(body) {
  const errors = [];
  if (!String(body.usuario_id || '').trim()) {
    errors.push('El docente es obligatorio.');
  }
  return errors;
}

module.exports = {
  CODIGO_PATTERN,
  validateCreateGroup,
  validateUpdateGroup,
  validateMember,
  validateTeacher,
};
