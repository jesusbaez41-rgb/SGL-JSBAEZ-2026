/**
 * Registro de sesiones de PC (HU-COM-01, CA-06 / RN-020).
 * El repositorio se inyecta para poder probar sin PostgreSQL y para
 * reutilizar el mismo contrato desde un agente/GPO de logon.
 */
async function registerLogon({ usuarioId, equipoId, repo, now = new Date() }) {
  if (!usuarioId || !equipoId) {
    throw new Error('usuario y equipo son obligatorios');
  }
  if (!repo || typeof repo.create !== 'function') {
    throw new Error('repositorio de sesiones no disponible');
  }

  return repo.create({
    usuario_id: usuarioId,
    equipo_id: equipoId,
    hora_inicio: now,
    activa: true,
  });
}

async function registerLogoff({ sessionId, repo, now = new Date() }) {
  if (!sessionId) {
    throw new Error('sesión obligatoria');
  }
  if (!repo || typeof repo.update !== 'function') {
    throw new Error('repositorio de sesiones no disponible');
  }

  return repo.update(
    { hora_fin: now, activa: false },
    { where: { id: sessionId } },
  );
}

module.exports = { registerLogon, registerLogoff };
