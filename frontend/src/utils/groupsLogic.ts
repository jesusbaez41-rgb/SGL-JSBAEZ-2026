import type { UserRow } from '../api/users.api'
import type { GroupRow } from '../api/groups.api'

export const GROUP_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/

export function normalizeGroupCode(value: string): string {
  return String(value || '').trim().toUpperCase()
}

export function validateGroupCode(value: string): string {
  const codigo = String(value || '').trim()
  if (!codigo) return 'El código del grupo es obligatorio.'
  if (!GROUP_CODE_PATTERN.test(codigo)) {
    return 'Use entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.'
  }
  return ''
}

export function canAssignStudent(user: Pick<UserRow, 'rol'>): boolean {
  return user.rol === 'ESTUDIANTE'
}

export function canAssignTeacher(user: Pick<UserRow, 'rol'>): boolean {
  return user.rol === 'DOCENTE'
}

export function availableStudents(users: UserRow[], current: Array<{ id: string }>): UserRow[] {
  const assigned = new Set(current.map((user) => user.id))
  return users.filter((user) => canAssignStudent(user) && !assigned.has(user.id))
}

export function availableTeachers(users: UserRow[], current: Array<{ id: string }>): UserRow[] {
  const assigned = new Set(current.map((user) => user.id))
  return users.filter((user) => canAssignTeacher(user) && !assigned.has(user.id))
}

export function groupSummary(group: GroupRow): string {
  const estudiantes = group.estudiantes === 1 ? 'estudiante' : 'estudiantes'
  const docentes = group.docentes === 1 ? 'docente' : 'docentes'
  return `${group.codigo} · ${group.estudiantes} ${estudiantes} · ${group.docentes} ${docentes}`
}

export function sortGroupsByCode(groups: GroupRow[]): GroupRow[] {
  return [...groups].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'))
}
