const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Laboratorio = sequelize.define(
  'Laboratorio',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    nombre: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    ubicacion: { type: DataTypes.STRING(255), allowNull: false },
    subred: { type: DataTypes.STRING(64), allowNull: false },
  },
  {
    tableName: 'laboratorio',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);

module.exports = Laboratorio;
