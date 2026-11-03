const ROLES = [
  'ADMIN_ACADEMICO',
  'ADMIN_TECNICO',
  'DOCENTE',
  'ESTUDIANTE',
];

const UID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(password) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return ['La contraseña es obligatoria.'];
  }
  if (password.length < 8) {
    errors.push('La contraseña debe tener al menos 8 caracteres.');
  }
  if (password.length > 128) {
    errors.push('La contraseña no puede superar los 128 caracteres.');
  }

  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  if (classes < 3) {
    errors.push(
      'La contraseña debe combinar al menos 3 de: minúscula, mayúscula, número y símbolo.',
    );
  }

  return errors;
}

function validateCreate(body) {
  const errors = [];
  const uid = String(body.uid || '').trim();
  const email = String(body.email || '').trim();
  const nombre = String(body.nombre_completo || '').trim();
  const rol = String(body.rol || '').trim();

  if (!uid) {
    errors.push('El identificador de usuario es obligatorio.');
  } else if (!UID_PATTERN.test(uid)) {
    errors.push(
      'El identificador debe tener entre 3 y 32 caracteres (letras, números, punto, guion o guion bajo) y comenzar con letra o número.',
    );
  }

  if (!email) {
    errors.push('El correo es obligatorio.');
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push('El correo no tiene un formato válido.');
  }

  if (!nombre) {
    errors.push('El nombre completo es obligatorio.');
  } else if (nombre.length > 255) {
    errors.push('El nombre completo no puede superar los 255 caracteres.');
  }

  if (!rol) {
    errors.push('El rol es obligatorio.');
  } else if (!ROLES.includes(rol)) {
    errors.push(`El rol debe ser uno de: ${ROLES.join(', ')}.`);
  }

  errors.push(...validatePassword(body.password));

  return errors;
}

function validateUpdate(body) {
  const errors = [];
  const hasField = [
    'nombre_completo',
    'email',
    'rol',
    'activo',
    'password',
  ].some((key) => body[key] !== undefined);

  if (!hasField) {
    errors.push('Debe enviar al menos un campo para actualizar.');
  }

  if (body.email !== undefined) {
    const email = String(body.email || '').trim();
    if (!email) {
      errors.push('El correo no puede quedar vacío.');
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.push('El correo no tiene un formato válido.');
    }
  }

  if (body.nombre_completo !== undefined) {
    const nombre = String(body.nombre_completo || '').trim();
    if (!nombre) {
      errors.push('El nombre completo no puede quedar vacío.');
    } else if (nombre.length > 255) {
      errors.push('El nombre completo no puede superar los 255 caracteres.');
    }
  }

  if (body.rol !== undefined && !ROLES.includes(String(body.rol))) {
    errors.push(`El rol debe ser uno de: ${ROLES.join(', ')}.`);
  }

  if (body.activo !== undefined && typeof body.activo !== 'boolean') {
    errors.push('El estado activo debe ser booleano.');
  }

  if (body.password !== undefined && body.password !== null && body.password !== '') {
    errors.push(...validatePassword(body.password));
  }

  return errors;
}

function validateStatus(body) {
  if (typeof body.activo !== 'boolean') {
    return ['El campo activo debe ser booleano.'];
  }
  return [];
}

module.exports = {
  ROLES,
  validateCreate,
  validateUpdate,
  validateStatus,
};
