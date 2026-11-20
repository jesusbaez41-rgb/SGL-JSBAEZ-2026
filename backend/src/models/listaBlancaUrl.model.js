const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Lista blanca de URLs de un grupo (HU-COM-09, RN-016).
 *
 * `url` guarda un dominio normalizado (sin esquema, ruta ni puerto). Un
 * estudiante puede navegar a la unión de los dominios de sus grupos.
 */
const ListaBlancaUrl = sequelize.define(
  'ListaBlancaUrl',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    grupo_id: { type: DataTypes.UUID, allowNull: false },
    url: { type: DataTypes.STRING(512), allowNull: false },
    descripcion: { type: DataTypes.STRING(255) },
    creado_por: { type: DataTypes.UUID },
    fecha_alta: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: 'lista_blanca_url',
    timestamps: false,
  },
);

module.exports = ListaBlancaUrl;
