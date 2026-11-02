const router = require('express').Router();
const controller = require('./dashboard.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');

router.get('/summary', requirePermission('dashboard:read'), controller.summary);

module.exports = router;
