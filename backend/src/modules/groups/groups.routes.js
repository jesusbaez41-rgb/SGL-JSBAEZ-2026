const router = require('express').Router();
const controller = require('./groups.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  validateCreateGroup,
  validateUpdateGroup,
  validateMember,
  validateTeacher,
} = require('./groups.validators');

router.get('/', requirePermission('groups:read'), controller.list);
router.get('/:id', requirePermission('groups:read'), controller.get);

router.post(
  '/',
  requirePermission('groups:manage'),
  validate(validateCreateGroup),
  controller.create,
);
router.patch(
  '/:id',
  requirePermission('groups:manage'),
  validate(validateUpdateGroup),
  controller.update,
);
router.delete('/:id', requirePermission('groups:manage'), controller.remove);

router.post(
  '/:id/members',
  requirePermission('groups:manage'),
  validate(validateMember),
  controller.addStudent,
);
router.delete(
  '/:id/members/:userId',
  requirePermission('groups:manage'),
  controller.removeStudent,
);

router.post(
  '/:id/teachers',
  requirePermission('groups:manage'),
  validate(validateTeacher),
  controller.addTeacher,
);
router.delete(
  '/:id/teachers/:userId',
  requirePermission('groups:manage'),
  controller.removeTeacher,
);

module.exports = router;
