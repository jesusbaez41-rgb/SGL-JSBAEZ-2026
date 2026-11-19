/**
 * Validación de filtros de la auditoría de negocio (HU-COM-12).
 */
const ACCIONES = Object.freeze([
  'CREAR',
  'ACTUALIZAR',
  'ELIMINAR',
  'DESPLEGAR',
  'CAMBIO_PERMISO',
  'EJECUTAR',
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function text(value) {
  return String(value ?? '').trim();
}

function parseDate(value, endOfDay = false) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && DATE_ONLY.test(raw)) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function validateList(query = {}) {
  const errors = [];
  const accion = text(query.accion).toUpperCase();
  const entidad = text(query.entidad);
  const usuario = text(query.usuario);
  const q = text(query.q);
  const laboratorioId = text(query.laboratorio_id);
  const equipoId = text(query.equipo_id);
  const desde = text(query.desde);
  const hasta = text(query.hasta);
  const excluirSync = text(query.excluir_sincronizacion).toLowerCase();

  if (accion && !ACCIONES.includes(accion)) {
    errors.push(`La acción debe ser una de: ${ACCIONES.join(', ')}.`);
  }
  if (entidad && entidad.length > 64) {
    errors.push('La entidad no puede superar los 64 caracteres.');
  }
  if (usuario.length > 120) {
    errors.push('El usuario no puede superar los 120 caracteres.');
  }
  if (q.length > 120) {
    errors.push('La búsqueda no puede superar los 120 caracteres.');
  }
  if (excluirSync && !['0', '1', 'true', 'false'].includes(excluirSync)) {
    errors.push('El filtro de sincronizaciones debe ser 0 o 1.');
  }
  if (laboratorioId && !UUID_PATTERN.test(laboratorioId)) {
    errors.push('El laboratorio no es válido.');
  }
  if (equipoId && !UUID_PATTERN.test(equipoId)) {
    errors.push('El equipo no es válido.');
  }

  const desdeDate = desde ? parseDate(desde) : null;
  const hastaDate = hasta ? parseDate(hasta, true) : null;
  if (desde && !desdeDate) errors.push('La fecha desde no es válida.');
  if (hasta && !hastaDate) errors.push('La fecha hasta no es válida.');
  if (desdeDate && hastaDate && desdeDate > hastaDate) {
    errors.push('La fecha desde no puede ser posterior a la fecha hasta.');
  }

  return errors;
}

function parseList(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const accion = text(query.accion).toUpperCase() || undefined;
  const entidad = text(query.entidad) || undefined;
  const usuario = text(query.usuario) || undefined;
  const q = text(query.q) || undefined;
  const laboratorioId = text(query.laboratorio_id) || undefined;
  const equipoId = text(query.equipo_id) || undefined;

  return {
    limit,
    offset,
    accion,
    entidad,
    usuario,
    laboratorioId,
    equipoId,
    desde: parseDate(query.desde),
    hasta: parseDate(query.hasta, true),
    excluirSincronizacion: ['1', 'true'].includes(text(query.excluir_sincronizacion).toLowerCase()),
    q,
  };
}

module.exports = { ACCIONES, validateList, parseList };
