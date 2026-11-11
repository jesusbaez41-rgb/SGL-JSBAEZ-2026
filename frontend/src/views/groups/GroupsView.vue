<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { groupsApi, type GroupDetail, type GroupRow } from '../../api/groups.api'
import { usersApi, type UserRow } from '../../api/users.api'
import { useAuthStore } from '../../stores/auth.store'
import { sortGroupsByCode } from '../../utils/groupsLogic'
import GroupFormModal from './GroupFormModal.vue'
import GroupMembersModal from './GroupMembersModal.vue'

const auth = useAuthStore()

const groups = ref<GroupRow[]>([])
const users = ref<UserRow[]>([])
const loading = ref(true)
const error = ref('')
const success = ref('')
const search = ref('')
const showForm = ref(false)
const editing = ref<GroupRow | null>(null)
const showMembers = ref(false)
const selectedGroup = ref<GroupDetail | null>(null)
const membersLoading = ref(false)

const canManage = computed(() => auth.can('groups:manage'))

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  const list = sortGroupsByCode(groups.value)
  if (!term) return list
  return list.filter(
    (group) =>
      group.codigo.toLowerCase().includes(term) ||
      String(group.descripcion || '').toLowerCase().includes(term),
  )
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    groups.value = await groupsApi.list()
    if (canManage.value) {
      users.value = await usersApi.list()
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar los grupos.'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  showForm.value = true
}

function openEdit(group: GroupRow) {
  editing.value = group
  showForm.value = true
}

async function onSaved(group: GroupRow) {
  const action = editing.value ? 'actualizado' : 'creado'
  showForm.value = false
  editing.value = null
  success.value = `Grupo ${group.codigo} ${action} correctamente.`
  await load()
}

async function openMembers(group: GroupRow) {
  membersLoading.value = true
  error.value = ''
  try {
    selectedGroup.value = await groupsApi.get(group.id)
    showMembers.value = true
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar los miembros del grupo.'
  } finally {
    membersLoading.value = false
  }
}

function onMembersUpdated(group: GroupDetail) {
  selectedGroup.value = group
  const index = groups.value.findIndex((row) => row.id === group.id)
  if (index >= 0) {
    groups.value[index] = {
      ...groups.value[index],
      estudiantes: group.estudiantes.length,
      docentes: group.docentes.length,
    }
  }
}

async function removeGroup(group: GroupRow) {
  const confirmed = window.confirm(
    `¿Eliminar el grupo ${group.codigo}? Se eliminarán sus relaciones, pero no las cuentas de usuario.`,
  )
  if (!confirmed) return

  error.value = ''
  success.value = ''
  try {
    const result = await groupsApi.remove(group.id)
    success.value =
      `Grupo ${result.codigo} eliminado. ` +
      `${result.estudiantes_liberados} estudiantes y ${result.docentes_liberados} docentes desvinculados.`
    await load()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo eliminar el grupo.'
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Grupos</h2>
        <p class="text-sm text-slate-500">
          Grupos de estudiantes sincronizados con Samba AD y docentes asignados para monitoreo.
        </p>
      </div>
      <button v-if="canManage" class="sgl-btn" type="button" @click="openCreate">
        + Nuevo grupo
      </button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {{ error }}
    </p>
    <p v-if="success" class="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
      {{ success }}
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <input
        v-model="search"
        class="sgl-input max-w-sm"
        type="search"
        placeholder="Buscar por código o descripción…"
      />
      <span class="text-xs text-slate-400">
        {{ filtered.length }} grupo{{ filtered.length === 1 ? '' : 's' }}
      </span>
      <span v-if="membersLoading" class="text-xs text-slate-400">Cargando miembros…</span>
    </div>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <div v-else class="sgl-card overflow-x-auto p-0">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Código</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Descripción</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Estudiantes</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Docentes</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Origen</th>
            <th class="px-4 py-3 text-right font-semibold text-slate-600">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="group in filtered" :key="group.id">
            <td class="px-4 py-3">
              <p class="font-mono text-sm font-semibold text-slate-800">{{ group.codigo }}</p>
              <p class="font-mono text-[10px] text-slate-400">{{ group.samba_sid || '—' }}</p>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ group.descripcion || '—' }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {{ group.estudiantes }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {{ group.docentes }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                Samba AD
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <button
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  @click="openMembers(group)"
                >
                  {{ canManage ? 'Miembros' : 'Ver miembros' }}
                </button>
                <button
                  v-if="canManage"
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  @click="openEdit(group)"
                >
                  Editar
                </button>
                <button
                  v-if="canManage"
                  class="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  type="button"
                  @click="removeGroup(group)"
                >
                  Eliminar
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="px-4 py-6 text-center text-sm text-slate-500">
              No hay grupos para mostrar.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <GroupFormModal
      v-if="showForm"
      :group="editing"
      @close="showForm = false"
      @saved="onSaved"
    />

    <GroupMembersModal
      v-if="showMembers && selectedGroup"
      :group="selectedGroup"
      :users="users"
      :can-manage="canManage"
      @close="showMembers = false"
      @updated="onMembersUpdated"
    />
  </div>
</template>
