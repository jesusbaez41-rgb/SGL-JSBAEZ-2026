/**
 * Matriz de permisos RBAC — HU-COM-14 (CA-04, CA-06, CA-07).
 *
 * Reglas:
 * - Solo estos roles pueden usar el panel web. ESTUDIANTE se rechaza (CA-04).
 * - Los permisos son la única fuente de verdad; el frontend solo los consume.
 * - RN-017: DOCENTE únicamente consulta información de sus grupos asignados.
 */
const ROLE_PERMISSIONS = Object.freeze({
  ADMIN_ACADEMICO: Object.freeze([
    'dashboard:read',
    'panel:academico',
    'users:read',
    'users:manage',
    'groups:read',
    'groups:manage',
    'whitelists:read',
    'whitelists:manage',
    'audit:read',
  ]),
  ADMIN_TECNICO: Object.freeze([
    'dashboard:read',
    'panel:tecnico',
    // HU-COM-02: el Admin Técnico también administra cuentas.
    'users:read',
    'users:manage',
    // HU-COM-05: el Admin Técnico también administra grupos.
    'groups:read',
    'groups:manage',
    'labs:read',
    'labs:manage',
    'equipment:read',
    'equipment:manage',
    'apps:read',
    'apps:manage',
    'deployments:read',
    'deployments:manage',
    'policies:read',
    'policies:manage',
    // HU-COM-09: el Admin Técnico también administra las listas blancas.
    'whitelists:read',
    'whitelists:manage',
    // HU-COM-12: consulta del registro de auditoria.
    'audit:read',
  ]),
  DOCENTE: Object.freeze([
    'dashboard:read',
    'panel:docencia',
    'monitoring:read',
    'groups:read',
    'equipment:read',
    'users:read',
  ]),
});

const WEB_ROLES = Object.freeze(Object.keys(ROLE_PERMISSIONS));

function getPermissions(rol) {
  return ROLE_PERMISSIONS[rol] ? [...ROLE_PERMISSIONS[rol]] : [];
}

function isWebRole(rol) {
  return WEB_ROLES.includes(rol);
}

function hasPermission(rol, permission) {
  return getPermissions(rol).includes(permission);
}

module.exports = {
  ROLE_PERMISSIONS,
  WEB_ROLES,
  getPermissions,
  isWebRole,
  hasPermission,
};
