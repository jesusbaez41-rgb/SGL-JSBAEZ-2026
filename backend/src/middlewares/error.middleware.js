module.exports = function errorMiddleware(err, req, res, next) {
  const status = err.status || 500;

  if (status >= 500) {
    console.error('[sgl][error]', err);
  }

  const body = {
    error: err.message || 'Error interno del servidor',
  };

  if (err.code) body.code = err.code;
  if (err.details) body.details = err.details;

  res.status(status).json(body);
};
