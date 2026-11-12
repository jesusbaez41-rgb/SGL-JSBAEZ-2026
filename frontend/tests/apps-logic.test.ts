import { describe, expect, it } from 'vitest'
import {
  ALLOWED_INSTALLER_EXTENSIONS,
  appSummary,
  canLinkToLab,
  countActiveLinks,
  formatFileSize,
  installerExtension,
  installerTargetName,
  isAllowedInstallerFile,
  isValidChecksum,
  isValidInstallerPath,
  isValidVersion,
  linkedToLab,
  matchesAppSearch,
  normalizeChecksum,
  shortChecksum,
  sortAppsByName,
  validateAppForm,
  validateInstallerFile,
  validateUploadForm,
  versionConflict,
} from '../src/utils/appsLogic'
import type { AppLink, AppRow } from '../src/api/apps.api'

const CHECKSUM = 'a'.repeat(64)

function makeApp(overrides: Partial<AppRow> = {}): AppRow {
  return {
    id: 'a1',
    nombre: 'Firefox',
    ruta_instalador: '/opt/sgl-instaladores/Firefox-128.0.exe',
    parametros_silenciosos: '/S /quiet',
    version: '128.0',
    checksum: CHECKSUM,
    origen: 'ruta',
    comando_desinstalacion: null,
    created_at: null,
    vinculos_activos: 1,
    laboratorios: ['lab-1'],
    ...overrides,
  }
}

function makeLink(overrides: Partial<AppLink> = {}): AppLink {
  return {
    id: 'l1',
    app_id: 'a1',
    laboratorio_id: 'lab-1',
    version: '128.0',
    app_nombre: 'Firefox',
    activo: true,
    fecha_vinculacion: null,
    ...overrides,
  }
}

describe('HU07 checksum', () => {
  it('normaliza prefijo sha256, mayúsculas y espacios', () => {
    expect(normalizeChecksum(`  SHA256:${'A'.repeat(64)}  `)).toBe('a'.repeat(64))
  })

  it('acepta un SHA-256 hexadecimal de 64 caracteres', () => {
    expect(isValidChecksum(CHECKSUM)).toBe(true)
    expect(isValidChecksum(`sha256:${CHECKSUM.toUpperCase()}`)).toBe(true)
  })

  it('rechaza hashes incompletos o no hexadecimales', () => {
    expect(isValidChecksum('abc')).toBe(false)
    expect(isValidChecksum('z'.repeat(64))).toBe(false)
    expect(isValidChecksum('')).toBe(false)
  })

  it('abrevia el checksum para la tabla', () => {
    expect(shortChecksum(CHECKSUM)).toBe(`${'a'.repeat(12)}…`)
    expect(shortChecksum('')).toBe('—')
  })
})

describe('HU07 versión y ruta del instalador', () => {
  it('valida la versión', () => {
    expect(isValidVersion('128.0')).toBe(true)
    expect(isValidVersion('3.0.21-beta')).toBe(true)
    expect(isValidVersion('###')).toBe(false)
    expect(isValidVersion('')).toBe(false)
  })

  it('acepta rutas locales o relativas y rechaza remotos', () => {
    expect(isValidInstallerPath('/opt/sgl-instaladores/app.exe')).toBe(true)
    expect(isValidInstallerPath('Firefox/app.exe')).toBe(true)
    expect(isValidInstallerPath('https://example.com/app.exe')).toBe(false)
    expect(isValidInstallerPath('')).toBe(false)
  })
})

describe('HU07 validación del formulario', () => {
  it('marca todos los campos obligatorios cuando el formulario está vacío', () => {
    const errors = validateAppForm({
      nombre: '',
      version: '',
      ruta_instalador: '',
      checksum: '',
    })
    expect(Object.keys(errors).sort()).toEqual([
      'checksum',
      'nombre',
      'ruta_instalador',
      'version',
    ])
  })

  it('rechaza checksum inválido y URL remota', () => {
    const errors = validateAppForm({
      nombre: 'Firefox',
      version: '128.0',
      ruta_instalador: 'https://example.com/app.exe',
      checksum: '123',
    })
    expect(errors.ruta_instalador).toContain('ruta local')
    expect(errors.checksum).toContain('64 caracteres')
  })

  it('acepta un formulario válido', () => {
    expect(
      validateAppForm({
        nombre: 'Firefox',
        version: '128.0',
        ruta_instalador: '/opt/sgl-instaladores/Firefox-128.0.exe',
        checksum: CHECKSUM,
        parametros_silenciosos: '/S',
      }),
    ).toEqual({})
  })
})

describe('HU07 vínculos con laboratorios (RN-002/RN-007)', () => {
  it('detecta otra versión activa de la misma app', () => {
    const app = makeApp({ id: 'a2', version: '129.0' })
    const conflict = versionConflict(app, [
      makeLink({ app_id: 'a1', version: '128.0', app_nombre: 'Firefox' }),
    ])
    expect(conflict?.app_id).toBe('a1')
  })

  it('no reporta conflicto para la misma app ni para apps distintas', () => {
    const app = makeApp({ id: 'a1' })
    expect(versionConflict(app, [makeLink({ app_id: 'a1' })])).toBeNull()
    expect(
      versionConflict(app, [makeLink({ app_id: 'a2', app_nombre: 'VLC' })]),
    ).toBeNull()
  })

  it('ignora vínculos históricos inactivos', () => {
    const app = makeApp({ id: 'a2', version: '129.0' })
    expect(
      versionConflict(app, [
        makeLink({ app_id: 'a1', version: '128.0', activo: false }),
      ]),
    ).toBeNull()
  })

  it('detecta el vínculo activo del laboratorio', () => {
    const app = makeApp()
    const link = makeLink()
    expect(linkedToLab(app, 'lab-1', [link])?.id).toBe(link.id)
    expect(linkedToLab(app, 'lab-2', [link])).toBeNull()
    expect(canLinkToLab(app, 'lab-1', [link])).toBe(false)
    expect(canLinkToLab(app, 'lab-2', [link])).toBe(true)
  })

  it('cuenta solo vínculos activos', () => {
    expect(
      countActiveLinks([
        makeLink(),
        makeLink({ id: 'l2', activo: false }),
        makeLink({ id: 'l3' }),
      ]),
    ).toBe(2)
  })
})

describe('HU07 catálogo', () => {
  it('resume nombre, versión y cantidad de laboratorios', () => {
    expect(appSummary(makeApp())).toBe('Firefox 128.0 · 1 laboratorio')
    expect(appSummary(makeApp({ vinculos_activos: 2 }))).toBe(
      'Firefox 128.0 · 2 laboratorios',
    )
  })

  it('ordena por nombre y, para igual nombre, por versión descendente', () => {
    const apps = [
      makeApp({ id: 'a3', nombre: 'VLC', version: '3.0.21' }),
      makeApp({ id: 'a2', nombre: 'Firefox', version: '129.0' }),
      makeApp({ id: 'a1', nombre: 'Firefox', version: '128.0' }),
    ]
    expect(sortAppsByName(apps).map((app) => `${app.nombre}-${app.version}`)).toEqual([
      'Firefox-129.0',
      'Firefox-128.0',
      'VLC-3.0.21',
    ])
    expect(apps.map((app) => app.id)).toEqual(['a3', 'a2', 'a1'])
  })

  it('busca por nombre, versión o ruta sin distinguir mayúsculas', () => {
    const app = makeApp()
    expect(matchesAppSearch(app, 'fire')).toBe(true)
    expect(matchesAppSearch(app, '128')).toBe(true)
    expect(matchesAppSearch(app, 'INSTALADORES')).toBe(true)
    expect(matchesAppSearch(app, 'vlc')).toBe(false)
    expect(matchesAppSearch(app, '  ')).toBe(true)
  })
})

describe('HU07 subida de instaladores', () => {
  it('reconoce la extension del archivo', () => {
    expect(installerExtension('Firefox-128.0.MSI')).toBe('.msi')
    expect(installerExtension('setup.exe')).toBe('.exe')
    expect(installerExtension('sin-extension')).toBe('')
  })

  it('acepta solo extensiones de instalador conocidas', () => {
    expect(ALLOWED_INSTALLER_EXTENSIONS).toContain('.msi')
    expect(ALLOWED_INSTALLER_EXTENSIONS).toContain('.exe')
    expect(isAllowedInstallerFile('Firefox-128.0.msi')).toBe(true)
    expect(isAllowedInstallerFile('Firefox-128.0.EXE')).toBe(true)
    expect(isAllowedInstallerFile('notas.txt')).toBe(false)
    expect(isAllowedInstallerFile('script.sh')).toBe(false)
  })

  it('formatea el tamano del archivo', () => {
    expect(formatFileSize(0)).toBe('0 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
  })

  it('rechaza extension invalida, archivo vacio y archivo demasiado grande', () => {
    expect(validateInstallerFile({ name: 'notas.txt', size: 10 }).archivo).toContain(
      'Extensión no permitida',
    )
    expect(validateInstallerFile({ name: 'app.msi', size: 0 }).archivo).toContain('vacío')
    expect(
      validateInstallerFile({ name: 'app.msi', size: 2000 * 1024 * 1024 }).archivo,
    ).toContain('1024 MB')
    expect(validateInstallerFile({ name: 'app.msi', size: 1024 })).toEqual({})
    expect(validateInstallerFile(null)).toEqual({})
  })

  it('valida los metadatos de la subida sin exigir ruta ni checksum', () => {
    const errors = validateUploadForm({
      nombre: '',
      version: '',
      ruta_instalador: '',
      checksum: '',
    })
    expect(Object.keys(errors).sort()).toEqual(['nombre', 'version'])
    expect(
      validateUploadForm({
        nombre: 'Firefox',
        version: '128.0',
        ruta_instalador: '',
        checksum: '',
      }),
    ).toEqual({})
  })

  it('anticipa el nombre final del instalador en el servidor', () => {
    expect(installerTargetName('Acrobat Reader DC', '2024.0', 'Setup.EXE')).toBe(
      'acrobat-reader-dc-2024.0.exe',
    )
    expect(installerTargetName('Firefox', '128.0', 'firefox.msi')).toBe('firefox-128.0.msi')
  })
})
