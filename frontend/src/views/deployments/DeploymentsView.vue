<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { deploymentsApi, type Deployment } from '../../api/deployments.api'
import { useAuthStore } from '../../stores/auth.store'
import {
  deploymentSubtitle,
  estaActivo,
  estadoBadgeClass,
  estadoLabel,
  formatDateTime,
  progreso,
  puedeReintentar,
  resumenTexto,
  tipoLabel,
} from '../../utils/deploymentsLogic'
import DeploymentDetailModal from './DeploymentDetailModal.vue'
import DeploymentFormModal from './DeploymentFormModal.vue'

const auth = useAuthStore()

const despliegues = ref<Deployment[]>([])
const loading = ref(true)
const error = ref('')
const success = ref('')
const showForm = ref(false)
const showDetail = ref(false)
const selected = ref<Deployment | null>(null)
const busyId = ref<string | null>(null)

const canManage = computed(() => auth.can('deployments:manage'))

async function load() {
  loading.value = true
  error.value = ''
  try {
    despliegues.value = await deploymentsApi.list()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar los despliegues.'
  } finally {
    loading.value = false
  }
}

async function onCreated(despliegue: Deployment) {
  showForm.value = false
  success.value = `Despliegue de ${despliegue.app?.nombre || 'la aplicación'} creado.`
  await load()
  selected.value = despliegue
  showDetail.value = true
}

async function openDetail(despliegue: Deployment) {
  busyId.value = despliegue.id
  error.value = ''
  try {
    selected.value = await deploymentsApi.get(despliegue.id)
    showDetail.value = true
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo cargar el detalle del despliegue.'
  } finally {
    busyId.value = null
  }
}

async function onUpdated() {
  await load()
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Despliegues</h2>
        <p class="text-sm text-slate-500">
          Instalación o desinstalación masiva de aplicaciones en un laboratorio.
        </p>
      </div>
      <button v-if="canManage" class="sgl-btn" type="button" @click="showForm = true">
        + Nuevo despliegue
      </button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {{ error }}
    </p>
    <p v-if="success" class="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
      {{ success }}
    </p>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <div v-else class="space-y-3">
      <p v-if="despliegues.length === 0" class="sgl-card px-4 py-6 text-center text-sm text-slate-500">
        Todavía no hay despliegues.
      </p>

      <article
        v-for="despliegue in despliegues"
        :key="despliegue.id"
        class="sgl-card p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold text-slate-900">
                {{ tipoLabel(despliegue.tipo) }}
              </h3>
              <span
                v-if="estaActivo(despliegue)"
                class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
              >
                En curso
              </span>
              <span
                v-else
                class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
              >
                Finalizado
              </span>
            </div>
            <p class="mt-0.5 truncate text-sm text-slate-600">
              {{ deploymentSubtitle(despliegue) }}
            </p>
            <p class="mt-0.5 text-xs text-slate-400">
              {{ formatDateTime(despliegue.fecha_inicio) }} ·
              {{ despliegue.total_equipos }} equipo(s)
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              type="button"
              :disabled="busyId === despliegue.id"
              @click="openDetail(despliegue)"
            >
              Ver equipos
            </button>
          </div>
        </div>

        <div class="mt-3">
          <div class="flex items-center justify-between text-xs text-slate-500">
            <span>{{ resumenTexto(despliegue.resumen) }}</span>
            <span>{{ progreso(despliegue.resumen) }}%</span>
          </div>
          <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              class="h-full rounded-full bg-emerald-500 transition-all"
              :style="{ width: `${progreso(despliegue.resumen)}%` }"
            />
          </div>
        </div>

        <ul v-if="despliegue.equipos && despliegue.equipos.length" class="mt-3 flex flex-wrap gap-1.5">
          <li v-for="equipo in despliegue.equipos" :key="equipo.id">
            <span
              class="rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="estadoBadgeClass(equipo.estado)"
              :title="equipo.mensaje_error || equipo.hostname || ''"
            >
              {{ equipo.hostname || equipo.equipo_id.slice(0, 8) }} · {{ estadoLabel(equipo.estado) }}
            </span>
          </li>
        </ul>
      </article>
    </div>

    <DeploymentFormModal
      v-if="showForm"
      @close="showForm = false"
      @created="onCreated"
    />

    <DeploymentDetailModal
      v-if="showDetail && selected"
      :despliegue="selected"
      :can-manage="canManage"
      @close="showDetail = false"
      @updated="onUpdated"
    />
  </div>
</template>
