<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  auditApi,
  type AuditLog,
  type AuditLogFilters,
  type AuthEvent,
} from '../../api/audit.api'
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  EMPTY_FILTERS,
  actionClass,
  actionLabel,
  buildAuditParams,
  detailPreview,
  entityLabel,
  formatAuditDate,
  hasFilters,
  pageInfo,
  type AuditFilterState,
} from '../../utils/auditLogic'

const activeTab = ref<'logs' | 'events'>('logs')

const logs = ref<AuditLog[]>([])
const total = ref(0)
const limit = ref(50)
const offset = ref(0)
const loadingLogs = ref(false)
const logsError = ref('')

const filters = reactive<AuditFilterState>({ ...EMPTY_FILTERS })
const appliedFilters = reactive<AuditFilterState>({ ...EMPTY_FILTERS })
const ocultarSync = ref(true)
const selected = ref<AuditLog | null>(null)

const events = ref<AuthEvent[]>([])
const loadingEvents = ref(false)
const eventsError = ref('')

const page = computed(() => pageInfo(offset.value, limit.value, total.value))
const filtrosActivos = computed(() => hasFilters(appliedFilters))

async function loadLogs() {
  loadingLogs.value = true
  logsError.value = ''
  try {
    const params: AuditLogFilters = buildAuditParams(
      appliedFilters,
      limit.value,
      offset.value,
      ocultarSync.value,
    )
    const respuesta = await auditApi.logs(params)
    logs.value = respuesta.data
    total.value = respuesta.total
  } catch (e: any) {
    logsError.value = e?.response?.data?.error || 'No se pudo cargar la auditoría.'
  } finally {
    loadingLogs.value = false
  }
}

function buscar() {
  Object.assign(appliedFilters, filters)
  offset.value = 0
  loadLogs()
}

function limpiar() {
  Object.assign(filters, EMPTY_FILTERS)
  Object.assign(appliedFilters, EMPTY_FILTERS)
  offset.value = 0
  loadLogs()
}

function cambiarSync() {
  offset.value = 0
  loadLogs()
}

function anterior() {
  if (offset.value === 0) return
  offset.value = Math.max(offset.value - limit.value, 0)
  loadLogs()
}

function siguiente() {
  if (offset.value + limit.value >= total.value) return
  offset.value += limit.value
  loadLogs()
}

async function loadEvents() {
  loadingEvents.value = true
  eventsError.value = ''
  try {
    events.value = await auditApi.events(200)
  } catch (e: any) {
    eventsError.value = e?.response?.data?.error || 'No se pudo cargar la auditoría de acceso.'
  } finally {
    loadingEvents.value = false
  }
}

function verDetalle(log: AuditLog) {
  selected.value = log
}

onMounted(() => {
  loadLogs()
  loadEvents()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Auditoría y trazabilidad</h2>
        <p class="text-sm text-slate-500">
          Registro inmutable de acciones administrativas y de acceso (RN-010, RNF-020).
        </p>
      </div>
      <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        Solo lectura · inmutable
      </span>
    </div>

    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-lg px-3 py-2 text-sm font-medium transition"
        :class="
          activeTab === 'logs'
            ? 'bg-sgl-600 text-white'
            : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
        "
        @click="activeTab = 'logs'"
      >
        Acciones administrativas
      </button>
      <button
        type="button"
        class="rounded-lg px-3 py-2 text-sm font-medium transition"
        :class="
          activeTab === 'events'
            ? 'bg-sgl-600 text-white'
            : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
        "
        @click="activeTab = 'events'"
      >
        Accesos
      </button>
    </div>

    <template v-if="activeTab === 'logs'">
      <section class="sgl-card space-y-4 p-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label class="text-sm">
            <span class="mb-1 block font-medium text-slate-700">Acción</span>
            <select v-model="filters.accion" class="sgl-input w-full">
              <option value="">Todas</option>
              <option v-for="accion in AUDIT_ACTIONS" :key="accion" :value="accion">
                {{ actionLabel(accion) }}
              </option>
            </select>
          </label>

          <label class="text-sm">
            <span class="mb-1 block font-medium text-slate-700">Entidad</span>
            <select v-model="filters.entidad" class="sgl-input w-full">
              <option value="">Todas</option>
              <option v-for="entidad in AUDIT_ENTITIES" :key="entidad.value" :value="entidad.value">
                {{ entidad.label }}
              </option>
            </select>
          </label>

          <label class="text-sm">
            <span class="mb-1 block font-medium text-slate-700">Usuario</span>
            <input
              v-model="filters.usuario"
              class="sgl-input w-full"
              placeholder="uid o nombre"
              @keyup.enter="buscar"
            />
          </label>

          <label class="text-sm">
            <span class="mb-1 block font-medium text-slate-700">Desde</span>
            <input v-model="filters.desde" type="date" class="sgl-input w-full" />
          </label>

          <label class="text-sm">
            <span class="mb-1 block font-medium text-slate-700">Hasta</span>
            <input v-model="filters.hasta" type="date" class="sgl-input w-full" />
          </label>

          <label class="text-sm">
            <span class="mb-1 block font-medium text-slate-700">Buscar en el detalle</span>
            <input
              v-model="filters.q"
              class="sgl-input w-full"
              placeholder="app, equipo, IP…"
              @keyup.enter="buscar"
            />
          </label>

          <label class="flex items-end gap-2 pb-2 text-sm text-slate-700">
            <input
              v-model="ocultarSync"
              type="checkbox"
              class="h-4 w-4"
              @change="cambiarSync"
            />
            Ocultar sincronizaciones de inventario
          </label>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs text-slate-500">
            <template v-if="filtrosActivos">Filtros aplicados.</template>
            <template v-else>Mostrando las acciones más recientes.</template>
          </p>
          <div class="flex gap-2">
            <button class="sgl-btn px-3 py-1.5 text-xs" type="button" :disabled="loadingLogs" @click="buscar">
              Buscar
            </button>
            <button
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              type="button"
              :disabled="loadingLogs"
              @click="limpiar"
            >
              Limpiar
            </button>
          </div>
        </div>
      </section>

      <p v-if="logsError" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ logsError }}</p>
      <div v-if="loadingLogs" class="text-sm text-slate-500">Cargando auditoría…</div>

      <div v-else class="sgl-card overflow-x-auto p-0">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Fecha</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Usuario</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Acción</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Entidad</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Contexto</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">IP</th>
              <th class="px-4 py-3 text-right font-semibold text-slate-600">Detalle</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="log in logs" :key="log.id">
              <td class="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                {{ formatAuditDate(log.fecha_evento) }}
              </td>
              <td class="px-4 py-3">
                <p class="font-mono text-xs text-slate-800">{{ log.usuario?.uid || '—' }}</p>
                <p class="text-xs text-slate-500">
                  {{ log.usuario?.nombre_completo || '—' }}
                  <span v-if="log.usuario?.rol">· {{ log.usuario.rol }}</span>
                </p>
                <p v-if="log.detalle?.['origen'] === 'SISTEMA'" class="text-xs font-medium text-amber-600">
                  Sistema
                </p>
              </td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="actionClass(log.accion)">
                  {{ actionLabel(log.accion) }}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-700">
                <p>{{ entityLabel(log.entidad_afectada) }}</p>
                <p v-if="log.entidad_id" class="font-mono text-xs text-slate-400" :title="log.entidad_id">
                  {{ log.entidad_id.slice(0, 8) }}…
                </p>
              </td>
              <td class="px-4 py-3 text-xs text-slate-600">
                <p v-if="log.laboratorio">Lab: {{ log.laboratorio.nombre }}</p>
                <p v-if="log.equipo">Equipo: {{ log.equipo.hostname }}</p>
                <p v-if="!log.laboratorio && !log.equipo" class="text-slate-400">—</p>
              </td>
              <td class="px-4 py-3 font-mono text-xs text-slate-600">{{ log.ip_origen || '—' }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  class="text-xs font-medium text-sgl-700 hover:underline"
                  type="button"
                  @click="verDetalle(log)"
                >
                  Ver
                </button>
              </td>
            </tr>
            <tr v-if="logs.length === 0">
              <td colspan="7" class="px-4 py-6 text-center text-sm text-slate-500">
                No hay registros para los filtros seleccionados.
              </td>
            </tr>
          </tbody>
        </table>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>
            <template v-if="total">Mostrando {{ page.from }}–{{ page.to }} de {{ total }}</template>
            <template v-else>Sin registros</template>
          </span>
          <div class="flex items-center gap-2">
            <button
              class="rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              type="button"
              :disabled="offset === 0 || loadingLogs"
              @click="anterior"
            >
              Anterior
            </button>
            <span>Página {{ page.page }} de {{ page.pages || 1 }}</span>
            <button
              class="rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              type="button"
              :disabled="offset + limit >= total || loadingLogs"
              @click="siguiente"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex justify-end">
        <button
          class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          :disabled="loadingEvents"
          @click="loadEvents"
        >
          Actualizar
        </button>
      </div>

      <p v-if="eventsError" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ eventsError }}</p>
      <div v-if="loadingEvents" class="text-sm text-slate-500">Cargando accesos…</div>

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
                {{ formatAuditDate(event.fecha_evento) }}
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
    </template>

    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="selected = null"
    >
      <div class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">Detalle de auditoría</h3>
            <p class="mt-1 text-xs text-slate-500">
              {{ formatAuditDate(selected.fecha_evento) }} · {{ selected.usuario?.uid || '—' }}
            </p>
          </div>
          <button
            class="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
            type="button"
            @click="selected = null"
          >
            Cerrar
          </button>
        </div>

        <dl class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-xs uppercase text-slate-400">Acción</dt>
            <dd class="font-medium text-slate-800">{{ actionLabel(selected.accion) }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase text-slate-400">Entidad</dt>
            <dd class="text-slate-800">{{ entityLabel(selected.entidad_afectada) }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase text-slate-400">Laboratorio</dt>
            <dd class="text-slate-800">{{ selected.laboratorio?.nombre || '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase text-slate-400">Equipo</dt>
            <dd class="text-slate-800">{{ selected.equipo?.hostname || '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase text-slate-400">IP</dt>
            <dd class="font-mono text-xs text-slate-700">{{ selected.ip_origen || '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase text-slate-400">Registro</dt>
            <dd class="text-slate-800">{{ selected.inmutable ? 'Inmutable' : '—' }}</dd>
          </div>
        </dl>

        <div class="mt-4">
          <p class="mb-1 text-xs uppercase text-slate-400">Detalle</p>
          <pre class="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ JSON.stringify(selected.detalle, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
