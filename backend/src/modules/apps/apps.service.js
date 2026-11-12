const { Aplicacion, VinculoAppLab, Laboratorio } = require('../../models');
const { recordAuditEvent } = require('../audit/audit.service');
const checksum = require('./apps.checksum');
const storage = require('./apps.storage');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_FIELDS = [
  'nombre',
  'ruta_instalador',
  'parametros_silenciosos',
  'version',
  'checksum',
];

function httpError(status, message, code, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function assertValidId(id, label = 'Identificador') {
  if (!UUID_PATTERN.test(String(id || ''))) {
    throw httpError(400, `${label} inválido.`, 'ID_INVALIDO');
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeAppPayload(payload) {
  return {
    nombre: normalizeText(payload.nombre),
    ruta_instalador: normalizeText(payload.ruta_instalador),
    parametros_silenciosos: payload.parametros_silenciosos
      ? String(payload.parametros_silenciosos).trim()
      : null,
    version: normalizeText(payload.version),
    checksum: checksum.normalizeChecksum(payload.checksum),
    // HU-COM-08: comando de desinstalacion remota (CA-04).
    comando_desinstalacion: payload.comando_desinstalacion
      ? String(payload.comando_desinstalacion).trim()
      : null,
  };
}

function toPlain(value) {
  if (!value) return null;
  return value.toJSON ? value.toJSON() : value;
}

function toApp(app, counts = {}) {
  const data = toPlain(app);
  return {
    id: data.id,
    nombre: data.nombre,
    ruta_instalador: data.ruta_instalador,
    parametros_silenciosos: data.parametros_silenciosos || null,
    version: data.version,
    checksum: data.checksum,
    origen: data.origen || 'ruta',
    comando_desinstalacion: data.comando_desinstalacion || null,
    created_at: data.created_at || null,
    vinculos_activos: counts.activos || 0,
    laboratorios: counts.laboratorios || [],
  };
}

function toLink(link) {
  const data = toPlain(link);
  const lab = data.laboratorio ? toPlain(data.laboratorio) : null;
  return {
    id: data.id,
    app_id: data.app_id,
    laboratorio_id: data.laboratorio_id,
    version: data.version || null,
    app_nombre: data.app_nombre || null,
    activo: Boolean(data.activo),
    fecha_vinculacion: data.fecha_vinculacion || null,
    laboratorio: lab
      ? {
          id: lab.id,
          nombre: lab.nombre,
          ubicacion: lab.ubicacion,
          subred: lab.subred,
        }
      : null,
  };
}

function translateDbError(err) {
  if (err.status) return err;

  if (err.name === 'SequelizeUniqueConstraintError') {
    return httpError(
      409,
      'Ya existe una versión activa de esta aplicación en el laboratorio.',
      'VERSION_CONFLICTO',
    );
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return httpError(
      409,
      'La aplicación tiene despliegues asociados y no se puede eliminar.',
      'APP_CON_DESPLIEGUES',
    );
  }

  // Errores que no vienen de la base (por ejemplo ENOSPC: disco lleno)
  // se propagan con su mensaje real para no ocultar la causa.
  if (!String(err.name || '').startsWith('Sequelize')) return err;

  return httpError(500, 'No se pudo guardar la aplicación.', 'DB_ERROR');
}

async function findAppOrThrow(id) {
  assertValidId(id, 'Identificador de aplicación');
  const app = await Aplicacion.findByPk(id);
  if (!app) throw httpError(404, 'Aplicación no encontrada.', 'APP_NO_ENCONTRADA');
  return app;
}

async function countActiveLinks(appId) {
  return VinculoAppLab.count({ where: { app_id: appId, activo: true } });
}

async function assertNoDuplicate({ nombre, version, excludeId = null }) {
  const existing = await Aplicacion.findOne({ where: { nombre, version } });
  if (existing && existing.id !== excludeId) {
    throw httpError(
      409,
      'Ya existe una aplicación con ese nombre y versión.',
      'APP_DUPLICADA',
    );
  }
}

function matchesSearch(app, term) {
  if (!term) return true;
  const needle = term.toLowerCase();
  return [app.nombre, app.version, app.ruta_instalador]
    .map((value) => String(value || '').toLowerCase())
    .some((value) => value.includes(needle));
}

/**
 * Lista el catálogo. Si se indica un laboratorio, solo devuelve las apps
 * vinculadas activamente a ese laboratorio (HU-COM-07, RN-002).
 */
async function list({ search = '', laboratorioId = null } = {}) {
  const apps = await Aplicacion.findAll({
    order: [
      ['nombre', 'ASC'],
      ['version', 'DESC'],
    ],
  });

  const linkWhere = laboratorioId ? { laboratorio_id: laboratorioId } : {};
  const links = await VinculoAppLab.findAll({ where: linkWhere });

  const byApp = new Map();
  for (const link of links) {
    const data = toPlain(link);
    if (!data.activo) continue;
    if (!byApp.has(data.app_id)) byApp.set(data.app_id, []);
    byApp.get(data.app_id).push(data);
  }

  const result = [];
  for (const app of apps) {
    const active = byApp.get(app.id) || [];
    if (laboratorioId && active.length === 0) continue;
    if (!matchesSearch(app, search)) continue;
    result.push(
      toApp(app, {
        activos: active.length,
        laboratorios: [...new Set(active.map((link) => link.laboratorio_id))],
      }),
    );
  }

  return result;
}

async function get(id) {
  const app = await findAppOrThrow(id);
  const links = await VinculoAppLab.findAll({
    where: { app_id: app.id },
    include: [{ model: Laboratorio, as: 'laboratorio' }],
    order: [['fecha_vinculacion', 'DESC']],
  });

  const mapped = links.map(toLink);
  return {
    ...toApp(app, {
      activos: mapped.filter((link) => link.activo).length,
      laboratorios: mapped.filter((link) => link.activo).map((link) => link.laboratorio_id),
    }),
    vinculos: mapped,
  };
}

async function create(req, payload) {
  const data = normalizeAppPayload(payload);

  // CA-01: el archivo debe existir y su SHA-256 debe coincidir antes de guardar.
  await checksum.verifyInstallerChecksum({
    ruta: data.ruta_instalador,
    checksum: data.checksum,
  });

  await assertNoDuplicate({ nombre: data.nombre, version: data.version });

  let app;
  try {
    app = await Aplicacion.create(data);
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'CREAR',
    entidad: 'aplicacion',
    entidadId: app.id,
    detalle: {
      nombre: data.nombre,
      version: data.version,
      checksum: data.checksum,
      ruta_instalador: data.ruta_instalador,
    },
  });

  return toApp(app, { activos: 0, laboratorios: [] });
}

/**
 * Alta de una aplicación con el instalador subido por el administrador.
 *
 * El backend guarda el archivo en APPS_INSTALLERS_DIR, calcula su SHA-256 y
 * registra la app con esa ruta y ese hash (HU-COM-07, CA-01 / RNF-006).
 * Si algo falla, el archivo subido no queda almacenado en el servidor.
 */
async function createFromUpload(req, payload) {
  const archivo = payload.archivo;

  if (!archivo || !archivo.path) {
    throw httpError(400, 'No se recibió el instalador.', 'INSTALADOR_FALTANTE');
  }

  const nombre = normalizeText(payload.nombre);
  const version = normalizeText(payload.version);
  const parametros = payload.parametros_silenciosos
    ? String(payload.parametros_silenciosos).trim()
    : null;

  await assertNoDuplicate({ nombre, version });

  let stored = null;
  try {
    stored = await storage.storeInstaller(archivo.path, archivo.originalname, {
      nombre,
      version,
    });

    const hash = await checksum.sha256File(stored.ruta);

    let app;
    try {
      app = await Aplicacion.create({
        nombre,
        version,
        ruta_instalador: stored.ruta,
        parametros_silenciosos: parametros,
        checksum: hash,
        origen: 'upload',
      });
    } catch (err) {
      throw translateDbError(err);
    }

    await recordAuditEvent(req, {
      accion: 'CREAR',
      entidad: 'aplicacion',
      entidadId: app.id,
      detalle: {
        nombre,
        version,
        checksum: hash,
        ruta_instalador: stored.ruta,
        origen: 'upload',
        archivo: stored.nombre_archivo,
        tamano: stored.tamano,
      },
    });

    return {
      app: toApp(app, { activos: 0, laboratorios: [] }),
      instalador: {
        ruta: stored.ruta,
        nombre_archivo: stored.nombre_archivo,
        extension: stored.extension,
        tamano: stored.tamano,
        checksum: hash,
      },
    };
  } catch (err) {
    if (stored) await storage.removeInstaller(stored.ruta);
    await storage.removeTempFile(archivo.path);
    throw err;
  }
}

async function update(req, id, payload) {
  const app = await findAppOrThrow(id);
  const changes = {};

  if (payload.nombre !== undefined) {
    changes.nombre = normalizeText(payload.nombre);
  }
  if (payload.version !== undefined) {
    changes.version = normalizeText(payload.version);
  }
  if (payload.ruta_instalador !== undefined) {
    changes.ruta_instalador = normalizeText(payload.ruta_instalador);
  }
  if (payload.checksum !== undefined) {
    changes.checksum = checksum.normalizeChecksum(payload.checksum);
  }
  if (payload.parametros_silenciosos !== undefined) {
    changes.parametros_silenciosos = payload.parametros_silenciosos
      ? String(payload.parametros_silenciosos).trim()
      : null;
  }
  if (payload.comando_desinstalacion !== undefined) {
    changes.comando_desinstalacion = payload.comando_desinstalacion
      ? String(payload.comando_desinstalacion).trim()
      : null;
  }

  const changed = Object.keys(changes).filter((key) => {
    const current = app[key] === undefined || app[key] === null ? '' : String(app[key]);
    const next = changes[key] === null ? '' : String(changes[key]);
    return current !== next;
  });

  if (changed.length === 0) {
    return toApp(app, {
      activos: await countActiveLinks(app.id),
      laboratorios: [],
    });
  }

  // Un cambio de identidad rompería el vínculo y el índice RN-007.
  if ((changes.nombre || changes.version) && (await countActiveLinks(app.id)) > 0) {
    throw httpError(
      409,
      'No se puede cambiar el nombre ni la versión de una aplicación vinculada.',
      'APP_VINCULADA',
    );
  }

  if (changes.nombre || changes.version) {
    await assertNoDuplicate({
      nombre: changes.nombre || app.nombre,
      version: changes.version || app.version,
      excludeId: app.id,
    });
  }

  // CA-01: si cambia el archivo o el hash, se vuelve a verificar.
  if (changes.ruta_instalador !== undefined || changes.checksum !== undefined) {
    await checksum.verifyInstallerChecksum({
      ruta: changes.ruta_instalador || app.ruta_instalador,
      checksum: changes.checksum || app.checksum,
    });
  }

  try {
    await app.update(changes);
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'aplicacion',
    entidadId: app.id,
    detalle: {
      campos: changed,
      actual: changed.reduce((acc, key) => {
        acc[key] = app[key];
        return acc;
      }, {}),
    },
  });

  return toApp(app, {
    activos: await countActiveLinks(app.id),
    laboratorios: [],
  });
}

/**
 * Reemplaza el instalador de una app existente: guarda el archivo nuevo,
 * recalcula el SHA-256 y descarta el anterior si ya no lo usa nadie.
 */
async function replaceInstaller(req, id, archivo) {
  const app = await findAppOrThrow(id);

  if (!archivo || !archivo.path) {
    throw httpError(400, 'No se recibió el instalador.', 'INSTALADOR_FALTANTE');
  }

  const anterior = app.ruta_instalador;
  const origenAnterior = app.origen || 'ruta';

  let stored = null;
  try {
    stored = await storage.storeInstaller(archivo.path, archivo.originalname, {
      nombre: app.nombre,
      version: app.version,
    });

    const hash = await checksum.sha256File(stored.ruta);
    await app.update({
      ruta_instalador: stored.ruta,
      checksum: hash,
      origen: 'upload',
    });

    let eliminado = false;
    if (origenAnterior === 'upload' && anterior && anterior !== stored.ruta) {
      const otros = await Aplicacion.count({ where: { ruta_instalador: anterior } });
      if (otros === 0) eliminado = await storage.removeInstaller(anterior);
    }

    await recordAuditEvent(req, {
      accion: 'ACTUALIZAR',
      entidad: 'aplicacion',
      entidadId: app.id,
      detalle: {
        operacion: 'REEMPLAZAR_INSTALADOR',
        checksum: hash,
        ruta_instalador: stored.ruta,
        archivo: stored.nombre_archivo,
        tamano: stored.tamano,
        instalador_anterior_eliminado: eliminado,
      },
    });

    return {
      app: toApp(app, {
        activos: await countActiveLinks(app.id),
        laboratorios: [],
      }),
      instalador: {
        ruta: stored.ruta,
        nombre_archivo: stored.nombre_archivo,
        extension: stored.extension,
        tamano: stored.tamano,
        checksum: hash,
      },
    };
  } catch (err) {
    if (stored) await storage.removeInstaller(stored.ruta);
    await storage.removeTempFile(archivo.path);
    throw err;
  }
}

async function remove(req, id) {
  const app = await findAppOrThrow(id);
  const activos = await countActiveLinks(app.id);

  if (activos > 0) {
    throw httpError(
      409,
      'La aplicación tiene laboratorios vinculados. Desvincúlela antes de eliminarla.',
      'APP_VINCULADA',
    );
  }

  const ruta = app.ruta_instalador;
  const origen = app.origen || 'ruta';

  try {
    await app.destroy();
  } catch (err) {
    throw translateDbError(err);
  }

  // Si el instalador fue subido por el administrador y ninguna otra app lo
  // referencia, se elimina del disco para no dejar archivos huérfanos.
  let instaladorEliminado = false;
  if (origen === 'upload' && ruta) {
    const otros = await Aplicacion.count({ where: { ruta_instalador: ruta } });
    if (otros === 0) instaladorEliminado = await storage.removeInstaller(ruta);
  }

  await recordAuditEvent(req, {
    accion: 'ELIMINAR',
    entidad: 'aplicacion',
    entidadId: id,
    detalle: {
      nombre: app.nombre,
      version: app.version,
      checksum: app.checksum,
      origen,
      instalador_eliminado: instaladorEliminado,
    },
  });

  return { id, nombre: app.nombre, deleted: true, instalador_eliminado: instaladorEliminado };
}

async function verifyChecksum(req, id) {
  const app = await findAppOrThrow(id);
  const result = await checksum.verifyInstallerChecksum({
    ruta: app.ruta_instalador,
    checksum: app.checksum,
  });

  await recordAuditEvent(req, {
    accion: 'EJECUTAR',
    entidad: 'aplicacion',
    entidadId: app.id,
    detalle: {
      operacion: 'VERIFICAR_CHECKSUM',
      checksum: result.checksum,
      ruta: result.ruta,
      tamano: result.tamano,
    },
  });

  return {
    id: app.id,
    valido: true,
    checksum: result.checksum,
    ruta: result.ruta,
    tamano: result.tamano,
  };
}

/**
 * Vincula una app a un laboratorio (RN-002) aplicando RN-007.
 */
async function link(req, appId, payload) {
  assertValidId(appId, 'Identificador de aplicación');
  assertValidId(payload.laboratorio_id, 'Identificador de laboratorio');

  const app = await Aplicacion.findByPk(appId);
  if (!app) throw httpError(404, 'Aplicación no encontrada.', 'APP_NO_ENCONTRADA');

  const lab = await Laboratorio.findByPk(payload.laboratorio_id);
  if (!lab) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');

  const activeLinks = await VinculoAppLab.findAll({
    where: { laboratorio_id: lab.id, activo: true },
  });

  const sameName = activeLinks.find(
    (link) =>
      String(toPlain(link).app_nombre || '').toLowerCase() === String(app.nombre).toLowerCase(),
  );

  if (sameName) {
    const data = toPlain(sameName);
    if (data.app_id === app.id) {
      return { created: false, vinculo: toLink(sameName), app: toApp(app) };
    }
    throw httpError(
      409,
      `El laboratorio ya tiene activa la versión ${data.version || '?'} de ${app.nombre}.`,
      'VERSION_CONFLICTO',
      { version_activa: data.version || null, app_activa: data.app_id },
    );
  }

  let vinculo;
  try {
    vinculo = await VinculoAppLab.create({
      app_id: app.id,
      laboratorio_id: lab.id,
      activo: true,
      app_nombre: app.nombre,
      version: app.version,
    });
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'CREAR',
    entidad: 'vinculo_app_lab',
    entidadId: vinculo.id,
    detalle: {
      app_id: app.id,
      nombre: app.nombre,
      version: app.version,
      laboratorio_id: lab.id,
      laboratorio: lab.nombre,
    },
  });

  return { created: true, vinculo: toLink(vinculo), app: toApp(app) };
}

/**
 * Desvincula conservando el historial: la fila queda con `activo = false`.
 */
async function unlink(req, appId, laboratorioId) {
  assertValidId(appId, 'Identificador de aplicación');
  assertValidId(laboratorioId, 'Identificador de laboratorio');

  const app = await findAppOrThrow(appId);

  const active = await VinculoAppLab.findOne({
    where: { app_id: app.id, laboratorio_id: laboratorioId, activo: true },
  });

  if (!active) {
    throw httpError(404, 'La aplicación no está vinculada a ese laboratorio.', 'VINCULO_NO_ENCONTRADO');
  }

  try {
    await active.update({ activo: false });
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ELIMINAR',
    entidad: 'vinculo_app_lab',
    entidadId: active.id,
    detalle: {
      app_id: app.id,
      laboratorio_id: laboratorioId,
      desactivado: true,
      historial_conservado: true,
    },
  });

  return { removed: true, vinculo: toLink(active) };
}

async function listLinks(appId) {
  const app = await findAppOrThrow(appId);
  const links = await VinculoAppLab.findAll({
    where: { app_id: app.id },
    include: [{ model: Laboratorio, as: 'laboratorio' }],
    order: [['fecha_vinculacion', 'DESC']],
  });
  return links.map(toLink);
}

/**
 * Precondición de despliegue (RN-002 / CA-02): lanza 409 si la app no está
 * vinculada activamente al laboratorio. Reutilizable por HU-COM-08.
 */
async function assertAppLinked(laboratorioId, appId) {
  assertValidId(appId, 'Identificador de aplicación');
  assertValidId(laboratorioId, 'Identificador de laboratorio');

  const vinculo = await VinculoAppLab.findOne({
    where: { app_id: appId, laboratorio_id: laboratorioId, activo: true },
  });

  if (!vinculo) {
    throw httpError(
      409,
      'La aplicación no está vinculada al laboratorio; no se puede desplegar.',
      'APP_NO_VINCULADA',
    );
  }

  return vinculo;
}

module.exports = {
  list,
  get,
  create,
  createFromUpload,
  replaceInstaller,
  update,
  remove,
  verifyChecksum,
  link,
  unlink,
  listLinks,
  assertAppLinked,
};
