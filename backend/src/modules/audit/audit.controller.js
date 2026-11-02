const { listAuthEvents } = require('./audit.service');

async function events(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const data = await listAuthEvents({ limit, offset });
    res.json({ data, limit, offset });
  } catch (err) {
    next(err);
  }
}

module.exports = { events };
