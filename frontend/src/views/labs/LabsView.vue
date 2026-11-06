<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { labsApi, type Lab } from '../../api/labs.api'
import { equipmentApi } from '../../api/equipment.api'
import { useAuthStore } from '../../stores/auth.store'
import LabFormModal from './LabFormModal.vue'

const auth = useAuthStore()
const labs = ref<Lab[]>([])
const loading = ref(true)
const error = ref('')
const success = ref('')
const showModal = ref(false)
const editing = ref<Lab | null>(null)
const syncingLab = ref<string | null>(null)

const canManage = computed(() => auth.can('labs:manage'))
const canSyncEquipment = computed(() => auth.can('equipment:manage'))

async function load() {
  loading.value = true
  error.value = ''
  try {
    labs.value = await labsApi.list()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar los laboratorios.'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  showModal.value = true
}

function openEdit(lab: Lab) {
  editing.value = lab
  showModal.value = true
}

async function onSaved(lab: Lab) {
  const action = editing.value ? 'actualizado' : 'creado'
  showModal.value = false
  editing.value = null
  success.value = `Laboratorio ${lab.nombre} ${action} correctamente.`
  await load()
}

async function syncLab(lab: Lab) {
  syncingLab.value = lab.id
  error.value = ''
  success.value = ''
  try {
    const result = await equipmentApi.sync(lab.id)
    success.value =
      `Laboratorio ${lab.nombre}: ${result.creados} PCs importadas y ` +
      `${result.actualizados} actualizadas (${result.total} reportadas por MeshCentral).`
    await load()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo sincronizar el laboratorio con MeshCentral.'
  } finally {
    syncingLab.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Laboratorios</h2>
        <p class="text-sm text-slate-500">
          Espacios tecnológicos registrados y cantidad de equipos asociados.
        </p>
      </div>
      <button v-if="canManage" class="sgl-btn" type="button" @click="openCreate">
        + Nuevo laboratorio
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
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Nombre</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Ubicación</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Subred</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Equipos</th>
            <th class="px-4 py-3 text-right font-semibold text-slate-600">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="lab in labs" :key="lab.id">
            <td class="px-4 py-3 font-medium text-slate-800">{{ lab.nombre }}</td>
            <td class="px-4 py-3 text-slate-600">{{ lab.ubicacion }}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600">{{ lab.subred }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {{ lab.equipos ?? 0 }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <RouterLink
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  :to="{ path: '/equipos', query: { lab: lab.id } }"
                >
                  Ver equipos
                </RouterLink>
                <button
                  v-if="canSyncEquipment"
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  :disabled="syncingLab === lab.id"
                  @click="syncLab(lab)"
                >
                  {{ syncingLab === lab.id ? 'Sincronizando…' : 'Sincronizar PCs' }}
                </button>
                <button
                  v-if="canManage"
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  @click="openEdit(lab)"
                >
                  Editar
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="labs.length === 0">
            <td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500">
              Todavía no hay laboratorios registrados.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <LabFormModal
      v-if="showModal"
      :lab="editing"
      @close="showModal = false"
      @saved="onSaved"
    />
  </div>
</template>
