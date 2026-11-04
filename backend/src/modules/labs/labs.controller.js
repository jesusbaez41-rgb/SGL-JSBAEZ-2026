const service = require('./labs.service');

function list(req, res, next) {
  service
    .list()
    .then((data) => res.json({ data }))
    .catch(next);
}

function get(req, res, next) {
  service
    .get(req.params.id)
    .then((data) => res.json({ data }))
    .catch(next);
}

function create(req, res, next) {
  service
    .create(req, req.body)
    .then((data) => res.status(201).json({ data }))
    .catch(next);
}

function update(req, res, next) {
  service
    .update(req, req.params.id, req.body)
    .then((data) => res.json({ data }))
    .catch(next);
}

module.exports = { list, get, create, update };
