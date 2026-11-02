<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { monitoringApi, type MonitoringOverview } from '../../api/monitoring.api'

const overview = ref<MonitoringOverview | null>(null)
const loading = ref(true)
const error = ref('')

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-PY')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    overview.value = await monitoringApi.overview()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo cargar el monitoreo'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Monitoreo</h2>
        <p class="text-sm text-slate-500">
          Solo sesiones de estudiantes pertenecientes a sus grupos (RN-017 / RN-020).
        </p>
      </div>
      <button
        class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        type="button"
        :disabled="loading"
        @click="load"
      >
        Actualizar
      </button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <template v-else>
      <div class="sgl-card overflow-x-auto p-0">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Estudiante</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Grupos</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Equipo</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Laboratorio</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Inicio</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="session in overview?.sesiones || []" :key="session.id">
              <td class="px-4 py-3">
                <p class="font-medium text-slate-800">{{ session.estudiante }}</p>
                <p class="font-mono text-xs text-slate-500">{{ session.estudiante_uid }}</p>
              </td>
              <td class="px-4 py-3">
                <span
                  v-for="grupo in session.grupos"
                  :key="grupo"
                  class="mr-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                >
                  {{ grupo }}
                </span>
              </td>
              <td class="px-4 py-3">
                <p class="text-slate-700">{{ session.hostname }}</p>
                <p class="font-mono text-xs text-slate-500">{{ session.ip_address || '—' }}</p>
              </td>
              <td class="px-4 py-3 text-slate-600">{{ session.laboratorio }}</td>
              <td class="px-4 py-3 text-xs text-slate-500">{{ formatDate(session.hora_inicio) }}</td>
            </tr>
            <tr v-if="!overview?.sesiones.length">
              <td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500">
                No hay sesiones activas de estudiantes en sus grupos.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sgl-card">
        <h3 class="text-base font-semibold text-slate-900">Grupos asignados</h3>
        <p v-if="!overview?.grupos.length" class="mt-2 text-sm text-slate-500">
          No tiene grupos asignados.
        </p>
        <div v-else class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="grupo in overview.grupos"
            :key="grupo.id"
            class="rounded-full bg-sgl-50 px-3 py-1 text-xs font-medium text-sgl-700"
          >
            {{ grupo.codigo }} · {{ grupo.estudiantes }} estudiantes
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
