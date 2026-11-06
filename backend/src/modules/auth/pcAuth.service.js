const { validateTicket } = require('./kerberos.service');

const GENERIC_MESSAGE = 'No se pudo iniciar sesión';

/**
 * Autenticación del flujo PC cliente (HU-COM-01).
 * Valida el ticket Kerberos y devuelve un contrato uniforme; no expone
 * el motivo técnico al cliente.
 */
function authenticatePc({ ticket, now = new Date() }) {
  const result = validateTicket(ticket, now);

  if (!result.valid) {
    return {
      authenticated: false,
      message: GENERIC_MESSAGE,
      reason: result.reason,
    };
  }

  return {
    authenticated: true,
    principal: result.principal,
    realm: result.realm,
  };
}

module.exports = { authenticatePc, GENERIC_MESSAGE };
