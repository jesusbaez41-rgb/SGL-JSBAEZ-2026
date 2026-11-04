const router = require('express').Router();
const controller = require('./labs.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const { validateCreateLab, validateUpdateLab } = require('./labs.validators');

router.get('/', requirePermission('labs:read'), controller.list);
router.get('/:id', requirePermission('labs:read'), controller.get);
router.post('/', requirePermission('labs:manage'), validate(validateCreateLab), controller.create);
router.patch('/:id', requirePermission('labs:manage'), validate(validateUpdateLab), controller.update);

module.exports = router;
