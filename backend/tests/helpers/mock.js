const path = require('path');
const { createRequire } = require('module');

const SRC_ROOT = path.resolve(__dirname, '../../src') + path.sep;

/**
 * Permite sustituir módulos en require.cache antes de cargar el módulo bajo
 * prueba. Se usa para aislar Samba AD, PostgreSQL, auditoría, etc.
 *
 * `restore()` purga además todos los módulos de `backend/src` para que cada
 * escenario arranque con estado limpio (sin referencias a mocks anteriores).
 */
function createMocker(modulePath) {
  const absolute = require.resolve(modulePath);
  const localRequire = createRequire(absolute);

  function mock(request, fake) {
    const resolved = localRequire.resolve(request);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: fake,
    };
    return fake;
  }

  function load() {
    delete require.cache[absolute];
    return localRequire(absolute);
  }

  function restore() {
    for (const resolved of Object.keys(require.cache)) {
      if (resolved.startsWith(SRC_ROOT) || resolved === absolute) {
        delete require.cache[resolved];
      }
    }
  }

  return { mock, load, restore, absolute, localRequire };
}

module.exports = { createMocker };
