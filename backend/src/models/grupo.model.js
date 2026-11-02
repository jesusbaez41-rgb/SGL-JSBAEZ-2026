const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Grupo = sequelize.define(
  'Grupo',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    codigo: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    descripcion: { type: DataTypes.STRING(255) },
    samba_sid: { type: DataTypes.STRING(128), allowNull: false },
    samba_dn: { type: DataTypes.STRING(512), allowNull: false },
  },
  {
    tableName: 'grupo',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);

module.exports = Grupo;
