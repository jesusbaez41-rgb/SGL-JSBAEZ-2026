function clientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded
      ? String(forwarded).split(',')[0]
      : req.ip || req.socket?.remoteAddress || '';
  return String(raw).trim().replace(/^::ffff:/, '').slice(0, 45) || null;
}

function userAgent(req) {
  if (!req) return null;
  return String(req.headers?.['user-agent'] || '').slice(0, 255) || null;
}

module.exports = { clientIp, userAgent };
