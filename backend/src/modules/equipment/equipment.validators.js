const net = require('net');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const HOSTNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

function isValidMac(value) {
  return MAC_RE.test(String(value || '').trim());
}

function isValidHostname(value) {
  const host = String(value || '').trim();
  return host.length > 0 && host.length <= 64 && HOSTNAME_RE.test(host);
}

function isValidIp(value) {
  const ip = String(value || '').trim();
  return ip.length > 0 && ip.length <= 45 && net.isIP(ip) !== 0;
}

function validateCreateEquipment(body) {
  const errors = [];
  const mac = String(body.mac_address || '').trim();
  const hostname = String(body.hostname || '').trim();
  const ip = body.ip_address !== undefined ? String(body.ip_address || '').trim() : '';
  const labId = String(body.laboratorio_id || '').trim();

  if (!mac) errors.push('La MAC es obligatoria.');
  else if (!isValidMac(mac)) errors.push('La MAC debe tener formato AA:BB:CC:DD:EE:FF.');

  if (!hostname) errors.push('El hostname es obligatorio.');
  else if (!isValidHostname(hostname)) {
    errors.push('El hostname debe tener 1-64 caracteres válidos (letras, números y guiones).');
  }

  if (ip && !isValidIp(ip)) errors.push('La IP debe ser una dirección IPv4 o IPv6 válida.');

  if (!labId) errors.push('Debe asignar un laboratorio.');
  else if (!UUID_RE.test(labId)) errors.push('El identificador de laboratorio no es válido.');

  if (body.mesh_agent_id !== undefined && String(body.mesh_agent_id).length > 128) {
    errors.push('El identificador de MeshCentral no puede superar los 128 caracteres.');
  }

  return errors;
}

function validateUpdateEquipment(body) {
  const errors = [];
  const fields = ['mac_address', 'hostname', 'ip_address', 'laboratorio_id', 'mesh_agent_id'];
  const hasField = fields.some((key) => body[key] !== undefined);

  if (!hasField) errors.push('Debe enviar al menos un campo para actualizar.');

  if (body.mac_address !== undefined && !isValidMac(body.mac_address)) {
    errors.push('La MAC debe tener formato AA:BB:CC:DD:EE:FF.');
  }

  if (body.hostname !== undefined && !isValidHostname(body.hostname)) {
    errors.push('El hostname debe tener 1-64 caracteres válidos (letras, números y guiones).');
  }

  if (body.ip_address !== undefined) {
    const ip = String(body.ip_address || '').trim();
    if (ip && !isValidIp(ip)) errors.push('La IP debe ser una dirección IPv4 o IPv6 válida.');
  }

  if (body.laboratorio_id !== undefined) {
    if (!UUID_RE.test(String(body.laboratorio_id || '').trim())) {
      errors.push('El identificador de laboratorio no es válido.');
    }
  }

  if (body.mesh_agent_id !== undefined && String(body.mesh_agent_id).length > 128) {
    errors.push('El identificador de MeshCentral no puede superar los 128 caracteres.');
  }

  return errors;
}

module.exports = {
  validateCreateEquipment,
  validateUpdateEquipment,
  isValidMac,
  isValidHostname,
  isValidIp,
};
