const service = require('./apps.service');

async function list(req, res, next) {
  try {
    const data = await service.list({
      search: req.query.search || '',
      laboratorioId: req.query.laboratorio_id || null,
    });
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

async function upload(req, res, next) {
  try {
    const data = await service.createFromUpload(req, {
      nombre: req.body.nombre,
      version: req.body.version,
      parametros_silenciosos: req.body.parametros_silenciosos,
      archivo: req.file,
    });
    res.status(201).json({ data: data.app, instalador: data.instalador });
  } catch (err) {
    next(err);
  }
}

async function replaceInstaller(req, res, next) {
  try {
    const data = await service.replaceInstaller(req, req.params.id, req.file);
    res.status(201).json({ data: data.app, instalador: data.instalador });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    res.json({ data: await service.update(req, req.params.id, req.body) });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    res.json({ data: await service.remove(req, req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function verifyChecksum(req, res, next) {
  try {
    res.json({ data: await service.verifyChecksum(req, req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function listLinks(req, res, next) {
  try {
    res.json({ data: await service.listLinks(req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function link(req, res, next) {
  try {
    const data = await service.link(req, req.params.id, req.body);
    res.status(data.created ? 201 : 200).json({ data });
  } catch (err) {
    next(err);
  }
}

async function unlink(req, res, next) {
  try {
    res.json({ data: await service.unlink(req, req.params.id, req.params.laboratorioId) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  get,
  create,
  upload,
  replaceInstaller,
  update,
  remove,
  verifyChecksum,
  listLinks,
  link,
  unlink,
};
