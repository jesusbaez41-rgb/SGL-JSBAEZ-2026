const router = require('express').Router();
const controller = require('./users.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  validateCreate,
  validateUpdate,
  validateStatus,
} = require('./users.validators');

// Consulta (CA-01/CA-02). Docente queda limitado a sus grupos (RN-017).
router.get('/', requirePermission('users:read'), controller.list);
router.get('/:id', requirePermission('users:read'), controller.get);

// Alta, modificación y desactivación (CA-03/CA-04).
router.post('/', requirePermission('users:manage'), validate(validateCreate), controller.create);
router.patch('/:id', requirePermission('users:manage'), validate(validateUpdate), controller.update);
router.patch(
  '/:id/status',
  requirePermission('users:manage'),
  validate(validateStatus),
  controller.status,
);

module.exports = router;
