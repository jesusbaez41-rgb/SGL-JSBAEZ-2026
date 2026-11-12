const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMocker } = require('./helpers/mock');

const APPS_SERVICE = path.join(__dirname, '../src/modules/apps/apps.service.js');
const appsChecksum = require('../src/modules/apps/apps.checksum');
const appsStorage = require('../src/modules/apps/apps.storage');
const {
  validateCreateApp,
  validateUpdateApp,
  validateLink,
} = require('../src/modules/apps/apps.validators');

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LAB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LAB_ID_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LINK_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const CHECKSUM = 'a'.repeat(64);
const CHECKSUM_2 = 'b'.repeat(64);

function request() {
  return {
    user: { id: USER_ID, uid: 'atecnico', rol: 'ADMIN_TECNICO' },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    originalUrl: '/api/apps',
  };
}

function makeApp(overrides = {}) {
  return {
    id: APP_ID,
    nombre: 'Firefox',
    ruta_instalador: '/opt/sgl-instaladores/Firefox-128.0.exe',
    parametros_silenciosos: '/S /quiet',
    version: '128.0',
    checksum: CHECKSUM,
    created_at: new Date('2026-11-11T10:00:00.000Z'),
    updateCalls: [],
    destroyCalls: 0,
    async update(changes) {
      this.updateCalls.push(changes);
      Object.assign(this, changes);
      return this;
    },
    async destroy() {
      this.destroyCalls += 1;
      return true;
    },
    toJSON() {
      return {
        id: this.id,
        nombre: this.nombre,
        ruta_instalador: this.ruta_instalador,
        parametros_silenciosos: this.parametros_silenciosos,
        version: this.version,
        checksum: this.checksum,
        created_at: this.created_at,
      };
    },
    ...overrides,
  };
}

function makeLink(data = {}) {
  return {
    id: data.id || LINK_ID,
    app_id: data.app_id || APP_ID,
    laboratorio_id: data.laboratorio_id || LAB_ID,
    activo: data.activo !== undefined ? data.activo : true,
    version: data.version || '128.0',
    app_nombre: data.app_nombre || 'Firefox',
    fecha_vinculacion: data.fecha_vinculacion || new Date('2026-11-11T11:00:00.000Z'),
    laboratorio: data.laboratorio || null,
    updateCalls: [],
    async update(changes) {
      this.updateCalls.push(changes);
      Object.assign(this, changes);
      return this;
    },
    toJSON() {
      return {
        id: this.id,
        app_id: this.app_id,
        laboratorio_id: this.laboratorio_id,
        activo: this.activo,
        version: this.version,
        app_nombre: this.app_nombre,
        fecha_vinculacion: this.fecha_vinculacion,
        laboratorio: this.laboratorio,
      };
    },
  };
}

function makeLab(overrides = {}) {
  return {
    id: LAB_ID,
    nombre: 'Lab Redes',
    ubicacion: 'Piso 1',
    subred: '192.168.10.0/24',
    ...overrides,
  };
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, '');
}

function setup(options = {}) {
  const mocker = createMocker(APPS_SERVICE);
  const audit = [];
  const apps = options.apps ? [...options.apps] : [];
  const links = options.links || [];
  const labs = options.labs ? [...options.labs] : [makeLab(), makeLab({ id: LAB_ID_2, nombre: 'Lab Software' })];
  const createdApps = [];
  const createdLinks = [];
  const verifyCalls = [];
  let nextLinkId = 1;

  const Aplicacion = {
    findAll: async () => apps,
    findOne: async ({ where }) =>
      apps.find(
        (app) => app.nombre === where.nombre && app.version === where.version,
      ) || null,
    findByPk: async (id) => apps.find((app) => app.id === id) || null,
    count: async ({ where = {} } = {}) => {
      const vivos = apps.filter((app) => app.destroyCalls === 0);
      if (where.ruta_instalador) {
        return vivos.filter((app) => app.ruta_instalador === where.ruta_instalador).length;
      }
      if (where.app_id) return vivos.filter((app) => app.id === where.app_id).length;
      return vivos.length;
    },
    create: async (data) => {
      if (options.createError) throw options.createError;
      const app = makeApp({ id: options.newAppId || APP_ID_2, ...data });
      apps.push(app);
      createdApps.push(data);
      return app;
    },
  };

  function matchLink(link, where) {
    return (
      (!where.app_id || link.app_id === where.app_id) &&
      (!where.laboratorio_id || link.laboratorio_id === where.laboratorio_id) &&
      (where.activo === undefined || link.activo === where.activo)
    );
  }

  const VinculoAppLab = {
    count: async ({ where }) => links.filter((link) => matchLink(link, where)).length,
    findAll: async ({ where = {}, include } = {}) => {
      const rows = links.filter((link) => matchLink(link, where));
      if (include) {
        for (const row of rows) {
          row.laboratorio = labs.find((lab) => lab.id === row.laboratorio_id) || null;
        }
      }
      return rows;
    },
    findOne: async ({ where }) => links.find((link) => matchLink(link, where)) || null,
    create: async (data) => {
      if (options.linkCreateError) throw options.linkCreateError;
      const link = makeLink({
        ...data,
        id: options.newLinkId || `link-${nextLinkId++}`,
      });
      links.push(link);
      createdLinks.push(data);
      return link;
    },
  };

  const Laboratorio = {
    findByPk: async (id) => labs.find((lab) => lab.id === id) || null,
  };

  const mockChecksum = {
    normalizeChecksum: normalize,
    sha256File: async (filePath) => {
      const buffer = await fs.promises.readFile(filePath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    },
    verifyInstallerChecksum: async (payload) => {
      verifyCalls.push(payload);
      if (options.verifyError) throw options.verifyError;
      return {
        checksum: normalize(payload.checksum),
        ruta: `/opt/sgl-instaladores/${path.basename(payload.ruta || 'app.exe')}`,
        tamano: 2048,
      };
    },
  };

  mocker.mock('../../models', { Aplicacion, VinculoAppLab, Laboratorio });
  mocker.mock('../audit/audit.service', {
    recordAuditEvent: async (req, event) => audit.push(event),
  });
  mocker.mock('./apps.checksum', mockChecksum);

  const service = mocker.load();

  return {
    service,
    audit,
    apps,
    links,
    labs,
    createdApps,
    createdLinks,
    verifyCalls,
    restore: () => mocker.restore(),
  };
}

async function expectError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

test('HU07-01 valida campos obligatorios, version, ruta y parametros', () => {
  assert.ok(validateCreateApp({}).some((message) => message.includes('obligatorio')));
  assert.ok(
    validateCreateApp({
      nombre: 'Firefox',
      ruta_instalador: '/opt/Firefox.exe',
      version: '1.0',
      checksum: CHECKSUM,
      parametros_silenciosos: 'x'.repeat(2001),
    }).some((message) => message.includes('2000')),
  );
  assert.ok(
    validateCreateApp({
      nombre: 'Firefox',
      ruta_instalador: '/opt/Firefox.exe',
      version: '###',
      checksum: CHECKSUM,
    }).some((message) => message.includes('versión')),
  );
  assert.ok(
    validateCreateApp({
      nombre: 'Firefox',
      ruta_instalador: '/'.repeat(600),
      version: '1.0',
      checksum: CHECKSUM,
    }).some((message) => message.includes('512')),
  );
  assert.deepEqual(
    validateCreateApp({
      nombre: 'Firefox',
      ruta_instalador: '/opt/Firefox.exe',
      version: '128.0',
      checksum: CHECKSUM,
    }),
    [],
  );

  // Las reglas de checksum y de rutas remotas viven en apps.checksum.js para
  // devolver los codigos de error especificos del contrato (HU07-04).
  assert.ok(
    !validateCreateApp({
      nombre: 'X',
      ruta_instalador: 'https://evil.example/app.exe',
      version: '1.0',
      checksum: 'abc',
    }).some((message) => message.includes('URLs remotas')),
  );

  assert.ok(validateUpdateApp({}).some((message) => message.includes('al menos un campo')));
  assert.ok(validateUpdateApp({ checksum: '   ' }).some((message) => message.includes('vacío')));
  assert.ok(validateLink({}).some((message) => message.includes('laboratorio')));
  assert.deepEqual(validateLink({ laboratorio_id: LAB_ID }), []);
});

test('HU07-02 calcula y valida el SHA-256 real de un instalador (CA-01)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-apps-'));
  const file = path.join(dir, 'installer.bin');
  const content = Buffer.from('SGL installer payload v1');
  fs.writeFileSync(file, content);
  const expected = crypto.createHash('sha256').update(content).digest('hex');

  try {
    const result = await appsChecksum.verifyInstallerChecksum({
      ruta: file,
      checksum: `SHA256:${expected.toUpperCase()}`,
    });
    assert.equal(result.checksum, expected);
    assert.equal(result.tamano, content.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HU07-03 rechaza un checksum que no coincide con el archivo (CA-01)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-apps-'));
  const file = path.join(dir, 'installer.bin');
  fs.writeFileSync(file, 'contenido real');

  try {
    await assert.rejects(
      appsChecksum.verifyInstallerChecksum({ ruta: file, checksum: CHECKSUM }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'CHECKSUM_INVALIDO');
        assert.equal(err.esperado, CHECKSUM);
        assert.match(err.calculado, /^[a-f0-9]{64}$/);
        return true;
      },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HU07-04 rechaza instalador inexistente, ruta remota y formato inválido', async () => {
  await expectError(
    appsChecksum.verifyInstallerChecksum({
      ruta: path.join(os.tmpdir(), 'no-existe-sgl.exe'),
      checksum: CHECKSUM,
    }),
    400,
    'INSTALADOR_NO_ENCONTRADO',
  );

  await expectError(
    appsChecksum.verifyInstallerChecksum({
      ruta: 'https://example.com/app.exe',
      checksum: CHECKSUM,
    }),
    400,
    'INSTALADOR_NO_ACCESIBLE',
  );

  await expectError(
    appsChecksum.verifyInstallerChecksum({ ruta: '/tmp/app.exe', checksum: '123' }),
    400,
    'CHECKSUM_FORMATO_INVALIDO',
  );
});

test('HU07-05 crea una aplicación verificando el checksum y audita (CA-01/RN-010)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.restore());

  const result = await ctx.service.create(request(), {
    nombre: '  Firefox  ',
    ruta_instalador: '  /opt/sgl-instaladores/Firefox-128.0.exe ',
    parametros_silenciosos: ' /S /quiet ',
    version: ' 128.0 ',
    checksum: `SHA256:${CHECKSUM.toUpperCase()}`,
  });

  assert.equal(ctx.verifyCalls.length, 1);
  assert.equal(ctx.verifyCalls[0].ruta, '/opt/sgl-instaladores/Firefox-128.0.exe');
  assert.equal(ctx.verifyCalls[0].checksum, CHECKSUM);
  assert.equal(ctx.createdApps.length, 1);
  assert.equal(ctx.createdApps[0].nombre, 'Firefox');
  assert.equal(ctx.createdApps[0].checksum, CHECKSUM);
  assert.equal(result.nombre, 'Firefox');
  assert.equal(result.version, '128.0');
  assert.equal(result.vinculos_activos, 0);
  assert.equal(ctx.audit[0].accion, 'CREAR');
  assert.equal(ctx.audit[0].entidad, 'aplicacion');
  assert.equal(ctx.audit[0].detalle.checksum, CHECKSUM);
});

test('HU07-06 rechaza nombre y versión duplicados', async (t) => {
  const ctx = setup({ apps: [makeApp()] });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.create(request(), {
      nombre: 'Firefox',
      ruta_instalador: '/opt/sgl-instaladores/Firefox-128.0.exe',
      version: '128.0',
      checksum: CHECKSUM_2,
    }),
    409,
    'APP_DUPLICADA',
  );
  assert.equal(ctx.createdApps.length, 0);
});

test('HU07-07 no persiste si la verificación de integridad falla (CA-01)', async (t) => {
  const error = Object.assign(new Error('checksum no coincide'), {
    status: 400,
    code: 'CHECKSUM_INVALIDO',
  });
  const ctx = setup({ verifyError: error });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.create(request(), {
      nombre: 'Firefox',
      ruta_instalador: '/opt/sgl-instaladores/Firefox-128.0.exe',
      version: '128.0',
      checksum: CHECKSUM,
    }),
    400,
    'CHECKSUM_INVALIDO',
  );
  assert.equal(ctx.createdApps.length, 0);
  assert.equal(ctx.apps.length, 0);
});

test('HU07-08 lista el catálogo con vínculos activos y búsqueda', async (t) => {
  const firefox = makeApp();
  const vlc = makeApp({
    id: APP_ID_2,
    nombre: 'VLC',
    version: '3.0.21',
    ruta_instalador: '/opt/sgl-instaladores/vlc.exe',
    checksum: CHECKSUM_2,
  });
  const ctx = setup({
    apps: [firefox, vlc],
    links: [
      makeLink({ app_id: firefox.id, laboratorio_id: LAB_ID }),
      makeLink({ id: 'link-2', app_id: firefox.id, laboratorio_id: LAB_ID_2 }),
      makeLink({ id: 'link-3', app_id: firefox.id, laboratorio_id: LAB_ID, activo: false }),
    ],
  });
  t.after(() => ctx.restore());

  const all = await ctx.service.list({});
  assert.equal(all.length, 2);
  const firefoxRow = all.find((app) => app.id === firefox.id);
  assert.equal(firefoxRow.vinculos_activos, 2);
  assert.deepEqual(firefoxRow.laboratorios.sort(), [LAB_ID, LAB_ID_2].sort());

  const filtered = await ctx.service.list({ search: 'vlc' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].nombre, 'VLC');
});

test('HU07-09 filtra aplicaciones por laboratorio vinculado (RN-002)', async (t) => {
  const firefox = makeApp();
  const vlc = makeApp({
    id: APP_ID_2,
    nombre: 'VLC',
    version: '3.0.21',
    checksum: CHECKSUM_2,
  });
  const ctx = setup({
    apps: [firefox, vlc],
    links: [makeLink({ app_id: firefox.id, laboratorio_id: LAB_ID })],
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.list({ laboratorioId: LAB_ID });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, firefox.id);
  assert.equal(result[0].vinculos_activos, 1);
});

test('HU07-10 devuelve el detalle con sus vínculos y laboratorios', async (t) => {
  const app = makeApp();
  const ctx = setup({
    apps: [app],
    links: [makeLink({ app_id: app.id, laboratorio_id: LAB_ID })],
  });
  t.after(() => ctx.restore());

  const detail = await ctx.service.get(app.id);
  assert.equal(detail.nombre, 'Firefox');
  assert.equal(detail.checksum, CHECKSUM);
  assert.equal(detail.vinculos.length, 1);
  assert.equal(detail.vinculos[0].activo, true);
  assert.equal(detail.vinculos[0].laboratorio.nombre, 'Lab Redes');
  assert.equal(detail.vinculos_activos, 1);
});

test('HU07-11 actualiza metadatos sin re-verificar si no cambia ruta ni checksum', async (t) => {
  const app = makeApp();
  const ctx = setup({ apps: [app] });
  t.after(() => ctx.restore());

  const updated = await ctx.service.update(request(), app.id, {
    parametros_silenciosos: '/S',
  });

  assert.equal(ctx.verifyCalls.length, 0);
  assert.equal(app.updateCalls.length, 1);
  assert.equal(updated.parametros_silenciosos, '/S');
  assert.equal(ctx.audit[0].accion, 'ACTUALIZAR');
  assert.deepEqual(ctx.audit[0].detalle.campos, ['parametros_silenciosos']);
});

test('HU07-12 re-verifica el checksum al cambiar la ruta (CA-01)', async (t) => {
  const app = makeApp();
  const ctx = setup({ apps: [app] });
  t.after(() => ctx.restore());

  const updated = await ctx.service.update(request(), app.id, {
    ruta_instalador: '/opt/sgl-instaladores/Firefox-128.0.1.exe',
  });

  assert.equal(ctx.verifyCalls.length, 1);
  assert.equal(
    ctx.verifyCalls[0].ruta,
    '/opt/sgl-instaladores/Firefox-128.0.1.exe',
  );
  assert.equal(updated.ruta_instalador, '/opt/sgl-instaladores/Firefox-128.0.1.exe');
});

test('HU07-13 bloquea cambiar nombre o versión con vínculos activos (RN-007)', async (t) => {
  const app = makeApp();
  const ctx = setup({
    apps: [app],
    links: [makeLink({ app_id: app.id, laboratorio_id: LAB_ID })],
  });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.update(request(), app.id, { version: '129.0' }),
    409,
    'APP_VINCULADA',
  );
  assert.equal(app.updateCalls.length, 0);
});

test('HU07-14 elimina una aplicación sin vínculos activos y audita', async (t) => {
  const app = makeApp();
  const ctx = setup({
    apps: [app],
    links: [makeLink({ app_id: app.id, laboratorio_id: LAB_ID, activo: false })],
  });
  t.after(() => ctx.restore());

  const result = await ctx.service.remove(request(), app.id);
  assert.equal(result.deleted, true);
  assert.equal(app.destroyCalls, 1);
  assert.equal(ctx.audit[0].accion, 'ELIMINAR');
  assert.equal(ctx.audit[0].entidad, 'aplicacion');
});

test('HU07-15 rechaza eliminar una aplicación vinculada', async (t) => {
  const app = makeApp();
  const ctx = setup({
    apps: [app],
    links: [makeLink({ app_id: app.id, laboratorio_id: LAB_ID })],
  });
  t.after(() => ctx.restore());

  await expectError(ctx.service.remove(request(), app.id), 409, 'APP_VINCULADA');
  assert.equal(app.destroyCalls, 0);
});

test('HU07-16 vincula una app al laboratorio y audita (CA-02/RN-010)', async (t) => {
  const app = makeApp();
  const ctx = setup({ apps: [app] });
  t.after(() => ctx.restore());

  const result = await ctx.service.link(request(), app.id, { laboratorio_id: LAB_ID });

  assert.equal(result.created, true);
  assert.equal(ctx.createdLinks.length, 1);
  assert.equal(ctx.createdLinks[0].app_id, app.id);
  assert.equal(ctx.createdLinks[0].laboratorio_id, LAB_ID);
  assert.equal(ctx.createdLinks[0].activo, true);
  assert.equal(ctx.createdLinks[0].app_nombre, 'Firefox');
  assert.equal(ctx.createdLinks[0].version, '128.0');
  assert.equal(ctx.audit[0].accion, 'CREAR');
  assert.equal(ctx.audit[0].entidad, 'vinculo_app_lab');
});

test('HU07-17 el vínculo es idempotente para la misma app y laboratorio', async (t) => {
  const app = makeApp();
  const existing = makeLink({ app_id: app.id, laboratorio_id: LAB_ID });
  const ctx = setup({ apps: [app], links: [existing] });
  t.after(() => ctx.restore());

  const result = await ctx.service.link(request(), app.id, { laboratorio_id: LAB_ID });

  assert.equal(result.created, false);
  assert.equal(ctx.createdLinks.length, 0);
  assert.equal(ctx.audit.length, 0);
});

test('HU07-18 rechaza dos versiones de la misma app en un laboratorio (CA-03/RN-007)', async (t) => {
  const firefox128 = makeApp({
    id: APP_ID,
    nombre: 'Firefox',
    version: '128.0',
  });
  const firefox129 = makeApp({
    id: APP_ID_2,
    nombre: 'Firefox',
    version: '129.0',
    checksum: CHECKSUM_2,
  });
  const ctx = setup({
    apps: [firefox128, firefox129],
    links: [
      makeLink({
        app_id: firefox128.id,
        laboratorio_id: LAB_ID,
        app_nombre: 'Firefox',
        version: '128.0',
      }),
    ],
  });
  t.after(() => ctx.restore());

  await expectError(
    ctx.service.link(request(), firefox129.id, { laboratorio_id: LAB_ID }),
    409,
    'VERSION_CONFLICTO',
  );
  assert.equal(ctx.createdLinks.length, 0);

  // Otra app distinta sí puede convivir en el mismo laboratorio.
  const vlc = makeApp({
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    nombre: 'VLC',
    version: '3.0.21',
    checksum: CHECKSUM_2,
  });
  ctx.apps.push(vlc);
  const ok = await ctx.service.link(request(), vlc.id, { laboratorio_id: LAB_ID });
  assert.equal(ok.created, true);
});

test('HU07-19 desvincula conservando el historial (RN-007)', async (t) => {
  const app = makeApp();
  const link = makeLink({ app_id: app.id, laboratorio_id: LAB_ID });
  const ctx = setup({ apps: [app], links: [link] });
  t.after(() => ctx.restore());

  const result = await ctx.service.unlink(request(), app.id, LAB_ID);

  assert.equal(result.removed, true);
  assert.equal(link.activo, false);
  assert.equal(link.updateCalls.length, 1);
  assert.equal(link.updateCalls[0].activo, false);
  assert.equal(ctx.links.length, 1, 'la fila histórica se conserva');
  assert.equal(ctx.audit[0].accion, 'ELIMINAR');
  assert.equal(ctx.audit[0].detalle.historial_conservado, true);
});

test('HU07-20 assertAppLinked exige vínculo activo antes de desplegar (CA-02/RN-002)', async (t) => {
  const app = makeApp();
  const ctx = setup({
    apps: [app],
    links: [makeLink({ app_id: app.id, laboratorio_id: LAB_ID })],
  });
  t.after(() => ctx.restore());

  const link = await ctx.service.assertAppLinked(LAB_ID, app.id);
  assert.equal(link.app_id, app.id);

  await expectError(ctx.service.assertAppLinked(LAB_ID_2, app.id), 409, 'APP_NO_VINCULADA');
});

test('HU07-21 verifica el checksum de una app registrada y audita', async (t) => {
  const app = makeApp();
  const ctx = setup({ apps: [app] });
  t.after(() => ctx.restore());

  const result = await ctx.service.verifyChecksum(request(), app.id);

  assert.equal(result.valido, true);
  assert.equal(result.checksum, CHECKSUM);
  assert.equal(result.tamano, 2048);
  assert.equal(ctx.verifyCalls.length, 1);
  assert.equal(ctx.audit[0].accion, 'EJECUTAR');
  assert.equal(ctx.audit[0].detalle.operacion, 'VERIFICAR_CHECKSUM');
});

test('HU07-22 valida la extension del instalador y genera un nombre legible', () => {
  assert.deepEqual(appsStorage.ALLOWED_EXTENSIONS, [
    '.msi',
    '.exe',
    '.msix',
    '.appx',
    '.zip',
  ]);
  assert.equal(appsStorage.isAllowedExtension('Firefox-128.0.msi'), true);
  assert.equal(appsStorage.isAllowedExtension('Firefox-128.0.EXE'), true);
  assert.equal(appsStorage.isAllowedExtension('leeme.txt'), false);
  assert.equal(appsStorage.isAllowedExtension('script.sh'), false);
  assert.equal(appsStorage.isAllowedExtension(''), false);

  assert.equal(appsStorage.slugify('  Ambar Reader  '), 'ambar-reader');
  assert.equal(
    appsStorage.buildInstallerFileName('Acrobat Reader DC', '2024.0', '.exe'),
    'acrobat-reader-dc-2024.0.exe',
  );
});

test('HU07-23 sube el instalador, calcula el SHA-256 y da de alta la app (CA-01)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-installers-'));
  const previous = process.env.APPS_INSTALLERS_DIR;
  process.env.APPS_INSTALLERS_DIR = dir;
  const ctx = setup();
  t.after(() => {
    ctx.restore();
    if (previous === undefined) delete process.env.APPS_INSTALLERS_DIR;
    else process.env.APPS_INSTALLERS_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const contenido = 'contenido del instalador';
  const tmpFile = path.join(dir, 'subida-temporal.msi');
  fs.writeFileSync(tmpFile, contenido);

  const result = await ctx.service.createFromUpload(request(), {
    nombre: 'Firefox',
    version: '128.0',
    parametros_silenciosos: '/quiet',
    archivo: { originalname: 'Firefox Setup.msi', path: tmpFile, size: contenido.length },
  });

  assert.equal(ctx.createdApps.length, 1);
  const created = ctx.createdApps[0];
  assert.equal(
    created.checksum,
    crypto.createHash('sha256').update(contenido).digest('hex'),
  );
  assert.equal(created.origen, 'upload');
  assert.equal(created.ruta_instalador, path.join(dir, 'firefox-128.0.msi'));
  assert.equal(created.parametros_silenciosos, '/quiet');
  assert.equal(fs.existsSync(created.ruta_instalador), true);
  assert.equal(result.instalador.nombre_archivo, 'firefox-128.0.msi');
  assert.equal(result.instalador.tamano, contenido.length);
  assert.equal(ctx.audit.length, 1);
  assert.equal(ctx.audit[0].accion, 'CREAR');
  assert.equal(ctx.audit[0].entidad, 'aplicacion');
  assert.equal(ctx.audit[0].detalle.origen, 'upload');
});

test('HU07-24 rechaza un instalador con extension no permitida', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-installers-'));
  const previous = process.env.APPS_INSTALLERS_DIR;
  process.env.APPS_INSTALLERS_DIR = dir;
  const ctx = setup();
  t.after(() => {
    ctx.restore();
    if (previous === undefined) delete process.env.APPS_INSTALLERS_DIR;
    else process.env.APPS_INSTALLERS_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const tmpFile = path.join(dir, 'notas.txt');
  fs.writeFileSync(tmpFile, 'no es un instalador');

  await expectError(
    ctx.service.createFromUpload(request(), {
      nombre: 'Firefox',
      version: '128.0',
      archivo: { originalname: 'notas.txt', path: tmpFile, size: 18 },
    }),
    400,
    'INSTALADOR_EXTENSION_INVALIDA',
  );
  assert.equal(ctx.createdApps.length, 0);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('HU07-25 si el alta falla, el instalador subido no queda en el servidor', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-installers-'));
  const previous = process.env.APPS_INSTALLERS_DIR;
  process.env.APPS_INSTALLERS_DIR = dir;
  const ctx = setup({ createError: new Error('fallo de base de datos') });
  t.after(() => {
    ctx.restore();
    if (previous === undefined) delete process.env.APPS_INSTALLERS_DIR;
    else process.env.APPS_INSTALLERS_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const tmpFile = path.join(dir, 'subida-temporal.exe');
  fs.writeFileSync(tmpFile, 'instalador');

  await expectError(
    ctx.service.createFromUpload(request(), {
      nombre: 'Firefox',
      version: '128.0',
      archivo: { originalname: 'Firefox.exe', path: tmpFile, size: 10 },
    }),
    500,
    'DB_ERROR',
  );
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('HU07-26 eliminar una app subida elimina tambien el instalador', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-installers-'));
  const previous = process.env.APPS_INSTALLERS_DIR;
  process.env.APPS_INSTALLERS_DIR = dir;
  const installer = path.join(dir, 'firefox-128.0.msi');
  fs.writeFileSync(installer, 'instalador almacenado');

  const app = makeApp({ origen: 'upload', ruta_instalador: installer });
  const ctx = setup({ apps: [app] });
  t.after(() => {
    ctx.restore();
    if (previous === undefined) delete process.env.APPS_INSTALLERS_DIR;
    else process.env.APPS_INSTALLERS_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const result = await ctx.service.remove(request(), app.id);
  assert.equal(result.deleted, true);
  assert.equal(result.instalador_eliminado, true);
  assert.equal(fs.existsSync(installer), false);
  assert.equal(ctx.audit[0].detalle.instalador_eliminado, true);
});

test('HU07-27 no se borra el instalador si otra app lo referencia', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-installers-'));
  const previous = process.env.APPS_INSTALLERS_DIR;
  process.env.APPS_INSTALLERS_DIR = dir;
  const installer = path.join(dir, 'compartido.exe');
  fs.writeFileSync(installer, 'instalador compartido');

  const app = makeApp({ origen: 'upload', ruta_instalador: installer });
  const otra = makeApp({ id: APP_ID_2, origen: 'ruta', ruta_instalador: installer });
  const ctx = setup({ apps: [app, otra] });
  t.after(() => {
    ctx.restore();
    if (previous === undefined) delete process.env.APPS_INSTALLERS_DIR;
    else process.env.APPS_INSTALLERS_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const result = await ctx.service.remove(request(), app.id);
  assert.equal(result.instalador_eliminado, false);
  assert.equal(fs.existsSync(installer), true);
});

test('HU07-28 reemplaza el instalador de una app y recalcula el hash', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgl-installers-'));
  const previous = process.env.APPS_INSTALLERS_DIR;
  process.env.APPS_INSTALLERS_DIR = dir;
  const anterior = path.join(dir, 'firefox-128.0.msi');
  fs.writeFileSync(anterior, 'instalador viejo');

  const app = makeApp({ origen: 'upload', ruta_instalador: anterior });
  const ctx = setup({ apps: [app] });
  t.after(() => {
    ctx.restore();
    if (previous === undefined) delete process.env.APPS_INSTALLERS_DIR;
    else process.env.APPS_INSTALLERS_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const tmpFile = path.join(dir, 'nuevo-temporal.msi');
  const contenido = 'instalador nuevo';
  fs.writeFileSync(tmpFile, contenido);

  const result = await ctx.service.replaceInstaller(request(), app.id, {
    originalname: 'Firefox.msi',
    path: tmpFile,
    size: contenido.length,
  });

  const esperado = crypto.createHash('sha256').update(contenido).digest('hex');
  assert.equal(result.app.checksum, esperado);
  assert.equal(result.app.ruta_instalador, path.join(dir, 'firefox-128.0-2.msi'));
  assert.equal(result.instalador.checksum, esperado);
  assert.equal(fs.existsSync(result.app.ruta_instalador), true);
  assert.equal(fs.existsSync(anterior), false, 'el instalador anterior se elimina');
  assert.equal(ctx.audit[0].accion, 'ACTUALIZAR');
  assert.equal(ctx.audit[0].detalle.operacion, 'REEMPLAZAR_INSTALADOR');
});
