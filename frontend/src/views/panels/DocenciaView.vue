<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dashboardApi, type DashboardSummary } from '../../api/dashboard.api'
import { monitoringApi, type MonitoringOverview } from '../../api/monitoring.api'
import { useAuthStore } from '../../stores/auth.store'

const auth = useAuthStore()
const summary = ref<DashboardSummary | null>(null)
const overview = ref<MonitoringOverview | null>(null)
const loading = ref(true)
const error = ref('')

const cards = computed(() => [
  { label: 'Estudiantes en mis grupos', value: summary.value?.usuarios ?? 0 },
  { label: 'Grupos asignados', value: summary.value?.grupos ?? 0 },
  { label: 'Sesiones activas', value: overview.value?.sesiones.length ?? 0 },
])

const recentSessions = computed(() => (overview.value?.sesiones || []).slice(0, 5))

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-PY')
}

onMounted(async () => {
  try {
    const [summaryData, overviewData] = await Promise.all([
      dashboardApi.summary(),
      monitoringApi.overview(),
    ])
    summary.value = summaryData
    overview.value = overviewData
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo cargar el panel de docencia'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold text-slate-900">Panel de docencia</h2>
      <p class="text-sm text-slate-500">
        Monitoreo limitado a los estudiantes de sus grupos asignados (RN-017).
      </p>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-3">
        <div v-for="card in cards" :key="card.label" class="sgl-card">
          <p class="text-sm font-medium text-slate-500">{{ card.label }}</p>
          <p class="mt-3 text-3xl font-bold text-slate-900">{{ card.value }}</p>
        </div>
      </div>

      <div class="sgl-card">
        <h3 class="text-base font-semibold text-slate-900">Mis grupos</h3>
        <p v-if="!overview?.grupos.length" class="mt-2 text-sm text-slate-500">
          No tiene grupos asignados. Contacte al administrador académico.
        </p>
        <ul v-else class="mt-3 divide-y divide-slate-100">
          <li
            v-for="grupo in overview.grupos"
            :key="grupo.id"
            class="flex items-center justify-between py-2 text-sm"
          >
            <div>
              <p class="font-medium text-slate-800">{{ grupo.codigo }}</p>
              <p class="text-xs text-slate-500">{{ grupo.descripcion || 'Sin descripción' }}</p>
            </div>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {{ grupo.estudiantes }} estudiantes
            </span>
          </li>
        </ul>
      </div>

      <div class="sgl-card">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold text-slate-900">Sesiones activas</h3>
            <p class="text-xs text-slate-500">Estudiantes de sus grupos con sesión abierta.</p>
          </div>
          <RouterLink class="text-sm font-medium text-sgl-600 hover:text-sgl-700" to="/monitoreo">
            Ver monitoreo →
          </RouterLink>
        </div>

        <p v-if="!recentSessions.length" class="mt-3 text-sm text-slate-500">
          No hay sesiones activas de sus estudiantes en este momento.
        </p>

        <div v-else class="mt-3 overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr>
                <th class="px-3 py-2 text-left font-semibold text-slate-600">Estudiante</th>
                <th class="px-3 py-2 text-left font-semibold text-slate-600">Equipo</th>
                <th class="px-3 py-2 text-left font-semibold text-slate-600">Laboratorio</th>
                <th class="px-3 py-2 text-left font-semibold text-slate-600">Inicio</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="session in recentSessions" :key="session.id">
                <td class="px-3 py-2">
                  <p class="font-medium text-slate-800">{{ session.estudiante }}</p>
                  <p class="font-mono text-xs text-slate-500">{{ session.estudiante_uid }}</p>
                </td>
                <td class="px-3 py-2 text-slate-600">{{ session.hostname }}</td>
                <td class="px-3 py-2 text-slate-600">{{ session.laboratorio }}</td>
                <td class="px-3 py-2 text-xs text-slate-500">{{ formatDate(session.hora_inicio) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
