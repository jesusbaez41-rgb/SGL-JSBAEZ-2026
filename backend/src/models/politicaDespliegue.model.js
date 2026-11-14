const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Estado del despliegue de una política en cada PC (HU-COM-06, CA-08).
 */
const PoliticaDespliegue = sequelize.define(
  'PoliticaDespliegue',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    politica_id: { type: DataTypes.UUID, allowNull: false },
    equipo_id: { type: DataTypes.UUID, allowNull: false },
    estado: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PENDIENTE' },
    mensaje_error: { type: DataTypes.STRING(512) },
    salida: { type: DataTypes.TEXT },
    intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    fecha_reporte: { type: DataTypes.DATE },
  },
  {
    tableName: 'politica_despliegue',
    timestamps: false,
  },
);

module.exports = PoliticaDespliegue;
