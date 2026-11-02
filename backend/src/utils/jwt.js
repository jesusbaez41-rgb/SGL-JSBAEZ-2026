const jwt = require('jsonwebtoken');
const env = require('../config/env');

function sign(payload, options = {}) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpires,
    ...options,
  });
}

function verify(token) {
  return jwt.verify(token, env.jwtSecret);
}

function decode(token) {
  return jwt.decode(token);
}

module.exports = { sign, verify, decode };
