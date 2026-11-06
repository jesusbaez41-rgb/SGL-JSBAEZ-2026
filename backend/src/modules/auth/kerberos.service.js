/**
 * Validador de tickets Kerberos para el flujo de PC cliente (HU-COM-01).
 * La validación real la hace Windows/AD; este módulo deja el contrato
 * testeable y reutilizable por un agente de PC.
 */
function validateTicket(ticket, now = new Date()) {
  if (!ticket || typeof ticket !== 'object') {
    return { valid: false, reason: 'TICKET_INVALIDO' };
  }
  if (!ticket.principal || !ticket.realm) {
    return { valid: false, reason: 'TICKET_INVALIDO' };
  }

  const expiresAt = new Date(ticket.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) {
    return { valid: false, reason: 'TICKET_INVALIDO' };
  }
  if (expiresAt <= now.getTime()) {
    return { valid: false, reason: 'TICKET_EXPIRADO' };
  }

  return {
    valid: true,
    principal: String(ticket.principal),
    realm: String(ticket.realm),
  };
}

module.exports = { validateTicket };
