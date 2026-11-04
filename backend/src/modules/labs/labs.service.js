const { QueryTypes } = require('sequelize');
const { sequelize, Laboratorio } = require('../../models');
const { recordAuditEvent } = require('../audit/audit.service');
const { isValidSubred } = require('./labs.validators');

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function normalizeSubred(value) {
  const [ip, prefix] = String(value).trim().split('/');
  const bits = Number(prefix);
  const ipNum = ip
    .split('.')
    .reduce((acc, octet) => (((acc << 8) + Number(octet)) >>> 0), 0);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const network = (ipNum & mask) >>> 0;

  return [
    (network >>> 24) & 255,
    (network >>> 16) & 255,
    (network >>> 8) & 255,
    network & 255,
  ].join('.') + `/${bits}`;
}

function translateDbError(err) {
  if (err.status) return err;
  if (err.name === 'SequelizeUniqueConstraintError') {
    return httpError(409, 'Ya existe un laboratorio con ese nombre.', 'LAB_DUPLICADO');
  }
  return httpError(500, 'No se pudo guardar el laboratorio.', 'DB_ERROR');
}

async function list() {
  return sequelize.query(
    `
    SELECT l.id,
           l.nombre,
           l.ubicacion,
           l.subred,
           l.created_at,
           count(e.id)::int AS equipos
      FROM laboratorio l
      LEFT JOIN equipo e ON e.laboratorio_id = l.id
     GROUP BY l.id
     ORDER BY l.nombre ASC
    `,
    { type: QueryTypes.SELECT },
  );
}

async function get(id) {
  const lab = await Laboratorio.findByPk(id);
  if (!lab) throw httpError(404, 'Laboratorio no encontrado.', 'LAB_NO_ENCONTRADO');
  return lab;
}

async function create(req, payload) {
  const nombre = String(payload.nombre || '').trim();
  const ubicacion = String(payload.ubicacion || '').trim();
  const subred = normalizeSubred(payload.subred);

  const existing = await Laboratorio.findOne({ where: { nombre } });
  if (existing) throw httpError(409, 'Ya existe un laboratorio con ese nombre.', 'LAB_DUPLICADO');

  let lab;
  try {
    lab = await Laboratorio.create({ nombre, ubicacion, subred });
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'CREAR',
    entidad: 'laboratorio',
    entidadId: lab.id,
    detalle: { nombre, ubicacion, subred },
  });

  return lab;
}

async function update(req, id, payload) {
  const lab = await get(id);
  const changes = {};

  if (payload.nombre !== undefined) {
    const nombre = String(payload.nombre || '').trim();
    const existing = await Laboratorio.findOne({ where: { nombre } });
    if (existing && existing.id !== lab.id) {
      throw httpError(409, 'Ya existe un laboratorio con ese nombre.', 'LAB_DUPLICADO');
    }
    changes.nombre = nombre;
  }
  if (payload.ubicacion !== undefined) {
    changes.ubicacion = String(payload.ubicacion || '').trim();
  }
  if (payload.subred !== undefined) {
    if (!isValidSubred(payload.subred)) {
      throw httpError(400, 'Subred inválida.', 'SUBRED_INVALIDA');
    }
    changes.subred = normalizeSubred(payload.subred);
  }

  if (Object.keys(changes).length === 0) return lab;

  try {
    await lab.update(changes);
  } catch (err) {
    throw translateDbError(err);
  }

  await recordAuditEvent(req, {
    accion: 'ACTUALIZAR',
    entidad: 'laboratorio',
    entidadId: lab.id,
    detalle: { campos: Object.keys(changes), actual: changes },
  });

  return lab;
}

module.exports = { list, get, create, update };
