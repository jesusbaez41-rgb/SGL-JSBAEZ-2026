<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { deploymentsApi, type Deployment } from '../../api/deployments.api'
import {
  deploymentSubtitle,
  estaActivo,
  faseLabel,
  estadoBadgeClass,
  estadoLabel,
  formatDateTime,
  progreso,
  puedeReintentar,
  resumenTexto,
  tipoLabel,
} from '../../utils/deploymentsLogic'

const props = defineProps<{
  despliegue: Deployment
  canManage: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const actual = ref<Deployment>(props.despliegue)
const error = ref('')
const success = ref('')
const busy = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const resumen = computed(() => actual.value?.resumen)

async function refresh() {
  try {
    actual.value = await deploymentsApi.get(actual.value.id)
    emit('updated')
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo actualizar el estado.'
  }
}

async function reintentar(equipoId?: string) {
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const resultado = await deploymentsApi.retry(actual.value.id, { equipo_id: equipoId })
    actual.value = resultado.despliegue
    success.value =
      resultado.reintentados > 0
        ? `Se reintentaron ${resultado.reintentados} equipo(s).`
        : 'No hay equipos encendidos para reintentar por ahora.'
    emit('updated')
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo reintentar el despliegue.'
  } finally {
    busy.value = false
  }
}

// Mientras haya equipos sin estado final se refresca solo (CA-07).
function arrancar() {
  detener()
  if (!estaActivo(actual.value)) return
  timer = setInterval(refresh, 2000)
}

function detener() {
  if (timer) clearInterval(timer)
  timer = null
}

arrancar()
onBeforeUnmount(detener)
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div class="sgl-card w-full max-w-3xl space-y-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">
            {{ tipoLabel(actual.tipo) }} · {{ actual.app?.nombre }} {{ actual.app?.version }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">{{ deploymentSubtitle(actual) }}</p>
          <p class="mt-0.5 text-xs text-slate-400">
            {{ formatDateTime(actual.fecha_inicio) }}
            <span v-if="actual.fecha_fin"> → {{ formatDateTime(actual.fecha_fin) }}</span>
          </p>
        </div>
        <button
          class="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          type="button"
          aria-label="Cerrar"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {{ error }}
      </p>
      <p v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
        {{ success }}
      </p>

      <div>
        <div class="flex items-center justify-between text-xs text-slate-500">
          <span>{{ resumenTexto(resumen) }}</span>
          <span>{{ progreso(resumen) }}%</span>
        </div>
        <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            class="h-full rounded-full bg-emerald-500 transition-all"
            :style="{ width: `${progreso(resumen)}%` }"
          />
        </div>
      </div>

      <div class="rounded-xl border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Equipo</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Intentos</th>
              <th class="px-4 py-3 text-right font-semibold text-slate-600">Acción</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="equipo in actual.equipos" :key="equipo.id">
              <td class="px-4 py-3">
                <p class="font-medium text-slate-800">{{ equipo.hostname || equipo.equipo_id }}</p>
                <p class="font-mono text-xs text-slate-500">{{ equipo.mac_address }}</p>
                <p v-if="equipo.fase && equipo.estado === 'EN_PROCESO'" class="mt-1 text-xs text-blue-700">
                  {{ faseLabel(equipo.fase) }}
                </p>
                <p v-if="equipo.mensaje_error" class="mt-1 text-xs text-amber-700">
                  {{ equipo.mensaje_error }}
                </p>
              </td>
              <td class="px-4 py-3">
                <span
                  class="rounded-full px-2.5 py-1 text-xs font-medium"
                  :class="estadoBadgeClass(equipo.estado)"
                >
                  {{ estadoLabel(equipo.estado) }}
                </span>
                <p class="mt-1 text-[11px] text-slate-400">
                  {{ equipo.equipo_estado === 'ENCENDIDO' ? 'Equipo encendido' : 'Equipo apagado' }}
                </p>
              </td>
              <td class="px-4 py-3 text-xs text-slate-600">{{ equipo.intentos }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  v-if="canManage && (equipo.estado === 'PENDIENTE' || equipo.estado === 'FALLIDO')"
                  class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  :disabled="busy"
                  @click="reintentar(equipo.equipo_id)"
                >
                  Reintentar
                </button>
              </td>
            </tr>
            <tr v-if="!actual.equipos || !actual.equipos.length">
              <td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500">
                El laboratorio no tiene equipos registrados.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details v-if="actual.equipos.some((e) => e.salida)" class="rounded-xl border border-slate-200">
        <summary class="cursor-pointer px-4 py-2 text-xs font-medium text-slate-600">
          Ver la salida de los comandos remotos
        </summary>
        <div class="space-y-2 px-4 pb-3">
          <div v-for="equipo in actual.equipos.filter((e) => e.salida)" :key="equipo.id">
            <p class="font-mono text-[11px] text-slate-500">{{ equipo.hostname }}</p>
            <pre
              class="max-h-40 overflow-auto rounded-lg bg-slate-900 p-2 font-mono text-[11px] text-slate-100"
            >{{ equipo.salida }}</pre>
          </div>
        </div>
      </details>

      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-slate-400">
          Los equipos apagados quedan pendientes y se reintentan solos al encenderse.
        </p>
        <div class="flex gap-2">
          <button
            v-if="canManage && puedeReintentar(actual)"
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            type="button"
            :disabled="busy"
            @click="reintentar()"
          >
            Reintentar todos
          </button>
          <button
            class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            type="button"
            @click="emit('close')"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
