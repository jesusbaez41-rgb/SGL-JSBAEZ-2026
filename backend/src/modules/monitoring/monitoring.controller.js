const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../models');

/**
 * Panel de docencia (CA-07, RN-017, RN-020).
 * Solo devuelve grupos asignados al docente y sesiones activas de estudiantes
 * que pertenecen a esos grupos. No expone PCs de otros grupos.
 */
async function overview(req, res, next) {
  try {
    const replacements = { docenteId: req.user.id };

    const grupos = await sequelize.query(
      `
      SELECT g.id,
             g.codigo,
             g.descripcion,
             (SELECT count(*)
                FROM membresia_grupo m
               WHERE m.grupo_id = g.id
                 AND m.activa = TRUE) AS estudiantes
        FROM grupo g
        JOIN asignacion_docente a ON a.grupo_id = g.id
       WHERE a.docente_id = :docenteId
       ORDER BY g.codigo ASC
      `,
      { replacements, type: QueryTypes.SELECT },
    );

    const sesiones = await sequelize.query(
      `
      SELECT s.id,
             s.hora_inicio,
             s.hora_fin,
             s.activa,
             u.uid AS estudiante_uid,
             u.nombre_completo AS estudiante,
             array_agg(DISTINCT g.codigo) AS grupos,
             e.hostname,
             e.ip_address,
             l.nombre AS laboratorio
        FROM sesion_activa s
        JOIN usuario u ON u.id = s.usuario_id
        JOIN equipo e ON e.id = s.equipo_id
        JOIN laboratorio l ON l.id = e.laboratorio_id
        JOIN membresia_grupo m
          ON m.usuario_id = u.id
         AND m.activa = TRUE
        JOIN grupo g
          ON g.id = m.grupo_id
        JOIN asignacion_docente a
          ON a.grupo_id = m.grupo_id
         AND a.docente_id = :docenteId
       WHERE s.activa = TRUE
       GROUP BY s.id, u.uid, u.nombre_completo, e.hostname, e.ip_address, l.nombre
       ORDER BY s.hora_inicio DESC
      `,
      { replacements, type: QueryTypes.SELECT },
    );

    return res.json({ data: { grupos, sesiones } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { overview };
