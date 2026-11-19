const router = require('express').Router();
const controller = require('./audit.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');

// HU-COM-12: Admin Académico y Admin Técnico consultan la auditoría.
// La tabla es inmutable: no existen rutas de modificación ni borrado.
router.get('/logs', requirePermission('audit:read'), controller.logs);
router.get('/events', requirePermission('audit:read'), controller.events);

module.exports = router;
