const router = require('express').Router();
const controller = require('./whitelists.controller');
const { requirePermission } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  validateCrear,
  validateActualizar,
  validateGenerar,
} = require('./whitelists.validators');

// HU-COM-09: listas blancas por grupo (RN-016).
router.get('/', requirePermission('whitelists:read'), controller.list);
router.get('/config', requirePermission('whitelists:read'), controller.configuracion);
router.get(
  '/users/:usuarioId/effective',
  requirePermission('whitelists:read'),
  controller.efectivas,
);

router.post('/', requirePermission('whitelists:manage'), validate(validateCrear), controller.crear);
router.patch(
  '/:id',
  requirePermission('whitelists:manage'),
  validate(validateActualizar),
  controller.actualizar,
);
router.delete('/:id', requirePermission('whitelists:manage'), controller.eliminar);

// CA-07/CA-08: generación y despliegue de la configuración de filtrado.
router.get('/generated', requirePermission('whitelists:read'), controller.listarGeneradas);
router.get('/generated/:id', requirePermission('whitelists:read'), controller.get);
router.post(
  '/generate',
  requirePermission('whitelists:manage'),
  validate(validateGenerar),
  controller.generar,
);
router.post('/generated/:id/deploy', requirePermission('whitelists:manage'), controller.desplegar);
router.post('/sync', requirePermission('whitelists:manage'), controller.sincronizar);

module.exports = router;
