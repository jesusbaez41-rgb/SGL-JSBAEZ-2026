const net = require('net');

function isValidSubred(value) {
  const raw = String(value || '').trim();
  const parts = raw.split('/');
  if (parts.length !== 2) return false;

  const [ip, prefix] = parts;
  if (net.isIP(ip) !== 4) return false;
  if (!/^\d{1,2}$/.test(prefix)) return false;

  const bits = Number(prefix);
  return Number.isInteger(bits) && bits >= 0 && bits <= 32;
}

function validateCreateLab(body) {
  const errors = [];
  const nombre = String(body.nombre || '').trim();
  const ubicacion = String(body.ubicacion || '').trim();
  const subred = String(body.subred || '').trim();

  if (!nombre) errors.push('El nombre del laboratorio es obligatorio.');
  else if (nombre.length > 128) errors.push('El nombre no puede superar los 128 caracteres.');

  if (!ubicacion) errors.push('La ubicación es obligatoria.');
  else if (ubicacion.length > 255) errors.push('La ubicación no puede superar los 255 caracteres.');

  if (!subred) errors.push('La subred es obligatoria.');
  else if (!isValidSubred(subred)) {
    errors.push('La subred debe ser una red IPv4 en formato CIDR, por ejemplo 192.168.100.0/24.');
  }

  return errors;
}

function validateUpdateLab(body) {
  const errors = [];
  const hasField = ['nombre', 'ubicacion', 'subred'].some((key) => body[key] !== undefined);

  if (!hasField) errors.push('Debe enviar al menos un campo para actualizar.');

  if (body.nombre !== undefined) {
    const nombre = String(body.nombre || '').trim();
    if (!nombre) errors.push('El nombre no puede quedar vacío.');
    else if (nombre.length > 128) errors.push('El nombre no puede superar los 128 caracteres.');
  }

  if (body.ubicacion !== undefined) {
    const ubicacion = String(body.ubicacion || '').trim();
    if (!ubicacion) errors.push('La ubicación no puede quedar vacía.');
    else if (ubicacion.length > 255) errors.push('La ubicación no puede superar los 255 caracteres.');
  }

  if (body.subred !== undefined && !isValidSubred(body.subred)) {
    errors.push('La subred debe ser una red IPv4 en formato CIDR, por ejemplo 192.168.100.0/24.');
  }

  return errors;
}

module.exports = { isValidSubred, validateCreateLab, validateUpdateLab };
