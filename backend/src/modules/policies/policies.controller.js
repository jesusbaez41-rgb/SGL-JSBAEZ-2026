const service = require('./policies.service');

async function matriz(req, res, next) {
  try {
    res.json({ data: await service.matriz(req.query.laboratorio_id) });
  } catch (err) {
    next(err);
  }
}

async function setPermiso(req, res, next) {
  try {
    res.json({ data: await service.setPermiso(req, req.body) });
  } catch (err) {
    next(err);
  }
}

async function bloqueo(req, res, next) {
  try {
    res.json({ data: await service.bloqueo(req.query.laboratorio_id) });
  } catch (err) {
    next(err);
  }
}

async function setBloqueo(req, res, next) {
  try {
    res.json({
      data: await service.setBloqueo(req, req.body.laboratorio_id, req.body),
    });
  } catch (err) {
    next(err);
  }
}

async function efectivos(req, res, next) {
  try {
    res.json({ data: await service.efectivos(req.params.usuarioId) });
  } catch (err) {
    next(err);
  }
}

async function generar(req, res, next) {
  try {
    res.status(201).json({ data: await service.generar(req, req.body.laboratorio_id) });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    res.json({ data: await service.list({ limite: req.query.limite }) });
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

async function desplegar(req, res, next) {
  try {
    res.json({ data: await service.desplegar(req, req.params.id) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  matriz,
  bloqueo,
  setBloqueo,
  setPermiso,
  efectivos,
  generar,
  list,
  get,
  desplegar,
};
