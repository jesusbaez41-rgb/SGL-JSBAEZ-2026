const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Configuración de filtrado generada para un grupo y laboratorio (CA-07).
 * Se guarda en formato Squid y SquidGuard para poder publicarla o auditarla.
 */
const ConfigFiltrado = sequelize.define(
  'ConfigFiltrado',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    grupo_id: { type: DataTypes.UUID, allowNull: false },
    laboratorio_id: { type: DataTypes.UUID, allowNull: false },
    config_squid: { type: DataTypes.TEXT, allowNull: false },
    config_squidguard: { type: DataTypes.TEXT, allowNull: false },
    version: { type: DataTypes.STRING(32), allowNull: false },
    fecha_generacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'config_filtrado',
    timestamps: false,
  },
);

module.exports = ConfigFiltrado;
