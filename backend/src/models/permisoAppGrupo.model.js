const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Permiso de uso de una aplicación por grupo en un laboratorio
 * (HU-COM-06, RN-008/RN-013).
 *
 * `habilitado` nace en FALSE: al vincular una app ningún grupo tiene
 * permiso hasta que el administrador lo habilite (RN-008).
 */
const PermisoAppGrupo = sequelize.define(
  'PermisoAppGrupo',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    vinculo_id: { type: DataTypes.UUID, allowNull: false },
    grupo_id: { type: DataTypes.UUID, allowNull: false },
    habilitado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_config: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'permiso_app_grupo',
    timestamps: false,
  },
);

module.exports = PermisoAppGrupo;
