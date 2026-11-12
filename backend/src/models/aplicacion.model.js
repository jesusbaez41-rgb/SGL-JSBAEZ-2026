const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Catálogo de aplicaciones e instaladores (HU-COM-07, RF-004).
 * El checksum se almacena normalizado como SHA-256 hexadecimal.
 */
const Aplicacion = sequelize.define(
  'Aplicacion',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    nombre: { type: DataTypes.STRING(128), allowNull: false },
    ruta_instalador: { type: DataTypes.STRING(512), allowNull: false },
    parametros_silenciosos: { type: DataTypes.TEXT },
    version: { type: DataTypes.STRING(32), allowNull: false },
    checksum: { type: DataTypes.STRING(128), allowNull: false },
    // 'upload' = el instalador fue subido por el administrador; 'ruta' = ya estaba en el servidor.
    origen: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'ruta' },
    // HU-COM-08: comando de desinstalacion remota (CA-04).
    comando_desinstalacion: { type: DataTypes.TEXT },
  },
  {
    tableName: 'aplicacion',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);

module.exports = Aplicacion;
