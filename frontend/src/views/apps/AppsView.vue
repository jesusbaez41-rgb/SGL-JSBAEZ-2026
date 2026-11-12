<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { appsApi, type AppDetail, type AppRow } from '../../api/apps.api'
import { labsApi, type Lab } from '../../api/labs.api'
import { useAuthStore } from '../../stores/auth.store'
import { matchesAppSearch, shortChecksum, sortAppsByName } from '../../utils/appsLogic'
import AppFormModal from './AppFormModal.vue'
import AppLinksModal from './AppLinksModal.vue'

const auth = useAuthStore()

const apps = ref<AppRow[]>([])
const labs = ref<Lab[]>([])
const loading = ref(true)
const error = ref('')
const success = ref('')
const search = ref('')
const showForm = ref(false)
const editing = ref<AppRow | null>(null)
const showLinks = ref(false)
const selectedApp = ref<AppDetail | null>(null)
const busyId = ref<string | null>(null)

const canManage = computed(() => auth.can('apps:manage'))

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return sortAppsByName(apps.value.filter((app) => matchesAppSearch(app, term)))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    apps.value = await appsApi.list()
    if (canManage.value) {
      labs.value = await labsApi.list()
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar las aplicaciones.'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  showForm.value = true
}

function openEdit(app: AppRow) {
  editing.value = app
  showForm.value = true
}

async function onSaved(app: AppRow) {
  const action = editing.value ? 'actualizada' : 'creada'
  showForm.value = false
  editing.value = null
  success.value = `Aplicación ${app.nombre} ${app.version} ${action} correctamente.`
  await load()
}

async function verify(app: AppRow) {
  busyId.value = app.id
  error.value = ''
  success.value = ''
  try {
    const result = await appsApi.verifyChecksum(app.id)
    success.value =
      `Checksum válido para ${app.nombre} ${app.version}: ` +
      `${shortChecksum(result.checksum, 16)} (${result.tamano} bytes).`
  } catch (e: any) {
    error.value =
      e?.response?.data?.error || 'No se pudo verificar el checksum del instalador.'
  } finally {
    busyId.value = null
  }
}

async function openLinks(app: AppRow) {
  busyId.value = app.id
  error.value = ''
  try {
    selectedApp.value = await appsApi.get(app.id)
    showLinks.value = true
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar los vínculos.'
  } finally {
    busyId.value = null
  }
}

async function onLinksUpdated() {
  await load()
}

async function removeApp(app: AppRow) {
  const confirmed = window.confirm(
    `¿Eliminar la aplicación ${app.nombre} ${app.version}? Esta acción no se puede deshacer.`,
  )
  if (!confirmed) return

  error.value = ''
  success.value = ''
  try {
    await appsApi.remove(app.id)
    success.value = `Aplicación ${app.nombre} ${app.version} eliminada.`
    await load()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo eliminar la aplicación.'
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Aplicaciones</h2>
        <p class="text-sm text-slate-500">
          Catálogo de instaladores validados por SHA-256 y vinculados a laboratorios.
        </p>
      </div>
      <button v-if="canManage" class="sgl-btn" type="button" @click="openCreate">
        + Nueva aplicación
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
        placeholder="Buscar por nombre, versión o ruta…"
      />
      <span class="text-xs text-slate-400">
        {{ filtered.length }} {{ filtered.length === 1 ? 'aplicación' : 'aplicaciones' }}
      </span>
    </div>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <div v-else class="sgl-card overflow-x-auto p-0">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Aplicación</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Ruta del instalador</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Checksum</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Laboratorios</th>
            <th class="px-4 py-3 text-right font-semibold text-slate-600">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="app in filtered" :key="app.id">
            <td class="px-4 py-3">
              <p class="font-medium text-slate-800">{{ app.nombre }}</p>
              <p class="font-mono text-xs text-slate-500">v{{ app.version }}</p>
              <p class="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {{ app.origen === 'upload' ? 'subido' : 'ruta del servidor' }}
              </p>
            </td>
            <td class="max-w-xs px-4 py-3">
              <p class="truncate font-mono text-xs text-slate-600" :title="app.ruta_instalador">
                {{ app.ruta_instalador }}
              </p>
              <p v-if="app.parametros_silenciosos" class="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                {{ app.parametros_silenciosos }}
              </p>
            </td>
            <td class="px-4 py-3">
              <span class="font-mono text-xs text-slate-600" :title="app.checksum">
                {{ shortChecksum(app.checksum) }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {{ app.vinculos_activos }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <button
                  v-if="canManage"
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  :disabled="busyId === app.id"
                  @click="verify(app)"
                >
                  {{ busyId === app.id ? 'Verificando…' : 'Verificar' }}
                </button>
                <button
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  :disabled="busyId === app.id"
                  @click="openLinks(app)"
                >
                  {{ canManage ? 'Laboratorios' : 'Ver laboratorios' }}
                </button>
                <button
                  v-if="canManage"
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  @click="openEdit(app)"
                >
                  Editar
                </button>
                <button
                  v-if="canManage"
                  class="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  type="button"
                  @click="removeApp(app)"
                >
                  Eliminar
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500">
              No hay aplicaciones para mostrar.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppFormModal
      v-if="showForm"
      :app="editing"
      @close="showForm = false"
      @saved="onSaved"
    />

    <AppLinksModal
      v-if="showLinks && selectedApp"
      :app="selectedApp"
      :labs="labs"
      :can-manage="canManage"
      @close="showLinks = false"
      @updated="onLinksUpdated"
    />
  </div>
</template>
