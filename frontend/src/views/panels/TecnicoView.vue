<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dashboardApi, type DashboardSummary } from '../../api/dashboard.api'
import { useAuthStore } from '../../stores/auth.store'

const auth = useAuthStore()
const summary = ref<DashboardSummary | null>(null)
const loading = ref(true)
const error = ref('')

const cards = computed(() => [
  { label: 'Laboratorios', value: summary.value?.laboratorios ?? 0, to: '/laboratorios', permission: 'labs:read' },
  { label: 'Equipos', value: summary.value?.equipos ?? 0, to: '/equipos', permission: 'equipment:read' },
])

const modules = [
  { label: 'Laboratorios', description: 'Alta y gestión de laboratorios.', to: '/laboratorios', permission: 'labs:read' },
  { label: 'Equipos', description: 'Inventario y estado de PCs.', to: '/equipos', permission: 'equipment:read' },
  { label: 'Aplicaciones', description: 'Catálogo de instaladores.', to: '/aplicaciones', permission: 'apps:read' },
  { label: 'Despliegues', description: 'Instalación remota por laboratorio.', to: '/despliegues', permission: 'deployments:read' },
  { label: 'Políticas', description: 'AppLocker, GPO y filtrado.', to: '/politicas', permission: 'policies:read' },
]

const visibleModules = computed(() => modules.filter((m) => auth.can(m.permission)))

onMounted(async () => {
  try {
    summary.value = await dashboardApi.summary()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo cargar el resumen'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold text-slate-900">Panel técnico</h2>
      <p class="text-sm text-slate-500">
        Gestión de laboratorios, equipos, aplicaciones, despliegues y políticas.
      </p>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <div v-else class="grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="card in cards"
        :key="card.label"
        :to="card.to"
        class="sgl-card transition hover:border-sgl-500"
      >
        <p class="text-sm font-medium text-slate-500">{{ card.label }}</p>
        <p class="mt-3 text-3xl font-bold text-slate-900">{{ card.value }}</p>
        <p class="mt-2 text-xs text-sgl-600">Abrir módulo →</p>
      </RouterLink>
    </div>

    <div class="sgl-card">
      <h3 class="text-base font-semibold text-slate-900">Sesión actual</h3>
      <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt class="text-slate-500">Usuario</dt><dd class="font-medium text-slate-800">{{ auth.user?.uid }}</dd></div>
        <div><dt class="text-slate-500">Rol</dt><dd class="font-medium text-slate-800">{{ auth.roleLabel }}</dd></div>
        <div v-if="auth.session"><dt class="text-slate-500">Expira</dt><dd class="font-medium text-slate-800">{{ new Date(auth.session.expiresAt).toLocaleString('es-PY') }}</dd></div>
        <div v-if="auth.session"><dt class="text-slate-500">Inactividad</dt><dd class="font-medium text-slate-800">{{ auth.session.idleMinutes }} min</dd></div>
      </dl>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="module in visibleModules"
        :key="module.to"
        :to="module.to"
        class="sgl-card transition hover:border-sgl-500"
      >
        <p class="text-sm font-semibold text-slate-900">{{ module.label }}</p>
        <p class="mt-1 text-sm text-slate-500">{{ module.description }}</p>
      </RouterLink>
    </div>
  </div>
</template>
