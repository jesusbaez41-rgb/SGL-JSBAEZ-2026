const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Auditoría inmutable de acciones críticas (RN-010).
 * El trigger de BD impide UPDATE y DELETE.
 */
const Auditoria = sequelize.define(
  'Auditoria',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    usuario_id: { type: DataTypes.UUID, allowNull: false },
    accion: { type: DataTypes.STRING(32), allowNull: false },
    entidad_afectada: { type: DataTypes.STRING(64), allowNull: false },
    entidad_id: { type: DataTypes.UUID },
    detalle: { type: DataTypes.JSONB },
    ip_origen: { type: DataTypes.STRING(45) },
    fecha_evento: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    inmutable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: 'auditoria',
    timestamps: false,
  },
);

module.exports = Auditoria;
