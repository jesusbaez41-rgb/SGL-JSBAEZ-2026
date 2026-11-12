const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Vínculo app ↔ laboratorio (HU-COM-07, RN-002/RN-007).
 * `app_nombre` y `version` los completa el trigger `tg_vinculo_sync_version`.
 */
const VinculoAppLab = sequelize.define(
  'VinculoAppLab',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    app_id: { type: DataTypes.UUID, allowNull: false },
    laboratorio_id: { type: DataTypes.UUID, allowNull: false },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    fecha_vinculacion: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    version: { type: DataTypes.STRING(32) },
    app_nombre: { type: DataTypes.STRING(128) },
  },
  {
    tableName: 'vinculo_app_lab',
    timestamps: false,
  },
);

module.exports = VinculoAppLab;
