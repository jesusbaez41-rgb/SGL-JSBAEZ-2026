/**
 * Lógica pura de autenticación y navegación del frontend SGL.
 *
 * Se extrae de los componentes para poder probarla sin montar Vue:
 * - PU-01/PU-02: validación de campos del formulario de login.
 * - PU-10: redirección por rol.
 * - PU-11: construcción del menú según permisos.
 * - PU-14: decisión del router guard ante rutas prohibidas.
 */

export interface LoginValidation {
  valid: boolean
  uidError: string
  passwordError: string
}

export interface LoginAttempt<T> extends LoginValidation {
  submitted: boolean
  result?: T
}

export interface MenuItem {
  label: string
  to: string
  permission: string
  external?: boolean
}

export interface MenuSection {
  title: string
  items: MenuItem[]
}

export type GuardDecision =
  | true
  | { name: string; query?: Record<string, string> }
  | { path: string }

export const ACCESS_DENIED_ROUTE = '/acceso-denegado'

/**
 * Matriz declarativa rol → panel inicial (HU-COM-14 / CA-05).
 * Un rol desconocido nunca debe caer en un panel válido.
 */
export const ROLE_HOME: Record<string, string> = {
  ADMIN_ACADEMICO: '/panel/academico',
  ADMIN_TECNICO: '/panel/tecnico',
  DOCENTE: '/panel/docencia',
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Panel',
    items: [
      { label: 'Panel académico', to: '/panel/academico', permission: 'panel:academico' },
      { label: 'Panel técnico', to: '/panel/tecnico', permission: 'panel:tecnico' },
      { label: 'Panel de docencia', to: '/panel/docencia', permission: 'panel:docencia' },
    ],
  },
  {
    title: 'Gestión académica',
    items: [
      { label: 'Usuarios', to: '/usuarios', permission: 'users:read' },
      { label: 'Grupos', to: '/grupos', permission: 'groups:read' },
      { label: 'Listas blancas', to: '/listas-blancas', permission: 'whitelists:read' },
      { label: 'Auditoría', to: '/auditoria', permission: 'audit:read' },
    ],
  },
  {
    title: 'Gestión técnica',
    items: [
      { label: 'Laboratorios', to: '/laboratorios', permission: 'labs:read' },
      { label: 'Equipos', to: '/equipos', permission: 'equipment:read' },
      { label: 'MeshCentral', to: '/mesh/', permission: 'equipment:manage', external: true },
      { label: 'Aplicaciones', to: '/aplicaciones', permission: 'apps:read' },
      { label: 'Despliegues', to: '/despliegues', permission: 'deployments:read' },
      { label: 'Políticas', to: '/politicas', permission: 'policies:read' },
    ],
  },
  {
    title: 'Docencia',
    items: [{ label: 'Monitoreo', to: '/monitoreo', permission: 'monitoring:read' }],
  },
]

/** CA-01: bloquea el envío si usuario o contraseña están vacíos. */
export function validateLogin(uid: string, password: string): LoginValidation {
  const uidError = String(uid ?? '').trim() ? '' : 'El usuario es obligatorio.'
  const passwordError = password ? '' : 'La contraseña es obligatoria.'

  return {
    valid: !uidError && !passwordError,
    uidError,
    passwordError,
  }
}

/**
 * Ejecuta el login solo si la validación local es correcta. Se usa en el
 * formulario y permite comprobar que no se dispara la petición HTTP.
 */
export async function attemptLogin<T>(
  uid: string,
  password: string,
  login: (uid: string, password: string) => Promise<T>,
): Promise<LoginAttempt<T>> {
  const validation = validateLogin(uid, password)
  if (!validation.valid) {
    return { ...validation, submitted: false }
  }

  const result = await login(uid.trim(), password)
  return { ...validation, submitted: true, result }
}

/** CA-05: panel inicial por rol; cualquier rol desconocido va a acceso denegado. */
export function homeForRole(rol: string | null | undefined): string {
  if (!rol) return ACCESS_DENIED_ROUTE
  return ROLE_HOME[rol] || ACCESS_DENIED_ROUTE
}

/** CA-06: incluye solo los módulos cuyos permisos tiene el usuario. */
export function buildMenu(permissions: string[]): MenuSection[] {
  const granted = new Set(Array.isArray(permissions) ? permissions : [])

  return MENU_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => granted.has(item.permission)),
  })).filter((section) => section.items.length > 0)
}

/** CA-07/CA-08: evalúa el permiso declarado en la ruta. */
export function canAccessRoute(permissions: string[], requiredPermission?: string): boolean {
  if (!requiredPermission) return true
  return Array.isArray(permissions) && permissions.includes(requiredPermission)
}

export interface RouteAccessInput {
  authenticated: boolean
  permissions: string[]
  role: string | null | undefined
  targetName?: string
  requiredPermission?: string
  fullPath?: string
}

/**
 * Réplica pura del router guard (CA-08/CA-13).
 * Devuelve la decisión de navegación sin depender del router real.
 */
export function resolveRouteAccess(input: RouteAccessInput): GuardDecision {
  if (!input.authenticated) {
    return {
      name: 'login',
      query:
        input.fullPath && input.fullPath !== '/'
          ? { redirect: input.fullPath }
          : undefined,
    }
  }

  if (input.targetName === 'home') {
    return { path: homeForRole(input.role) }
  }

  if (!canAccessRoute(input.permissions, input.requiredPermission)) {
    return { name: 'access-denied' }
  }

  return true
}
