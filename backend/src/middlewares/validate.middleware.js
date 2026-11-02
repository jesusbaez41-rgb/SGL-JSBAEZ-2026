module.exports = function validateMiddleware(validator) {
  return function (req, res, next) {
    const errors = validator(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors });
    }
    return next();
  };
};
