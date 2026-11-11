const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Membresía de un estudiante en un grupo (HU-COM-05, RN-012/RN-015).
 * La relación se conserva con `activa` para no perder historial.
 */
const MembresiaGrupo = sequelize.define(
  'MembresiaGrupo',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    usuario_id: { type: DataTypes.UUID, allowNull: false },
    grupo_id: { type: DataTypes.UUID, allowNull: false },
    fecha_asignacion: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: 'membresia_grupo',
    timestamps: false,
  },
);

module.exports = MembresiaGrupo;
