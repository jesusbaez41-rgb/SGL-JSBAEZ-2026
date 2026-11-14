const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Política AppLocker combinada de un laboratorio (HU-COM-06, CA-07/CA-08).
 * Es la que se despliega a las PCs del laboratorio.
 */
const PoliticaLaboratorio = sequelize.define(
  'PoliticaLaboratorio',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    laboratorio_id: { type: DataTypes.UUID, allowNull: false },
    generada_por: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.STRING(64), allowNull: false },
    contenido: { type: DataTypes.TEXT, allowNull: false },
    resumen: { type: DataTypes.JSONB },
    // HU-COM-06: configuración de bloqueo + script desplegado.
    config: { type: DataTypes.JSONB },
    fecha_generacion: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'politica_laboratorio',
    timestamps: false,
  },
);

module.exports = PoliticaLaboratorio;
