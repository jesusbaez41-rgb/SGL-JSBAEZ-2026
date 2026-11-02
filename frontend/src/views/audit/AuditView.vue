<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { auditApi, type AuthEvent } from '../../api/audit.api'

const events = ref<AuthEvent[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    events.value = await auditApi.events(200)
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo cargar la auditoría'
  } finally {
    loading.value = false
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-PY')
}

function actionClass(action: string) {
  if (action === 'LOGIN') return 'bg-emerald-50 text-emerald-700'
  if (action === 'LOGOUT') return 'bg-slate-100 text-slate-600'
  if (action === 'ACCESO_DENEGADO') return 'bg-red-50 text-red-700'
  return 'bg-amber-50 text-amber-700'
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Auditoría de acceso</h2>
        <p class="text-sm text-slate-500">
          Inicios y cierres de sesión, intentos fallidos y accesos denegados (CA-12).
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

    <div v-else class="sgl-card overflow-x-auto p-0">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Fecha</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Usuario</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Rol</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Acción</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Resultado</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">IP</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="event in events" :key="event.id">
            <td class="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
              {{ formatDate(event.fecha_evento) }}
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-700">{{ event.uid_intentado }}</td>
            <td class="px-4 py-3 text-slate-600">{{ event.rol || '—' }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="actionClass(event.accion)">
                {{ event.accion }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span
                class="text-xs font-semibold"
                :class="event.resultado === 'EXITO' ? 'text-emerald-600' : 'text-red-600'"
              >
                {{ event.resultado }}
              </span>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600">{{ event.ip_origen || '—' }}</td>
          </tr>
          <tr v-if="events.length === 0">
            <td colspan="6" class="px-4 py-6 text-center text-sm text-slate-500">
              Todavía no hay eventos registrados.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
