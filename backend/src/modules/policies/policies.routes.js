const router = require('express').Router();
const controller = require('./policies.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const { validatePermiso, validateGenerate } = require('./policies.validators');

// HU-COM-06: matriz de permisos, generación y despliegue de políticas.
router.get('/permissions', requirePermission('policies:read'), controller.matriz);
router.put(
  '/permissions',
  requirePermission('policies:manage'),
  validate(validatePermiso),
  controller.setPermiso,
);
router.get('/lockdown', requirePermission('policies:read'), controller.bloqueo);
router.put('/lockdown', requirePermission('policies:manage'), controller.setBloqueo);

router.get(
  '/users/:usuarioId/effective',
  requirePermission('policies:read'),
  controller.efectivos,
);

router.get('/', requirePermission('policies:read'), controller.list);
router.get('/:id', requirePermission('policies:read'), controller.get);
router.post(
  '/generate',
  requirePermission('policies:manage'),
  validate(validateGenerate),
  controller.generar,
);
router.post('/:id/deploy', requirePermission('policies:manage'), controller.desplegar);

module.exports = router;
