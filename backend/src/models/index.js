const sequelize = require('../config/database');
const Usuario = require('./usuario.model');
const Grupo = require('./grupo.model');
const Laboratorio = require('./laboratorio.model');
const Equipo = require('./equipo.model');
const SesionWeb = require('./sesionWeb.model');
const EventoAutenticacion = require('./eventoAutenticacion.model');
const Auditoria = require('./auditoria.model');

// HU-COM-03: un laboratorio tiene muchos equipos y cada equipo pertenece a uno.
Laboratorio.hasMany(Equipo, { foreignKey: 'laboratorio_id', as: 'equipos' });
Equipo.belongsTo(Laboratorio, { foreignKey: 'laboratorio_id', as: 'laboratorio' });

module.exports = {
  sequelize,
  Usuario,
  Grupo,
  Laboratorio,
  Equipo,
  SesionWeb,
  EventoAutenticacion,
  Auditoria,
};
