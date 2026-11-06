/**
 * Resolución de GPO/restricciones por grupo (HU-COM-01, CA-05).
 * Solo aplica las políticas de los grupos a los que pertenece el usuario.
 */
function resolveGpoForGroups(groups, catalog = {}) {
  const restrictions = {};
  const userGroups = Array.isArray(groups) ? groups : [];

  for (const group of userGroups) {
    if (catalog[group]) {
      Object.assign(restrictions, catalog[group]);
    }
  }

  return restrictions;
}

module.exports = { resolveGpoForGroups };
