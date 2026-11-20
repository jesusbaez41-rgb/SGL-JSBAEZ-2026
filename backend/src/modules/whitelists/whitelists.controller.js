const service = require('./whitelists.service');

async function list(req, res, next) {
  try {
    res.json({ data: await service.list() });
  } catch (err) {
    next(err);
  }
}

async function configuracion(req, res, next) {
  try {
    res.json({ data: await service.configuracion() });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    res.status(201).json({ data: await service.crear(req, req.body) });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    res.json({ data: await service.actualizar(req, req.params.id, req.body) });
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    res.json({ data: await service.eliminar(req, req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function efectivas(req, res, next) {
  try {
    res.json({ data: await service.efectivas(req.params.usuarioId) });
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

async function listarGeneradas(req, res, next) {
  try {
    res.json({ data: await service.listarGeneradas(req.query) });
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

async function sincronizar(req, res, next) {
  try {
    res.json({ data: await service.sincronizar(req, 'MANUAL') });
  } catch (err) {
    next(err);
  }
}

async function sesion(req, res, next) {
  try {
    res.json({ data: await service.sesionAgente(req, req.body) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  configuracion,
  crear,
  actualizar,
  eliminar,
  efectivas,
  generar,
  listarGeneradas,
  get,
  desplegar,
  sincronizar,
  sesion,
};
