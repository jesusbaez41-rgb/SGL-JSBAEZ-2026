const router = require('express').Router();
const controller = require('./whitelists.controller');
const validate = require('../../middlewares/validate.middleware');
const { validateSesion } = require('./whitelists.validators');

/**
 * API del agente de navegación de la PC (HU-COM-09, CA-04).
 *
 * No usa JWT: se autentica con la clave de agente (x-agent-key) y solo
 * permite registrar la sesión de un equipo ya inventariado en SGL.
 */
router.post('/session', validate(validateSesion), controller.sesion);

module.exports = router;
