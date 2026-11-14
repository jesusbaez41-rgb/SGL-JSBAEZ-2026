const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Reglas AppLocker de un grupo en un laboratorio (HU-COM-06, CA-07).
 * Se regeneran cada vez que cambian los permisos del grupo.
 */
const PoliticaEjecucion = sequelize.define(
  'PoliticaEjecucion',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    grupo_id: { type: DataTypes.UUID, allowNull: false },
    laboratorio_id: { type: DataTypes.UUID, allowNull: false },
    reglas_applocker: { type: DataTypes.TEXT, allowNull: false },
    gpo_xml: { type: DataTypes.TEXT },
    version: { type: DataTypes.STRING(32), allowNull: false },
    fecha_generacion: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'politica_ejecucion',
    timestamps: false,
  },
);

module.exports = PoliticaEjecucion;
