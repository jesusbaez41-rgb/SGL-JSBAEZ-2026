const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Sesión web revocable (HU-COM-14, CA-03/10/11).
 * El JWT lleva el jti; esta fila permite invalidarlo en backend.
 */
const SesionWeb = sequelize.define(
  'SesionWeb',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    jti: { type: DataTypes.UUID, allowNull: false, unique: true },
    usuario_id: { type: DataTypes.UUID, allowNull: false },
    rol: { type: DataTypes.STRING(32), allowNull: false },
    ip_origen: { type: DataTypes.STRING(45) },
    user_agent: { type: DataTypes.STRING(255) },
    creada_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ultima_actividad: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expira_en: { type: DataTypes.DATE, allowNull: false },
    revocada_en: { type: DataTypes.DATE },
    motivo_revocacion: { type: DataTypes.STRING(64) },
  },
  {
    tableName: 'sesion_web',
    timestamps: false,
  },
);

module.exports = SesionWeb;
