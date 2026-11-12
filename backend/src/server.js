const app = require('./app');
const env = require('./config/env');
const { sequelize } = require('./models');
const meshSync = require('./modules/equipment/equipment.sync');
const deploymentsSync = require('./modules/deployments/deployments.sync');

async function start() {
  try {
    await sequelize.authenticate();
    console.log('[sgl] Conexión a PostgreSQL OK');
  } catch (err) {
    console.error('[sgl] No se pudo conectar a PostgreSQL:', err.message);
  }

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`[sgl] API escuchando en :${env.port}`);
    // HU-COM-04 / CA-08: mantener el inventario actualizado.
    meshSync.start();
    // HU-COM-08 / CA-02: reintentar los equipos que se encienden.
    deploymentsSync.start();
  });

  function shutdown(signal) {
    console.log(`[sgl] Cerrando por ${signal}…`);
    meshSync.stop();
    deploymentsSync.stop();
    server.close(() => process.exit(0));
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
