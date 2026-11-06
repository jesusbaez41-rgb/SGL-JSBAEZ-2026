import { describe, expect, it, vi } from 'vitest'
import {
  ACCESS_DENIED_ROUTE,
  MENU_SECTIONS,
  attemptLogin,
  buildMenu,
  canAccessRoute,
  homeForRole,
  resolveRouteAccess,
  validateLogin,
} from '../src/utils/authLogic'

describe('PU-01 validación de campos obligatorios en login', () => {
  it('no envía la petición y muestra dos errores cuando todo está vacío', async () => {
    const login = vi.fn()
    const result = await attemptLogin('', '', login)

    expect(login).not.toHaveBeenCalled()
    expect(result.submitted).toBe(false)
    expect(result.valid).toBe(false)
    expect(result.uidError).toContain('obligatorio')
    expect(result.passwordError).toContain('obligatoria')
  })

  it('validateLogin marca ambos campos inválidos', () => {
    const validation = validateLogin('   ', '')

    expect(validation.valid).toBe(false)
    expect(validation.uidError).not.toBe('')
    expect(validation.passwordError).not.toBe('')
  })
})

describe('PU-02 mensaje específico por campo inválido', () => {
  it('solo marca la contraseña cuando el usuario es válido', async () => {
    const login = vi.fn()
    const result = await attemptLogin('jperez', '', login)

    expect(login).not.toHaveBeenCalled()
    expect(result.submitted).toBe(false)
    expect(result.valid).toBe(false)
    expect(result.uidError).toBe('')
    expect(result.passwordError).toContain('contraseña')
  })

  it('permite el envío cuando ambos campos son válidos', async () => {
    const login = vi.fn().mockResolvedValue({ token: 'jwt' })
    const result = await attemptLogin(' jperez ', 'Secreta#123', login)

    expect(login).toHaveBeenCalledTimes(1)
    expect(login).toHaveBeenCalledWith('jperez', 'Secreta#123')
    expect(result.submitted).toBe(true)
    expect(result.result).toEqual({ token: 'jwt' })
  })
})

describe('PU-10 redirección por rol', () => {
  it('devuelve el panel esperado para cada rol', () => {
    expect(homeForRole('ADMIN_ACADEMICO')).toBe('/panel/academico')
    expect(homeForRole('ADMIN_TECNICO')).toBe('/panel/tecnico')
    expect(homeForRole('DOCENTE')).toBe('/panel/docencia')
  })

  it('un rol desconocido o nulo cae en acceso denegado', () => {
    expect(homeForRole('ESTUDIANTE')).toBe(ACCESS_DENIED_ROUTE)
    expect(homeForRole('DESCONOCIDO')).toBe(ACCESS_DENIED_ROUTE)
    expect(homeForRole(null)).toBe(ACCESS_DENIED_ROUTE)
  })
})

describe('PU-11 menú dinámico según permisos', () => {
  it('solo incluye Monitoreo y Equipos con los permisos del docente', () => {
    const menu = buildMenu(['monitoring:read', 'equipment:read'])
    const labels = menu.flatMap((section) => section.items.map((item) => item.label))

    expect(labels).toEqual(['Equipos', 'Monitoreo'])
    expect(labels).not.toContain('Usuarios')
    expect(labels).not.toContain('Listas blancas')
    expect(labels).not.toContain('Políticas')
    expect(menu).toHaveLength(2)
  })

  it('no muta la matriz declarativa del menú', () => {
    const before = MENU_SECTIONS.map((section) => section.items.length)
    buildMenu(['monitoring:read'])
    const after = MENU_SECTIONS.map((section) => section.items.length)

    expect(after).toEqual(before)
  })
})

describe('PU-14 redirección a acceso denegado', () => {
  it('cancela una ruta sin permiso y redirige a /acceso-denegado', () => {
    const decision = resolveRouteAccess({
      authenticated: true,
      permissions: ['monitoring:read', 'equipment:read'],
      role: 'DOCENTE',
      requiredPermission: 'audit:read',
      fullPath: '/auditoria',
    })

    expect(decision).toEqual({ name: 'access-denied' })
    expect(canAccessRoute(['monitoring:read'], 'audit:read')).toBe(false)
  })

  it('permite una ruta autorizada', () => {
    const decision = resolveRouteAccess({
      authenticated: true,
      permissions: ['monitoring:read'],
      role: 'DOCENTE',
      requiredPermission: 'monitoring:read',
      fullPath: '/monitoreo',
    })

    expect(decision).toBe(true)
  })

  it('sin sesión redirige al login conservando el destino', () => {
    const decision = resolveRouteAccess({
      authenticated: false,
      permissions: [],
      role: null,
      requiredPermission: 'audit:read',
      fullPath: '/auditoria',
    })

    expect(decision).toEqual({ name: 'login', query: { redirect: '/auditoria' } })
  })

  it('la raíz autenticada navega al panel del rol', () => {
    const decision = resolveRouteAccess({
      authenticated: true,
      permissions: ['panel:tecnico'],
      role: 'ADMIN_TECNICO',
      targetName: 'home',
      fullPath: '/',
    })

    expect(decision).toEqual({ path: '/panel/tecnico' })
  })
})
