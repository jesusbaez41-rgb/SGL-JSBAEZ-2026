const sequelize = require('../config/database');
const Usuario = require('./usuario.model');
const Grupo = require('./grupo.model');
const MembresiaGrupo = require('./membresiaGrupo.model');
const AsignacionDocente = require('./asignacionDocente.model');
const Laboratorio = require('./laboratorio.model');
const Equipo = require('./equipo.model');
const SesionWeb = require('./sesionWeb.model');
const EventoAutenticacion = require('./eventoAutenticacion.model');
const Auditoria = require('./auditoria.model');
const Aplicacion = require('./aplicacion.model');
const VinculoAppLab = require('./vinculoAppLab.model');
const Despliegue = require('./despliegue.model');
const DespliegueEquipo = require('./despliegueEquipo.model');
const PermisoAppGrupo = require('./permisoAppGrupo.model');
const PoliticaEjecucion = require('./politicaEjecucion.model');
const PoliticaLaboratorio = require('./politicaLaboratorio.model');
const PoliticaDespliegue = require('./politicaDespliegue.model');

// HU-COM-03: un laboratorio tiene muchos equipos y cada equipo pertenece a uno.
Laboratorio.hasMany(Equipo, { foreignKey: 'laboratorio_id', as: 'equipos' });
Equipo.belongsTo(Laboratorio, { foreignKey: 'laboratorio_id', as: 'laboratorio' });

// HU-COM-05: estudiantes ↔ grupos (N:M con membresía) y docentes asignados.
Usuario.belongsToMany(Grupo, {
  through: MembresiaGrupo,
  foreignKey: 'usuario_id',
  otherKey: 'grupo_id',
  as: 'gruposEstudiante',
});
Grupo.belongsToMany(Usuario, {
  through: MembresiaGrupo,
  foreignKey: 'grupo_id',
  otherKey: 'usuario_id',
  as: 'estudiantes',
});
Usuario.belongsToMany(Grupo, {
  through: AsignacionDocente,
  foreignKey: 'docente_id',
  otherKey: 'grupo_id',
  as: 'gruposDocente',
});
Grupo.belongsToMany(Usuario, {
  through: AsignacionDocente,
  foreignKey: 'grupo_id',
  otherKey: 'docente_id',
  as: 'docentes',
});

MembresiaGrupo.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
MembresiaGrupo.belongsTo(Grupo, { foreignKey: 'grupo_id', as: 'grupo' });
AsignacionDocente.belongsTo(Usuario, { foreignKey: 'docente_id', as: 'docente' });
AsignacionDocente.belongsTo(Grupo, { foreignKey: 'grupo_id', as: 'grupo' });

// HU-COM-07: catálogo de aplicaciones y vínculos con laboratorios.
Aplicacion.hasMany(VinculoAppLab, { foreignKey: 'app_id', as: 'vinculos' });
VinculoAppLab.belongsTo(Aplicacion, { foreignKey: 'app_id', as: 'aplicacion' });
Laboratorio.hasMany(VinculoAppLab, { foreignKey: 'laboratorio_id', as: 'vinculosApp' });
VinculoAppLab.belongsTo(Laboratorio, { foreignKey: 'laboratorio_id', as: 'laboratorio' });

// HU-COM-08: despliegues masivos y estado por equipo.
Despliegue.belongsTo(VinculoAppLab, { foreignKey: 'vinculo_id', as: 'vinculo' });
VinculoAppLab.hasMany(Despliegue, { foreignKey: 'vinculo_id', as: 'despliegues' });
Despliegue.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
Despliegue.hasMany(DespliegueEquipo, { foreignKey: 'despliegue_id', as: 'estados' });
DespliegueEquipo.belongsTo(Despliegue, { foreignKey: 'despliegue_id', as: 'despliegue' });
DespliegueEquipo.belongsTo(Equipo, { foreignKey: 'equipo_id', as: 'equipo' });
Equipo.hasMany(DespliegueEquipo, { foreignKey: 'equipo_id', as: 'despliegues' });

// HU-COM-06: permisos por grupo y políticas de ejecución.
VinculoAppLab.hasMany(PermisoAppGrupo, { foreignKey: 'vinculo_id', as: 'permisos' });
PermisoAppGrupo.belongsTo(VinculoAppLab, { foreignKey: 'vinculo_id', as: 'vinculo' });
Grupo.hasMany(PermisoAppGrupo, { foreignKey: 'grupo_id', as: 'permisosApp' });
PermisoAppGrupo.belongsTo(Grupo, { foreignKey: 'grupo_id', as: 'grupo' });

Grupo.hasMany(PoliticaEjecucion, { foreignKey: 'grupo_id', as: 'politicas' });
PoliticaEjecucion.belongsTo(Grupo, { foreignKey: 'grupo_id', as: 'grupo' });
Laboratorio.hasMany(PoliticaEjecucion, { foreignKey: 'laboratorio_id', as: 'politicasGrupo' });
PoliticaEjecucion.belongsTo(Laboratorio, { foreignKey: 'laboratorio_id', as: 'laboratorio' });

Laboratorio.hasMany(PoliticaLaboratorio, { foreignKey: 'laboratorio_id', as: 'politicas' });
PoliticaLaboratorio.belongsTo(Laboratorio, { foreignKey: 'laboratorio_id', as: 'laboratorio' });
PoliticaLaboratorio.belongsTo(Usuario, { foreignKey: 'generada_por', as: 'autor' });
PoliticaLaboratorio.hasMany(PoliticaDespliegue, { foreignKey: 'politica_id', as: 'despliegues' });
PoliticaDespliegue.belongsTo(PoliticaLaboratorio, { foreignKey: 'politica_id', as: 'politica' });
PoliticaDespliegue.belongsTo(Equipo, { foreignKey: 'equipo_id', as: 'equipo' });
Equipo.hasMany(PoliticaDespliegue, { foreignKey: 'equipo_id', as: 'politicas' });

module.exports = {
  sequelize,
  Usuario,
  Grupo,
  MembresiaGrupo,
  AsignacionDocente,
  Laboratorio,
  Equipo,
  SesionWeb,
  EventoAutenticacion,
  Auditoria,
  Aplicacion,
  VinculoAppLab,
  Despliegue,
  DespliegueEquipo,
  PermisoAppGrupo,
  PoliticaEjecucion,
  PoliticaLaboratorio,
  PoliticaDespliegue,
};
