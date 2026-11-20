const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Configuración de navegación combinada de un laboratorio (HU-COM-09).
 * Guarda el Squid generado, el PAC y el script que se publica a las PCs.
 */
const NavegacionLaboratorio = sequelize.define(
  'NavegacionLaboratorio',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    laboratorio_id: { type: DataTypes.UUID, allowNull: false },
    generada_por: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.STRING(64), allowNull: false },
    config_squid: { type: DataTypes.TEXT, allowNull: false },
    config_pac: { type: DataTypes.TEXT },
    script_pc: { type: DataTypes.TEXT, allowNull: false },
    resumen: { type: DataTypes.JSONB },
    fecha_generacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'navegacion_laboratorio',
    timestamps: false,
  },
);

module.exports = NavegacionLaboratorio;
