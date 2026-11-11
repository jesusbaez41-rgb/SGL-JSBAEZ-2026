const service = require('./groups.service');

async function list(req, res, next) {
  try {
    res.json({ data: await service.list(req) });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    res.json({ data: await service.get(req, req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = await service.create(req, req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = await service.update(req, req.params.id, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const data = await service.remove(req, req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function addStudent(req, res, next) {
  try {
    const data = await service.addStudent(req, req.params.id, req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

async function removeStudent(req, res, next) {
  try {
    const data = await service.removeStudent(req, req.params.id, req.params.userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function addTeacher(req, res, next) {
  try {
    const data = await service.addTeacher(req, req.params.id, req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

async function removeTeacher(req, res, next) {
  try {
    const data = await service.removeTeacher(req, req.params.id, req.params.userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  addStudent,
  removeStudent,
  addTeacher,
  removeTeacher,
};
