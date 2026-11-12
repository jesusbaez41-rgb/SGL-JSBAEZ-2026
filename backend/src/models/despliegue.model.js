const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Despliegue masivo de una aplicación en un laboratorio (HU-COM-08).
 *
 * Cada despliegue nace de un vínculo app-laboratorio (RN-002) y genera una
 * fila por equipo con su estado individual (RN-006).
 */
const Despliegue = sequelize.define(
  'Despliegue',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    vinculo_id: { type: DataTypes.UUID, allowNull: false },
    usuario_id: { type: DataTypes.UUID, allowNull: false },
    tipo: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'INSTALAR' },
    fecha_inicio: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_fin: { type: DataTypes.DATE },
    total_equipos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: 'despliegue',
    timestamps: false,
  },
);

module.exports = Despliegue;
