const router = require('express').Router();
const controller = require('./equipment.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  validateCreateEquipment,
  validateUpdateEquipment,
} = require('./equipment.validators');

router.get('/', requirePermission('equipment:read'), controller.list);
router.get('/:id', requirePermission('equipment:read'), controller.get);
router.post('/', requirePermission('equipment:manage'), validate(validateCreateEquipment), controller.create);
router.patch('/:id', requirePermission('equipment:manage'), validate(validateUpdateEquipment), controller.update);
router.post('/sync', requirePermission('equipment:manage'), controller.sync);
router.post('/:id/refresh', requirePermission('equipment:manage'), controller.refresh);

module.exports = router;
