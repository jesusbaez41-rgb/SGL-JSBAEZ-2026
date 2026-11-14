<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { labsApi, type Lab } from '../../api/labs.api'
import {
  policiesApi,
  type LockdownConfig,
  type Policy,
  type PolicyApp,
  type PolicyMatrix,
} from '../../api/policies.api'
import { useAuthStore } from '../../stores/auth.store'
import {
  appsSinRuta,
  estadoBadgeClass,
  estadoLabel,
  formatDateTime,
  gruposHabilitados,
  matrizVacia,
  politicaActiva,
  resumenDespliegue,
  resumenGrupos,
  resumenTexto,
  totalReglas,
} from '../../utils/policiesLogic'

const auth = useAuthStore()

const labs = ref<Lab[]>([])
const labId = ref('')
const matriz = ref<PolicyMatrix | null>(null)
const politicas = ref<Policy[]>([])
const seleccionada = ref<Policy | null>(null)
const bloqueo = ref<LockdownConfig | null>(null)
const guardandoBloqueo = ref(false)
const loading = ref(true)
const saving = ref(false)
const generando = ref(false)
const desplegando = ref(false)
const error = ref('')
const success = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const canManage = computed(() => auth.can('policies:manage'))
const sinRuta = computed(() => (matriz.value ? appsSinRuta(matriz.value.apps) : []))
const reglas = computed(() => (matriz.value ? totalReglas(matriz.value.apps) : 0))
const vacia = computed(() =>
  matriz.value ? matrizVacia(matriz.value.grupos, matriz.value.apps) : true,
)

async function cargarMatriz() {
  if (!labId.value) return
  error.value = ''
  try {
    matriz.value = await policiesApi.matriz(labId.value)
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo cargar la matriz de permisos.'
  }
}

const RESTRICCIONES = [
  { key: 'taskmgr', label: 'Administrador de tareas' },
  { key: 'control_panel', label: 'Panel de control' },
  { key: 'registry', label: 'Editor del registro' },
  { key: 'run', label: 'Diálogo Ejecutar (Win+R)' },
  { key: 'drives', label: 'Ver unidades (C:, USB)' },
  { key: 'context_menu', label: 'Menú contextual' },
  { key: 'shutdown', label: 'Apagar / reiniciar / cerrar sesión' },
  { key: 'cmd', label: 'Bloquear CMD (no recomendado: corta node/git)' },
  { key: 'powershell', label: 'Bloquear PowerShell (no recomendado)' },
]

async function cargarBloqueo() {
  if (!labId.value) return
  try {
    bloqueo.value = (await policiesApi.bloqueo(labId.value)).config
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo cargar el bloqueo.'
  }
}

async function guardarBloqueo() {
  if (!bloqueo.value || !labId.value) return
  guardandoBloqueo.value = true
  error.value = ''
  success.value = ''
  try {
    bloqueo.value = (await policiesApi.setBloqueo(labId.value, bloqueo.value)).config
    success.value = 'Configuración de bloqueo guardada. Regenerá la política para aplicarla.'
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo guardar el bloqueo.'
  } finally {
    guardandoBloqueo.value = false
  }
}

async function cargarPoliticas() {
  try {
    politicas.value = await policiesApi.list()
    if (!seleccionada.value && politicas.value.length) {
      seleccionada.value = await policiesApi.get(politicas.value[0].id)
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar las políticas.'
  }
}

async function toggle(app: PolicyApp, grupoId: string) {
  if (!canManage.value) return
  const nuevo = !app.permisos[grupoId]
  app.permisos[grupoId] = nuevo
  saving.value = true
  error.value = ''
  try {
    await policiesApi.setPermiso({
      vinculo_id: app.vinculo_id,
      grupo_id: grupoId,
      habilitado: nuevo,
    })
    success.value = `Permiso ${nuevo ? 'habilitado' : 'deshabilitado'} para ${app.nombre}.`
  } catch (e: any) {
    app.permisos[grupoId] = !nuevo
    error.value = e?.response?.data?.error || 'No se pudo guardar el permiso.'
  } finally {
    saving.value = false
  }
}

async function generar() {
  if (!labId.value) return
  generando.value = true
  error.value = ''
  success.value = ''
  try {
    const politica = await policiesApi.generar(labId.value)
    seleccionada.value = politica
    success.value = `Política generada (versión ${politica.version}).`
    await cargarPoliticas()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo generar la política.'
  } finally {
    generando.value = false
  }
}

async function desplegar(politica: Policy) {
  desplegando.value = true
  error.value = ''
  success.value = ''
  try {
    seleccionada.value = await policiesApi.desplegar(politica.id)
    success.value = 'Política enviada a los equipos del laboratorio.'
    arrancarRefresco()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo desplegar la política.'
  } finally {
    desplegando.value = false
  }
}

async function refrescarSeleccionada() {
  if (!seleccionada.value) return
  try {
    seleccionada.value = await policiesApi.get(seleccionada.value.id)
  } catch {
    /* ignorar */
  }
}

function arrancarRefresco() {
  detenerRefresco()
  if (!seleccionada.value || !politicaActiva(seleccionada.value)) return
  timer = setInterval(refrescarSeleccionada, 2000)
}

function detenerRefresco() {
  if (timer) clearInterval(timer)
  timer = null
}

watch(labId, async () => {
  seleccionada.value = null
  await cargarMatriz()
  await cargarBloqueo()
})

onMounted(async () => {
  loading.value = true
  try {
    labs.value = await labsApi.list()
    if (labs.value.length) labId.value = labs.value[0].id
    await cargarMatriz()
    await cargarBloqueo()
    await cargarPoliticas()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar los datos.'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(detenerRefresco)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Políticas de aplicaciones</h2>
        <p class="text-sm text-slate-500">
          Permisos por grupo y despliegue de reglas AppLocker a las PCs del laboratorio.
        </p>
      </div>
      <div class="flex items-end gap-2">
        <div>
          <label class="mb-1 block text-xs font-medium text-slate-600" for="pol-lab">
            Laboratorio
          </label>
          <select id="pol-lab" v-model="labId" class="sgl-input">
            <option v-for="lab in labs" :key="lab.id" :value="lab.id">{{ lab.nombre }}</option>
          </select>
        </div>
        <button
          v-if="canManage"
          class="sgl-btn"
          type="button"
          :disabled="generando || vacia"
          @click="generar"
        >
          {{ generando ? 'Generando…' : 'Generar política' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {{ error }}
    </p>
    <p v-if="success" class="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
      {{ success }}
    </p>

    <div v-if="loading" class="text-sm text-slate-500">Cargando…</div>

    <div v-else class="space-y-6">
      <section class="sgl-card overflow-x-auto p-0">
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">Permisos por grupo</h3>
            <p class="text-xs text-slate-500">
              Al vincular una app ningún grupo tiene permiso: marcalo explícitamente (RN-008).
            </p>
          </div>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {{ reglas }} permiso(s) activo(s)
          </span>
        </div>

        <table v-if="matriz" class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Aplicación</th>
              <th
                v-for="grupo in matriz.grupos"
                :key="grupo.id"
                class="px-4 py-3 text-center font-semibold text-slate-600"
              >
                {{ grupo.codigo }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="app in matriz.apps" :key="app.vinculo_id">
              <td class="px-4 py-3">
                <p class="font-medium text-slate-800">{{ app.nombre }}</p>
                <p class="font-mono text-xs text-slate-500">v{{ app.version }}</p>
                <p v-if="!app.ruta_ejecutable" class="mt-0.5 text-[11px] text-amber-700">
                  Sin ruta de ejecutable: no se puede incluir en AppLocker.
                </p>
              </td>
              <td
                v-for="grupo in matriz.grupos"
                :key="grupo.id"
                class="px-4 py-3 text-center"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-blue-600"
                  :checked="Boolean(app.permisos[grupo.id])"
                  :disabled="!canManage || saving"
                  @change="toggle(app, grupo.id)"
                />
              </td>
            </tr>
            <tr v-if="vacia">
              <td :colspan="(matriz?.grupos.length || 0) + 1" class="px-4 py-6 text-center text-sm text-slate-500">
                No hay aplicaciones vinculadas o grupos registrados.
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="bloqueo" class="sgl-card space-y-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">Bloqueo de estudiantes</h3>
            <p class="text-xs text-slate-500">
              Se aplica al iniciar sesión, solo a los grupos SGL. El administrador queda exento.
            </p>
          </div>
          <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input v-model="bloqueo.activo" type="checkbox" class="h-4 w-4" :disabled="!canManage" />
            Activo
          </label>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="restriccion in RESTRICCIONES"
            :key="restriccion.key"
            class="flex items-center gap-2 text-sm text-slate-700"
          >
            <input
              v-model="bloqueo.restricciones[restriccion.key]"
              type="checkbox"
              class="h-4 w-4"
              :disabled="!canManage"
            />
            {{ restriccion.label }}
          </label>
        </div>

        <p class="text-xs text-slate-500">
          Navegadores permitidos:
          <span class="font-mono">{{ bloqueo.navegadores.join(', ') }}</span>
        </p>
        <p class="text-xs text-slate-500">
          Programación permitida:
          <span class="font-mono">{{ bloqueo.programacion.join(', ') }}</span>
        </p>

        <div class="flex justify-end">
          <button
            v-if="canManage"
            class="sgl-btn px-3 py-1.5 text-xs"
            type="button"
            :disabled="guardandoBloqueo"
            @click="guardarBloqueo"
          >
            {{ guardandoBloqueo ? 'Guardando…' : 'Guardar bloqueo' }}
          </button>
        </div>
      </section>

      <p
        v-if="sinRuta.length"
        class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800"
        role="status"
      >
        {{ sinRuta.length }} app(s) tienen permisos pero no ruta de ejecutable; se excluyen de la
        política: {{ sinRuta.map((app) => app.nombre).join(', ') }}.
      </p>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-slate-900">Políticas generadas</h3>
        <p v-if="politicas.length === 0" class="sgl-card px-4 py-6 text-center text-sm text-slate-500">
          Todavía no hay políticas generadas.
        </p>

        <article v-for="politica in politicas" :key="politica.id" class="sgl-card p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-slate-900">
                {{ politica.laboratorio?.nombre || 'Laboratorio' }} · versión
                <span class="font-mono">{{ politica.version }}</span>
              </p>
              <p class="mt-0.5 text-xs text-slate-500">
                {{ formatDateTime(politica.fecha_generacion) }} · {{ resumenGrupos(politica) }}
              </p>
              <p v-if="politica.resumen?.apps_sin_ruta?.length" class="mt-1 text-xs text-amber-700">
                Excluidas por falta de ruta: {{ politica.resumen.apps_sin_ruta.join(', ') }}
              </p>
            </div>
            <div class="flex gap-2">
              <button
                class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                type="button"
                @click="seleccionada = politica"
              >
                Ver detalle
              </button>
              <button
                v-if="canManage"
                class="sgl-btn px-3 py-1.5 text-xs"
                type="button"
                :disabled="desplegando"
                @click="desplegar(politica)"
              >
                Desplegar
              </button>
            </div>
          </div>

          <div
            v-if="seleccionada && seleccionada.id === politica.id"
            class="mt-4 space-y-3 border-t border-slate-100 pt-3"
          >
            <div class="flex items-center justify-between text-xs text-slate-500">
              <span>{{ resumenTexto(resumenDespliegue(seleccionada.despliegues)) }}</span>
              <span v-if="politicaActiva(seleccionada)">Actualizando…</span>
            </div>

            <table class="min-w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-4 py-2 text-left font-semibold text-slate-600">Equipo</th>
                  <th class="px-4 py-2 text-left font-semibold text-slate-600">Estado</th>
                  <th class="px-4 py-2 text-left font-semibold text-slate-600">Detalle</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="equipo in seleccionada.despliegues" :key="equipo.id">
                  <td class="px-4 py-2">
                    <p class="font-medium text-slate-800">{{ equipo.hostname || equipo.equipo_id }}</p>
                    <p class="font-mono text-[11px] text-slate-500">{{ equipo.mac_address }}</p>
                  </td>
                  <td class="px-4 py-2">
                    <span
                      class="rounded-full px-2.5 py-1 text-xs font-medium"
                      :class="estadoBadgeClass(equipo.estado)"
                    >
                      {{ estadoLabel(equipo.estado) }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-xs text-slate-500">
                    {{ equipo.mensaje_error || equipo.salida || '—' }}
                  </td>
                </tr>
                <tr v-if="!seleccionada.despliegues?.length">
                  <td colspan="3" class="px-4 py-4 text-center text-sm text-slate-500">
                    Todavía no se desplegó esta política.
                  </td>
                </tr>
              </tbody>
            </table>

            <details class="rounded-lg border border-slate-200">
              <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">
                Ver XML de AppLocker
              </summary>
              <pre class="max-h-64 overflow-auto rounded-b-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100">{{ seleccionada.contenido }}</pre>
            </details>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>
