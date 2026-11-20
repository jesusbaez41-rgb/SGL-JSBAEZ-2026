const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Estado del despliegue de la configuración de navegación en un equipo
 * (HU-COM-09, CA-08/CA-09).
 */
const NavegacionDespliegue = sequelize.define(
  'NavegacionDespliegue',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    navegacion_id: { type: DataTypes.UUID, allowNull: false },
    equipo_id: { type: DataTypes.UUID, allowNull: false },
    estado: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PENDIENTE' },
    mensaje_error: { type: DataTypes.STRING(512) },
    salida: { type: DataTypes.TEXT },
    intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    fecha_reporte: { type: DataTypes.DATE },
  },
  {
    tableName: 'navegacion_despliegue',
    timestamps: false,
  },
);

module.exports = NavegacionDespliegue;
