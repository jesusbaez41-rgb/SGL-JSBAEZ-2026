<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { dashboardApi, type DashboardSummary } from '../../api/dashboard.api'

const summary = ref<DashboardSummary | null>(null)
const loading = ref(true)
const error = ref('')

const cards = [
  { key: 'usuarios', label: 'Usuarios', color: 'bg-sgl-500' },
  { key: 'grupos', label: 'Grupos', color: 'bg-emerald-500' },
  { key: 'laboratorios', label: 'Laboratorios', color: 'bg-amber-500' },
  { key: 'equipos', label: 'Equipos', color: 'bg-rose-500' },
] as const

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
      <h2 class="text-xl font-bold text-slate-900">Panel principal</h2>
      <p class="text-sm text-slate-500">Resumen general del sistema.</p>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div v-for="card in cards" :key="card.key" class="sgl-card">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-slate-500">{{ card.label }}</p>
          <span class="h-2.5 w-2.5 rounded-full" :class="card.color"></span>
        </div>
        <p class="mt-3 text-3xl font-bold text-slate-900">
          {{ summary ? summary[card.key] : '—' }}
        </p>
      </div>
    </div>

    <div class="sgl-card">
      <h3 class="text-base font-semibold text-slate-900">Estado del stack</h3>
      <ul class="mt-3 space-y-2 text-sm text-slate-600">
        <li>Frontend Vue + Nginx: <span class="font-medium text-emerald-600">activo</span></li>
        <li>API Node/Express + Sequelize: <span class="font-medium text-emerald-600">activa</span></li>
        <li>PostgreSQL 16 con esquema SGL: <span class="font-medium text-emerald-600">conectado</span></li>
      </ul>
    </div>
  </div>
</template>
