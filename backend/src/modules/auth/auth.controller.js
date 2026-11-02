const authService = require('./auth.service');

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const result = await authService.logout(req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

function me(req, res) {
  res.json(authService.me(req));
}

function heartbeat(req, res) {
  res.json(authService.heartbeat(req));
}

module.exports = { login, logout, me, heartbeat };
