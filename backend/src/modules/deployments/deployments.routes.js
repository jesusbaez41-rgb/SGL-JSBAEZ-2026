const router = require('express').Router();
const controller = require('./deployments.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const { validateCreate, validateRetry } = require('./deployments.validators');

// CA-07: solo el Admin Técnico dispara y consulta despliegues.
router.get('/', requirePermission('deployments:read'), controller.list);
router.get('/:id', requirePermission('deployments:read'), controller.get);
router.post(
  '/',
  requirePermission('deployments:manage'),
  validate(validateCreate),
  controller.create,
);
router.post(
  '/:id/retry',
  requirePermission('deployments:manage'),
  validate(validateRetry),
  controller.retry,
);

module.exports = router;
