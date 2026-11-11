<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { groupsApi, type GroupDetail } from '../../api/groups.api'
import type { UserRow } from '../../api/users.api'
import { availableStudents, availableTeachers } from '../../utils/groupsLogic'

const props = defineProps<{
  group: GroupDetail
  users: UserRow[]
  canManage: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', group: GroupDetail): void
}>()

const detail = ref<GroupDetail>(props.group)
const selectedStudent = ref('')
const selectedTeacher = ref('')
const busy = ref(false)
const error = ref('')
const success = ref('')

watch(
  () => props.group,
  (value) => {
    detail.value = value
  },
)

const students = computed(() => detail.value.estudiantes || [])
const teachers = computed(() => detail.value.docentes || [])
const studentOptions = computed(() => availableStudents(props.users, students.value))
const teacherOptions = computed(() => availableTeachers(props.users, teachers.value))

function applyResult(result: { grupo: GroupDetail }, message: string) {
  detail.value = result.grupo
  success.value = message
  error.value = ''
  emit('updated', result.grupo)
}

async function addStudent() {
  if (!selectedStudent.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await groupsApi.addStudent(detail.value.id, selectedStudent.value)
    applyResult(result, 'Estudiante agregado al grupo y sincronizado con Samba AD.')
    selectedStudent.value = ''
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo agregar el estudiante.'
  } finally {
    busy.value = false
  }
}

async function removeStudent(user: UserRow) {
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await groupsApi.removeStudent(detail.value.id, user.id)
    applyResult(result, 'Estudiante removido del grupo.')
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo remover el estudiante.'
  } finally {
    busy.value = false
  }
}

async function addTeacher() {
  if (!selectedTeacher.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await groupsApi.addTeacher(detail.value.id, selectedTeacher.value)
    applyResult(result, 'Docente asignado para monitoreo.')
    selectedTeacher.value = ''
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo asignar el docente.'
  } finally {
    busy.value = false
  }
}

async function removeTeacher(user: UserRow) {
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await groupsApi.removeTeacher(detail.value.id, user.id)
    applyResult(result, 'Asignación de docente removida.')
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo remover la asignación.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div class="sgl-card w-full max-w-3xl space-y-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">
            Miembros de {{ detail.codigo }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            {{ detail.descripcion || 'Sin descripción' }}
          </p>
          <p class="mt-1 font-mono text-xs text-slate-400">{{ detail.samba_dn }}</p>
        </div>
        <button
          class="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          type="button"
          aria-label="Cerrar"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {{ error }}
      </p>
      <p v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
        {{ success }}
      </p>

      <div class="grid gap-5 lg:grid-cols-2">
        <section class="rounded-xl border border-slate-200 p-4">
          <div class="flex items-center justify-between gap-2">
            <h4 class="text-sm font-semibold text-slate-900">Estudiantes</h4>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {{ students.length }}
            </span>
          </div>

          <div v-if="canManage" class="mt-3 flex gap-2">
            <select v-model="selectedStudent" class="sgl-input text-sm" :disabled="busy">
              <option value="">Seleccione un estudiante</option>
              <option v-for="user in studentOptions" :key="user.id" :value="user.id">
                {{ user.nombre_completo }} ({{ user.uid }})
              </option>
            </select>
            <button
              class="sgl-btn whitespace-nowrap px-3 py-2 text-sm"
              type="button"
              :disabled="busy || !selectedStudent"
              @click="addStudent"
            >
              Agregar
            </button>
          </div>
          <p v-if="canManage && studentOptions.length === 0" class="mt-2 text-xs text-slate-400">
            No hay estudiantes disponibles para agregar.
          </p>

          <ul class="mt-3 divide-y divide-slate-100">
            <li v-for="user in students" :key="user.id" class="flex items-center justify-between gap-2 py-2">
              <div>
                <p class="text-sm font-medium text-slate-800">{{ user.nombre_completo }}</p>
                <p class="font-mono text-xs text-slate-500">{{ user.uid }}</p>
              </div>
              <button
                v-if="canManage"
                class="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                type="button"
                :disabled="busy"
                @click="removeStudent(user)"
              >
                Remover
              </button>
            </li>
            <li v-if="students.length === 0" class="py-3 text-sm text-slate-400">
              El grupo no tiene estudiantes.
            </li>
          </ul>
        </section>

        <section class="rounded-xl border border-slate-200 p-4">
          <div class="flex items-center justify-between gap-2">
            <h4 class="text-sm font-semibold text-slate-900">Docentes asignados</h4>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {{ teachers.length }}
            </span>
          </div>
          <p class="mt-1 text-xs text-slate-400">
            La asignación habilita el monitoreo del grupo (RN-015/RN-017).
          </p>

          <div v-if="canManage" class="mt-3 flex gap-2">
            <select v-model="selectedTeacher" class="sgl-input text-sm" :disabled="busy">
              <option value="">Seleccione un docente</option>
              <option v-for="user in teacherOptions" :key="user.id" :value="user.id">
                {{ user.nombre_completo }} ({{ user.uid }})
              </option>
            </select>
            <button
              class="sgl-btn whitespace-nowrap px-3 py-2 text-sm"
              type="button"
              :disabled="busy || !selectedTeacher"
              @click="addTeacher"
            >
              Asignar
            </button>
          </div>
          <p v-if="canManage && teacherOptions.length === 0" class="mt-2 text-xs text-slate-400">
            No hay docentes disponibles para asignar.
          </p>

          <ul class="mt-3 divide-y divide-slate-100">
            <li v-for="user in teachers" :key="user.id" class="flex items-center justify-between gap-2 py-2">
              <div>
                <p class="text-sm font-medium text-slate-800">{{ user.nombre_completo }}</p>
                <p class="font-mono text-xs text-slate-500">{{ user.uid }}</p>
              </div>
              <button
                v-if="canManage"
                class="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                type="button"
                :disabled="busy"
                @click="removeTeacher(user)"
              >
                Remover
              </button>
            </li>
            <li v-if="teachers.length === 0" class="py-3 text-sm text-slate-400">
              No hay docentes asignados.
            </li>
          </ul>
        </section>
      </div>

      <div class="flex justify-end">
        <button
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="emit('close')"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
</template>
