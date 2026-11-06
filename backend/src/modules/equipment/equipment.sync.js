const env = require('../../config/env');
const { Usuario } = require('../../models');
const equipmentService = require('./equipment.service');
const logger = require('../../utils/logger');

let timer = null;
let initialTimer = null;
let running = false;

/**
 * HU-COM-04 / CA-08: sincronización periódica del inventario con MeshCentral.
 *
 * Se ejecuta con un usuario activo para poder auditar la acción (RN-010).
 * Si no hay usuario activo, se omite la corrida y se registra el motivo.
 */
async function buildSystemRequest() {
  const admin =
    (await Usuario.findOne({
      where: { activo: true, rol: 'ADMIN_TECNICO' },
      order: [['created_at', 'ASC']],
    })) ||
    (await Usuario.findOne({
      where: { activo: true },
      order: [['created_at', 'ASC']],
    }));

  if (!admin) return null;

  return {
    user: { id: admin.id, uid: admin.uid, rol: admin.rol },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    originalUrl: '/api/equipment/sync',
  };
}

async function runOnce() {
  if (running) return null;
  running = true;

  try {
    const req = await buildSystemRequest();
    if (!req) {
      logger.warn('Sincronización MeshCentral omitida: no hay usuario activo para auditoría');
      return null;
    }

    const summary = await equipmentService.syncFromMesh(req, {});
    logger.info('Sincronización MeshCentral completada', {
      total: summary.total,
      creados: summary.creados,
      actualizados: summary.actualizados,
      sin_laboratorio: summary.sin_laboratorio,
      sin_mac: summary.sin_mac,
      errores: summary.errores,
    });
    return summary;
  } catch (err) {
    logger.error('Sincronización MeshCentral fallida', { error: err.message });
    return null;
  } finally {
    running = false;
  }
}

function start() {
  const minutes = Number(env.meshSyncMinutes || 0);
  if (!env.meshApiUrl || minutes <= 0) {
    logger.info('Sincronización periódica MeshCentral desactivada');
    return null;
  }

  // Primera corrida poco después del arranque, sin bloquear el listen.
  initialTimer = setTimeout(runOnce, 15000);
  if (initialTimer.unref) initialTimer.unref();

  timer = setInterval(runOnce, minutes * 60000);
  if (timer.unref) timer.unref();

  logger.info('Sincronización periódica MeshCentral activada', { minutes });
  return timer;
}

function stop() {
  if (initialTimer) clearTimeout(initialTimer);
  if (timer) clearInterval(timer);
  initialTimer = null;
  timer = null;
}

module.exports = { start, stop, runOnce };
