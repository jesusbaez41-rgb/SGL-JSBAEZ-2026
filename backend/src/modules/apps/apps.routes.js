const router = require('express').Router();
const controller = require('./apps.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const { validateCreateApp, validateUpdateApp, validateUploadApp, validateLink } = require('./apps.validators');
const uploadMiddleware = require('./apps.upload');

router.get('/', requirePermission('apps:read'), controller.list);
router.get('/:id', requirePermission('apps:read'), controller.get);
router.post('/', requirePermission('apps:manage'), validate(validateCreateApp), controller.create);
router.post(
  '/upload',
  requirePermission('apps:manage'),
  uploadMiddleware.single('archivo'),
  validate(validateUploadApp),
  controller.upload,
);
router.patch(
  '/:id',
  requirePermission('apps:manage'),
  validate(validateUpdateApp),
  controller.update,
);
router.delete('/:id', requirePermission('apps:manage'), controller.remove);

router.post(
  '/:id/installer',
  requirePermission('apps:manage'),
  uploadMiddleware.single('archivo'),
  controller.replaceInstaller,
);

router.post(
  '/:id/verify-checksum',
  requirePermission('apps:manage'),
  controller.verifyChecksum,
);

router.get('/:id/links', requirePermission('apps:read'), controller.listLinks);
router.post(
  '/:id/links',
  requirePermission('apps:manage'),
  validate(validateLink),
  controller.link,
);
router.delete(
  '/:id/links/:laboratorioId',
  requirePermission('apps:manage'),
  controller.unlink,
);

module.exports = router;
