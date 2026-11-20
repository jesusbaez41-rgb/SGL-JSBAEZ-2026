const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Sesión de un estudiante en una PC (HU-COM-09, CA-04).
 *
 * La usa el agente de navegación para informar qué usuario inició sesión y
 * con qué IP, de modo que Squid aplique la lista blanca de sus grupos.
 */
const SesionActiva = sequelize.define(
  'SesionActiva',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    usuario_id: { type: DataTypes.UUID, allowNull: false },
    equipo_id: { type: DataTypes.UUID, allowNull: false },
    hora_inicio: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    hora_fin: { type: DataTypes.DATE },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ip_origen: { type: DataTypes.STRING(45) },
    grupos: { type: DataTypes.JSONB },
  },
  {
    tableName: 'sesion_activa',
    timestamps: false,
  },
);

module.exports = SesionActiva;
