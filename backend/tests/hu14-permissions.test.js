const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_PERMISSIONS,
  WEB_ROLES,
  getPermissions,
  isWebRole,
  hasPermission,
} = require('../src/config/permissions');

test('PU-12 matriz de permisos por rol (CA-07)', () => {
  const admin = getPermissions('ADMIN_ACADEMICO');
  const tecnico = getPermissions('ADMIN_TECNICO');
  const docente = getPermissions('DOCENTE');

  for (const permission of ['users:read', 'users:manage', 'groups:manage', 'whitelists:manage', 'audit:read']) {
    assert.ok(admin.includes(permission), `Admin Académico debe tener ${permission}`);
  }

  for (const permission of ['labs:manage', 'equipment:manage', 'apps:manage', 'deployments:manage', 'policies:manage']) {
    assert.ok(tecnico.includes(permission), `Admin Técnico debe tener ${permission}`);
  }

  for (const permission of ['monitoring:read', 'groups:read', 'equipment:read', 'users:read']) {
    assert.ok(docente.includes(permission), `Docente debe tener ${permission}`);
  }

  assert.equal(hasPermission('DOCENTE', 'audit:read'), false);
  assert.equal(hasPermission('DOCENTE', 'users:manage'), false);
  assert.equal(hasPermission('ADMIN_TECNICO', 'audit:read'), false);
  assert.equal(hasPermission('ADMIN_ACADEMICO', 'labs:manage'), false);

  assert.deepEqual([...WEB_ROLES].sort(), ['ADMIN_ACADEMICO', 'ADMIN_TECNICO', 'DOCENTE'].sort());
  assert.equal(isWebRole('ESTUDIANTE'), false);
  assert.equal(isWebRole('DOCENTE'), true);
  assert.equal(getPermissions('DESCONOCIDO').length, 0);
  assert.ok(Object.keys(ROLE_PERMISSIONS).length >= 3);
});
