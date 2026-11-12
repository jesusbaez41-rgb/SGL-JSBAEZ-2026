const service = require('./deployments.service');

async function list(req, res, next) {
  try {
    const data = await service.list({ limite: req.query.limite });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    res.json({ data: await service.get(req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    res.status(201).json({ data: await service.create(req, req.body) });
  } catch (err) {
    next(err);
  }
}

async function retry(req, res, next) {
  try {
    res.json({ data: await service.retry(req, req.params.id, req.body || {}) });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, retry };
