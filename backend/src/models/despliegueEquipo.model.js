const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Estado de un equipo dentro de un despliegue (HU-COM-08, CA-03).
 *
 * Estados: PENDIENTE | EN_PROCESO | COMPLETADO | FALLIDO.
 * Un equipo apagado queda PENDIENTE y se reintenta al encenderse (CA-02).
 */
const DespliegueEquipo = sequelize.define(
  'DespliegueEquipo',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    despliegue_id: { type: DataTypes.UUID, allowNull: false },
    equipo_id: { type: DataTypes.UUID, allowNull: false },
    estado: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PENDIENTE' },
    // Fase visible en la interfaz: ENVIANDO | EJECUTANDO | FINALIZADO | ESPERANDO
    fase: { type: DataTypes.STRING(24) },
    // Salida del comando remoto (resultado de la ejecución)
    salida: { type: DataTypes.TEXT },
    mensaje_error: { type: DataTypes.STRING(512) },
    intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    fecha_reporte: { type: DataTypes.DATE },
  },
  {
    tableName: 'despliegue_equipo',
    timestamps: false,
  },
);

module.exports = DespliegueEquipo;
