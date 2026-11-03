const usersService = require('./users.service');

async function list(req, res, next) {
  try {
    res.json({ data: await usersService.list(req) });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    res.json({ data: await usersService.get(req, req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = await usersService.create(req, req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = await usersService.update(req, req.params.id, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function status(req, res, next) {
  try {
    const data = await usersService.setStatus(req, req.params.id, req.body.activo);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, status };
