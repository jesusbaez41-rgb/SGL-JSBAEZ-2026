import { describe, expect, it } from 'vitest'
import {
  availableStudents,
  availableTeachers,
  canAssignStudent,
  canAssignTeacher,
  groupSummary,
  normalizeGroupCode,
  sortGroupsByCode,
  validateGroupCode,
} from '../src/utils/groupsLogic'
import type { UserRow } from '../src/api/users.api'
import type { GroupRow } from '../src/api/groups.api'

const student: UserRow = {
  id: 's1',
  uid: 'est1',
  email: 'est1@clockwork.local',
  nombre_completo: 'Estudiante Uno',
  rol: 'ESTUDIANTE',
  activo: true,
}

const student2: UserRow = {
  id: 's2',
  uid: 'est2',
  email: 'est2@clockwork.local',
  nombre_completo: 'Estudiante Dos',
  rol: 'ESTUDIANTE',
  activo: true,
}

const teacher: UserRow = {
  id: 't1',
  uid: 'doc1',
  email: 'doc1@clockwork.local',
  nombre_completo: 'Docente Uno',
  rol: 'DOCENTE',
  activo: true,
}

const admin: UserRow = {
  id: 'a1',
  uid: 'admin1',
  email: 'admin1@clockwork.local',
  nombre_completo: 'Admin Uno',
  rol: 'ADMIN_ACADEMICO',
  activo: true,
}

const group: GroupRow = {
  id: 'g1',
  codigo: 'GRP-1A',
  descripcion: 'Primer año A',
  samba_sid: 'S-1-5-21-1',
  samba_dn: 'CN=GRP-1A,CN=Users,DC=clockwork,DC=local',
  created_at: null,
  estudiantes: 2,
  docentes: 1,
}

describe('HU05 validación de código de grupo', () => {
  it('exige un código obligatorio', () => {
    expect(validateGroupCode('')).toContain('obligatorio')
  })

  it('rechaza códigos demasiado cortos o con formato inválido', () => {
    expect(validateGroupCode('A')).not.toBe('')
    expect(validateGroupCode('GRP 1A')).not.toBe('')
  })

  it('acepta códigos válidos', () => {
    expect(validateGroupCode('GRP-1A')).toBe('')
    expect(validateGroupCode('grupo_2b')).toBe('')
  })

  it('normaliza a mayúsculas y sin espacios', () => {
    expect(normalizeGroupCode('  grp-2b  ')).toBe('GRP-2B')
  })
})

describe('HU05 asignación de estudiantes', () => {
  it('solo considera estudiantes', () => {
    expect(canAssignStudent(student)).toBe(true)
    expect(canAssignStudent(teacher)).toBe(false)
    expect(canAssignStudent(admin)).toBe(false)
  })

  it('excluye a los estudiantes que ya están en el grupo', () => {
    const available = availableStudents([student, student2, teacher], [{ id: student.id }])
    expect(available.map((user) => user.id)).toEqual([student2.id])
  })

  it('no muta la lista de usuarios original', () => {
    const users = [student, student2]
    availableStudents(users, [{ id: student.id }])
    expect(users).toHaveLength(2)
  })
})

describe('HU05 asignación de docentes', () => {
  it('solo considera docentes', () => {
    expect(canAssignTeacher(teacher)).toBe(true)
    expect(canAssignTeacher(student)).toBe(false)
    expect(canAssignTeacher(admin)).toBe(false)
  })

  it('excluye a los docentes ya asignados', () => {
    const available = availableTeachers([teacher, student], [{ id: teacher.id }])
    expect(available).toEqual([])
  })
})

describe('HU05 resumen y orden de grupos', () => {
  it('resume estudiantes y docentes', () => {
    expect(groupSummary(group)).toBe('GRP-1A · 2 estudiantes · 1 docente')
  })

  it('ordena por código sin mutar el arreglo', () => {
    const groups = [
      { ...group, id: 'g2', codigo: 'GRP-2B' },
      group,
    ]
    const sorted = sortGroupsByCode(groups)
    expect(sorted.map((item) => item.codigo)).toEqual(['GRP-1A', 'GRP-2B'])
    expect(groups.map((item) => item.codigo)).toEqual(['GRP-2B', 'GRP-1A'])
  })
})
