<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { equipmentApi, type Equipment } from '../../api/equipment.api'
import { labsApi, type Lab } from '../../api/labs.api'
import { useAuthStore } from '../../stores/auth.store'
import {
  countEquipmentByStatus,
  formatEquipmentReport,
  formatSyncSummary,
  hasMeshError,
  statusLabel,
} from '../../utils/equipmentLogic'
import EquipmentFormModal from './EquipmentFormModal.vue'

const auth = useAuthStore()
const route = useRoute()

const equipment = ref<Equipment[]>([])
const labs = ref<Lab[]>([])
const loading = ref(true)
const error = ref('')
const loadError = ref('')
const success = ref('')
const showModal = ref(false)
const editing = ref<Equipment | null>(null)
const syncing = ref(false)
const busyId = ref<string | null>(null)
const selectedLab = ref(String(route.query.lab || ''))
const lastUpdated = ref<Date | null>(null)

let refreshTimer: number | undefined

const canManage = computed(() => auth.can('equipment:manage'))
const canReadLabs = computed(() => auth.can('labs:read'))

const filtered = computed(() =>
  selectedLab.value
    ? equipment.value.filter((item) => item.laboratorio_id === selectedLab.value)
    : equipment.value,
)

const meshDown = computed(() => hasMeshError(equipment.value))
const counts = computed(() => countEquipmentByStatus(filtered.value))
const noLabs = computed(() => canManage.value && labs.value.length === 0)

function statusClass(status: string) {
  if (status === 'ENCENDIDO') return 'bg-emerald-50 text-emerald-700'
  if (status === 'APAGADO') return 'bg-red-50 text-red-700'
  return 'bg-slate-100 text-slate-500'
}

async function load(silent = false) {
  if (!silent) loading.value = true
  if (!silent) loadError.value = ''
  try {
    equipment.value = await equipmentApi.list(selectedLab.value || undefined)
    if (canReadLabs.value) {
      labs.value = await labsApi.list()
    }
    loadError.value = ''
    lastUpdated.value = new Date()
  } catch (e: any) {
    loadError.value = e?.response?.data?.error || 'No se pudieron cargar los equipos.'
  } finally {
    if (!silent) loading.value = false
  }
}

function openCreate() {
  if (labs.value.length === 0) {
    error.value = 'Primero debe crear un laboratorio.'
    return
  }
  editing.value = null
  showModal.value = true
}

function openEdit(item: Equipment) {
  editing.value = item
  showModal.value = true
}

async function onSaved(item: Equipment) {
  const action = editing.value ? 'actualizado' : 'registrado'
  showModal.value = false
  editing.value = null
  success.value = `Equipo ${item?.hostname || 'equipo'} ${action} correctamente.`
  await load()
}

async function syncMesh() {
  syncing.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await equipmentApi.sync(selectedLab.value || undefined)
    success.value = formatSyncSummary(result)
    await load(true)
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo sincronizar con MeshCentral.'
  } finally {
    syncing.value = false
  }
}

async function refreshOne(item: Equipment) {
  busyId.value = item.id
  error.value = ''
  success.value = ''
  try {
    const updated = await equipmentApi.refresh(item.id)

    if (updated && updated.id) {
      const index = equipment.value.findIndex((row) => row.id === item.id)
      if (index >= 0) equipment.value[index] = updated

      if (updated.mesh_error) {
        error.value = 'MeshCentral no responde. El estado se muestra como Desconocido.'
      } else if (updated.mesh_encontrado === false) {
        error.value = `El equipo ${item.hostname} no está registrado en MeshCentral.`
      } else {
        success.value = `Estado de ${item.hostname} actualizado desde MeshCentral.`
      }
    } else {
      await load()
      error.value = 'MeshCentral devolvió una respuesta incompleta; se recargó el listado.'
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo consultar MeshCentral.'
  } finally {
    busyId.value = null
  }
}

watch(selectedLab, () => load(true))

onMounted(async () => {
  await load()
  // CA-06/CA-08: refresco automático sin recargar la página.
  refreshTimer = window.setInterval(() => load(true), 30000)
})

onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Equipos</h2>
        <p class="text-sm text-slate-500">
          Inventario de PCs vinculadas a un laboratorio. El estado se consulta a MeshCentral.
        </p>
        <p class="mt-1 text-xs text-slate-400">
          Actualizado:
          {{ lastUpdated ? lastUpdated.toLocaleTimeString('es-PY') : '—' }}
          · refresco automático cada 30 s
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a
          v-if="canManage"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          href="/mesh/"
          target="_blank"
          rel="noopener"
        >
          Abrir MeshCentral ↗
        </a>
        <button
          v-if="canManage"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          :disabled="syncing"
          @click="syncMesh"
        >
          {{ syncing ? 'Sincronizando…' : 'Sincronizar PCs' }}
        </button>
        <button v-if="canManage" class="sgl-btn" type="button" @click="openCreate">
          + Nuevo equipo
        </button>
      </div>
    </div>

    <div v-if="noLabs" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
      Todavía no hay laboratorios. Cree uno primero en
      <RouterLink class="font-semibold underline" to="/laboratorios">Laboratorios</RouterLink>.
    </div>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {{ loadError }}
    </p>
    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {{ error }}
    </p>
    <p v-if="success" class="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
      {{ success }}
    </p>
    <p v-if="meshDown" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
      MeshCentral no responde. Las PCs se muestran con estado
      <span class="font-semibold">Desconocido</span>.
    </p>

    <div v-if="canReadLabs && labs.length > 0" class="flex flex-wrap items-center gap-2">
      <label class="text-sm font-medium text-slate-600" for="lab-filter">Laboratorio:</label>
      <select id="lab-filter" v-model="selectedLab" class="sgl-input max-w-sm">
        <option value="">Todos</option>
        <option v-for="lab in labs" :key="lab.id" :value="lab.id">
          {{ lab.nombre }} · {{ lab.subred }}
        </option>
      </select>
    </div>

    <div v-if="!loading" class="flex flex-wrap gap-2 text-xs">
      <span class="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
        Total: {{ counts.total }}
      </span>
      <span class="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
        Encendidos: {{ counts.encendidos }}
      </span>
      <span class="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
        Apagados: {{ counts.apagados }}
      </span>
      <span class="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-500">
        Desconocidos: {{ counts.desconocidos }}
      </span>
    </div>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <div v-else class="sgl-card overflow-x-auto p-0">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Hostname</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">MAC</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">IP actual</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Laboratorio</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Usuario actual</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Último reporte</th>
            <th v-if="canManage" class="px-4 py-3 text-right font-semibold text-slate-600">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="item in filtered" :key="item.id">
            <td class="px-4 py-3">
              <p class="font-mono text-xs font-medium text-slate-800">{{ item.hostname }}</p>
              <p v-if="item.osdesc" class="text-[10px] text-slate-400">{{ item.osdesc }}</p>
              <p v-if="item.mesh_source === 'MESHCENTRAL'" class="text-[10px] font-medium text-emerald-600">
                MeshCentral
              </p>
              <p v-else class="text-[10px] text-slate-400">Local</p>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600">{{ item.mac_address }}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600">{{ item.ip_address || '—' }}</td>
            <td class="px-4 py-3 text-slate-600">{{ item.laboratorio_nombre }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="statusClass(item.estado)">
                {{ statusLabel(item.estado) }}
              </span>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ item.usuario_actual || '—' }}</td>
            <td class="px-4 py-3 text-xs text-slate-500">{{ formatEquipmentReport(item.ultimo_reporte) }}</td>
            <td v-if="canManage" class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <button
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  :disabled="busyId === item.id"
                  @click="refreshOne(item)"
                >
                  {{ busyId === item.id ? '…' : 'Estado' }}
                </button>
                <button
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  @click="openEdit(item)"
                >
                  Editar
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td :colspan="canManage ? 8 : 7" class="px-4 py-6 text-center text-sm text-slate-500">
              No hay equipos para mostrar.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EquipmentFormModal
      v-if="showModal"
      :equipment="editing"
      :labs="labs"
      @close="showModal = false"
      @saved="onSaved"
    />
  </div>
</template>
