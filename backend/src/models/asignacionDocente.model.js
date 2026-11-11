const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Asignación de un docente a un grupo para monitoreo (HU-COM-05, CA-09).
 * No implica membresía del docente en el grupo de Samba AD (RN-015).
 */
const AsignacionDocente = sequelize.define(
  'AsignacionDocente',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    docente_id: { type: DataTypes.UUID, allowNull: false },
    grupo_id: { type: DataTypes.UUID, allowNull: false },
    fecha_asignacion: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'asignacion_docente',
    timestamps: false,
  },
);

module.exports = AsignacionDocente;
