module.exports = function validateLogin(body) {
  const errors = [];

  if (!body.uid || typeof body.uid !== 'string' || !body.uid.trim()) {
    errors.push('El usuario es obligatorio');
  } else if (body.uid.trim().length > 64) {
    errors.push('El usuario no puede superar los 64 caracteres');
  }

  if (!body.password || typeof body.password !== 'string' || !body.password) {
    errors.push('La contraseña es obligatoria');
  } else if (body.password.length > 256) {
    errors.push('La contraseña no puede superar los 256 caracteres');
  }

  return errors;
};
