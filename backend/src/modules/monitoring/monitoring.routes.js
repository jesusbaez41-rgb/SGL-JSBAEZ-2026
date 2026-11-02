const router = require('express').Router();
const controller = require('./monitoring.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');

router.get('/overview', requirePermission('monitoring:read'), controller.overview);

module.exports = router;
