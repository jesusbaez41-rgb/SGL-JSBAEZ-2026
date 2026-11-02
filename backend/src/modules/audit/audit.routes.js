const router = require('express').Router();
const controller = require('./audit.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');

// CA-07: solo el Admin Académico consulta la auditoría.
router.get('/events', requirePermission('audit:read'), controller.events);

module.exports = router;
