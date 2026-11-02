const app = require('./app');
const env = require('./config/env');
const { sequelize } = require('./models');

async function start() {
  try {
    await sequelize.authenticate();
    console.log('[sgl] Conexión a PostgreSQL OK');
  } catch (err) {
    console.error('[sgl] No se pudo conectar a PostgreSQL:', err.message);
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[sgl] API escuchando en :${env.port}`);
  });
}

start();
