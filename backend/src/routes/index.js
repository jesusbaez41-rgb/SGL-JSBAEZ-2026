const express = require('express');
const { sequelize } = require('../models');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// Público: salud del stack.
router.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ok', db: 'up', ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'down', error: err.message });
  }
});

// Auth contiene su propio login público y protege me/logout/heartbeat.
router.use('/auth', require('../modules/auth/auth.routes'));

// CA-13: el resto de endpoints exige JWT válido y sesión activa.
router.use('/users', authMiddleware, require('../modules/users/users.routes'));
router.use('/dashboard', authMiddleware, require('../modules/dashboard/dashboard.routes'));
router.use('/audit', authMiddleware, require('../modules/audit/audit.routes'));
router.use('/monitoring', authMiddleware, require('../modules/monitoring/monitoring.routes'));
router.use('/labs', authMiddleware, require('../modules/labs/labs.routes'));
router.use('/equipment', authMiddleware, require('../modules/equipment/equipment.routes'));

module.exports = router;
