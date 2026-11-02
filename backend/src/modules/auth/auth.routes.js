const router = require('express').Router();
const controller = require('./auth.controller');
const validate = require('../../middlewares/validate.middleware');
const validateLogin = require('./auth.validators');
const authMiddleware = require('../../middlewares/auth.middleware');

// Público: único endpoint sin JWT.
router.post('/login', validate(validateLogin), controller.login);

// Si un cliente llega con GET (p. ej. tras un redirect mal configurado),
// devolver 405 en lugar de confundirlo con una petición sin token.
router.all('/login', (req, res) => {
  res.status(405).json({ error: 'Método no permitido', code: 'METODO_NO_PERMITIDO' });
});

// Protegidos: CA-10 logout revocable, CA-11 heartbeat de actividad.
router.use(authMiddleware);
router.get('/me', controller.me);
router.post('/logout', controller.logout);
router.post('/heartbeat', controller.heartbeat);

module.exports = router;
