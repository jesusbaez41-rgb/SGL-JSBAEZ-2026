const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Equipo = sequelize.define(
  'Equipo',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    mac_address: { type: DataTypes.STRING(17), allowNull: false, unique: true },
    hostname: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    ip_address: { type: DataTypes.STRING(45) },
    laboratorio_id: { type: DataTypes.UUID, allowNull: false },
    estado: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'DESCONOCIDO' },
    mesh_agent_id: { type: DataTypes.STRING(128) },
    ultimo_reporte: { type: DataTypes.DATE },
  },
  {
    tableName: 'equipo',
    timestamps: false,
  },
);

module.exports = Equipo;
