const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Usuario = sequelize.define(
  'Usuario',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    uid: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    nombre_completo: { type: DataTypes.STRING(255), allowNull: false },
    rol: { type: DataTypes.STRING(32), allowNull: false },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    samba_sid: { type: DataTypes.STRING(128) },
    samba_dn: { type: DataTypes.STRING(512), allowNull: false },
    intentos_fallidos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bloqueado_hasta: { type: DataTypes.DATE },
    ultimo_login: { type: DataTypes.DATE },
  },
  {
    tableName: 'usuario',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

module.exports = Usuario;
