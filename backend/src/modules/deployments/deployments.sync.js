const env = require('../../config/env');
const service = require('./deployments.service');
const logger = require('../../utils/logger');

let timer = null;
let running = false;

/**
 * HU-COM-08 / CA-02: barrido periódico que reintenta los equipos que
 * quedaron PENDIENTE porque estaban apagados.
 *
 * Cuando el equipo vuelve a estar en línea en MeshCentral, la orden se
 * envía automáticamente sin intervención del administrador.
 */
async function runOnce() {
  if (running) return null;
  running = true;

  try {
    const resumen = await service.sweep();
    if (resumen && resumen.reintentados > 0) {
      logger.info('Barrido de despliegues completado', resumen);
    }
    return resumen;
  } catch (err) {
    logger.error('Barrido de despliegues fallido', { error: err.message });
    return null;
  } finally {
    running = false;
  }
}

function start() {
  const minutos = Number(env.deploymentsRetryMinutes || 0);
  if (minutos <= 0) {
    logger.info('Reintento automático de despliegues desactivado');
    return null;
  }

  timer = setInterval(runOnce, minutos * 60000);
  if (timer.unref) timer.unref();

  logger.info('Reintento automático de despliegues activado', { minutos });
  return timer;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, runOnce };
