<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usersApi, type UserRow } from '../../api/users.api'
import { useAuthStore, ROLE_LABELS } from '../../stores/auth.store'
import UserFormModal from './UserFormModal.vue'

const auth = useAuthStore()
const users = ref<UserRow[]>([])
const loading = ref(true)
const error = ref('')
const success = ref('')
const showModal = ref(false)
const editing = ref<UserRow | null>(null)
const busyId = ref<string | null>(null)

const canManage = computed(() => auth.can('users:manage'))

const scopeNote = computed(() =>
  auth.user?.rol === 'DOCENTE'
    ? 'Solo se muestran estudiantes de los grupos que tiene asignados (RN-017).'
    : 'Usuarios registrados en la plataforma. Los cambios se sincronizan con Samba AD.',
)

function roleLabel(role: string) {
  return ROLE_LABELS[role] || role
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    users.value = await usersApi.list()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo cargar la lista de usuarios'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  showModal.value = true
}

function openEdit(user: UserRow) {
  editing.value = user
  showModal.value = true
}

async function onSaved(user: UserRow) {
  const action = editing.value ? 'actualizado' : 'creado'
  showModal.value = false
  editing.value = null
  success.value = `Usuario ${user.uid} ${action} correctamente.`
  await load()
}

async function toggleStatus(user: UserRow) {
  const action = user.activo ? 'desactivar' : 'activar'
  if (!window.confirm(`¿Desea ${action} la cuenta ${user.uid}?`)) return

  busyId.value = user.id
  error.value = ''
  success.value = ''
  try {
    const updated = await usersApi.setStatus(user.id, !user.activo)
    success.value = `Cuenta ${updated.uid} ${updated.activo ? 'activada' : 'desactivada'} correctamente.`
    await load()
  } catch (e: any) {
    error.value = e?.response?.data?.error || `No se pudo ${action} la cuenta`
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Usuarios</h2>
        <p class="text-sm text-slate-500">{{ scopeNote }}</p>
      </div>
      <button v-if="canManage" class="sgl-btn" type="button" @click="openCreate">
        + Nuevo usuario
      </button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {{ error }}
    </p>
    <p v-if="success" class="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
      {{ success }}
    </p>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <div v-else class="sgl-card overflow-x-auto p-0">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Usuario</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Nombre</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Correo</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Rol</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
            <th v-if="canManage" class="px-4 py-3 text-right font-semibold text-slate-600">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="user in users" :key="user.id">
            <td class="px-4 py-3 font-mono text-xs text-slate-700">{{ user.uid }}</td>
            <td class="px-4 py-3 text-slate-800">{{ user.nombre_completo }}</td>
            <td class="px-4 py-3 text-slate-600">{{ user.email }}</td>
            <td class="px-4 py-3 text-slate-600">{{ roleLabel(user.rol) }}</td>
            <td class="px-4 py-3">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="
                  user.activo
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                "
              >
                {{ user.activo ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
            <td v-if="canManage" class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <button
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  @click="openEdit(user)"
                >
                  Editar
                </button>
                <button
                  class="rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50"
                  :class="
                    user.activo
                      ? 'border-red-200 text-red-700 hover:bg-red-50'
                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  "
                  type="button"
                  :disabled="busyId === user.id"
                  @click="toggleStatus(user)"
                >
                  {{ busyId === user.id ? '…' : user.activo ? 'Desactivar' : 'Activar' }}
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td :colspan="canManage ? 6 : 5" class="px-4 py-6 text-center text-sm text-slate-500">
              No hay usuarios para mostrar.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UserFormModal
      v-if="showModal"
      :user="editing"
      @close="showModal = false"
      @saved="onSaved"
    />
  </div>
</template>
