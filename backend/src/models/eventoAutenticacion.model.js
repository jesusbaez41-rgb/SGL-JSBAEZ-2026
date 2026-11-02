const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Auditoría append-only de autenticación (HU-COM-14, CA-12/14).
 * La BD bloquea UPDATE/DELETE con triggers.
 */
const EventoAutenticacion = sequelize.define(
  'EventoAutenticacion',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    usuario_id: { type: DataTypes.UUID, allowNull: true },
    uid_intentado: { type: DataTypes.STRING(64), allowNull: false },
    rol: { type: DataTypes.STRING(32) },
    accion: { type: DataTypes.STRING(32), allowNull: false },
    resultado: { type: DataTypes.STRING(16), allowNull: false },
    ip_origen: { type: DataTypes.STRING(45) },
    user_agent: { type: DataTypes.STRING(255) },
    detalle: { type: DataTypes.JSONB },
    fecha_evento: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'evento_autenticacion',
    timestamps: false,
  },
);

module.exports = EventoAutenticacion;
