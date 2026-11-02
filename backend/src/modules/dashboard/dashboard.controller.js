const { QueryTypes } = require('sequelize');
const { sequelize, Usuario, Grupo, Laboratorio, Equipo } = require('../../models');

/**
 * CA-07: cada rol recibe solo los contadores de su ámbito.
 * RN-017: el Docente solo cuenta estudiantes/equipos de sus grupos asignados.
 */
async function summary(req, res, next) {
  try {
    if (req.user.rol === 'ADMIN_ACADEMICO') {
      const [usuarios, grupos] = await Promise.all([
        Usuario.count(),
        Grupo.count(),
      ]);
      return res.json({ data: { usuarios, grupos } });
    }

    if (req.user.rol === 'ADMIN_TECNICO') {
      const [laboratorios, equipos] = await Promise.all([
        Laboratorio.count(),
        Equipo.count(),
      ]);
      return res.json({ data: { laboratorios, equipos } });
    }

    if (req.user.rol === 'DOCENTE') {
      const rows = await sequelize.query(
        `
        SELECT
          (SELECT count(DISTINCT u.id)
             FROM usuario u
             JOIN membresia_grupo m ON m.usuario_id = u.id AND m.activa = TRUE
             JOIN asignacion_docente a ON a.grupo_id = m.grupo_id
            WHERE a.docente_id = :docenteId
              AND u.rol = 'ESTUDIANTE'
              AND u.activo = TRUE) AS usuarios,
          (SELECT count(DISTINCT a.grupo_id)
             FROM asignacion_docente a
            WHERE a.docente_id = :docenteId) AS grupos,
          (SELECT count(DISTINCT e.laboratorio_id)
             FROM sesion_activa s
             JOIN equipo e ON e.id = s.equipo_id
             JOIN membresia_grupo m ON m.usuario_id = s.usuario_id AND m.activa = TRUE
             JOIN asignacion_docente a ON a.grupo_id = m.grupo_id
            WHERE a.docente_id = :docenteId
              AND s.activa = TRUE) AS laboratorios,
          (SELECT count(DISTINCT s.equipo_id)
             FROM sesion_activa s
             JOIN membresia_grupo m ON m.usuario_id = s.usuario_id AND m.activa = TRUE
             JOIN asignacion_docente a ON a.grupo_id = m.grupo_id
            WHERE a.docente_id = :docenteId
              AND s.activa = TRUE) AS equipos
        `,
        {
          replacements: { docenteId: req.user.id },
          type: QueryTypes.SELECT,
        },
      );

      return res.json({ data: rows[0] });
    }

    return res.status(403).json({ error: 'Acceso denegado', code: 'ACCESO_DENEGADO' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { summary };
