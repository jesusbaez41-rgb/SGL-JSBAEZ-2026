<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { labsApi, type Lab } from '../../api/labs.api'
import {
  whitelistsApi,
  type NavigationConfig,
  type NavigationGenerated,
  type WhitelistEntry,
  type WhitelistOverview,
} from '../../api/whitelists.api'
import { useAuthStore } from '../../stores/auth.store'
import { estadoBadgeClass, estadoLabel, formatDateTime, resumenDespliegue, resumenTexto } from '../../utils/policiesLogic'
import {
  dominiosDeGrupo,
  entradasDeGrupo,
  etiquetaProxy,
  mensajeValidacion,
  normalizarDominio,
  resumenLista,
} from '../../utils/whitelistsLogic'

const auth = useAuthStore()

const resumen = ref<WhitelistOverview | null>(null)
const config = ref<NavigationConfig | null>(null)
const labs = ref<Lab[]>([])
const labId = ref('')
const grupoId = ref('')
const generadas = ref<NavigationGenerated[]>([])
const seleccionada = ref<NavigationGenerated | null>(null)
const nuevoDominio = ref('')
const nuevaDescripcion = ref('')
const edicion = ref<{ id: string; url: string; descripcion: string } | null>(null)
const loading = ref(true)
const guardando = ref(false)
const generando = ref(false)
const desplegando = ref(false)
const sincronizando = ref(false)
const error = ref('')
const success = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const canManage = computed(() => auth.can('whitelists:manage'))
const grupos = computed(() => resumen.value?.grupos ?? [])
const entradas = computed(() => resumen.value?.entradas ?? [])
const grupoActual = computed(() => grupos.value.find((grupo) => grupo.id === grupoId.value) || null)
const entradasActuales = computed(() => (grupoId.value ? entradasDeGrupo(entradas.value, grupoId.value) : []))
const dominiosActuales = computed(() =>
  grupoId.value ? dominiosDeGrupo(entradas.value, grupoId.value) : [],
)

async function cargar() {
  error.value = ''
  try {
    resumen.value = await whitelistsApi.list()
    config.value = await whitelistsApi.config()
    if (!grupoId.value && grupos.value.length) grupoId.value = grupos.value[0].id
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar las listas blancas.'
  }
}

async function cargarGeneradas() {
  try {
    generadas.value = await whitelistsApi.generadas()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudieron cargar las configuraciones generadas.'
  }
}

async function agregar() {
  if (!grupoId.value) return
  const aviso = mensajeValidacion(nuevoDominio.value)
  if (aviso) {
    error.value = aviso
    return
  }
  guardando.value = true
  error.value = ''
  success.value = ''
  try {
    const entrada = await whitelistsApi.crear({
      grupo_id: grupoId.value,
      url: normalizarDominio(nuevoDominio.value),
      descripcion: nuevaDescripcion.value.trim() || undefined,
    })
    resumen.value?.entradas.push(entrada)
    nuevoDominio.value = ''
    nuevaDescripcion.value = ''
    success.value = 'Dominio agregado. La configuración se está redesplegando (CA-09).'
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo agregar el dominio.'
  } finally {
    guardando.value = false
  }
}

function empezarEdicion(entrada: WhitelistEntry) {
  edicion.value = { id: entrada.id, url: entrada.url, descripcion: entrada.descripcion || '' }
}

async function guardarEdicion(entrada: WhitelistEntry) {
  if (!edicion.value) return
  guardando.value = true
  error.value = ''
  success.value = ''
  try {
    const actualizada = await whitelistsApi.actualizar(edicion.value.id, {
      url: normalizarDominio(edicion.value.url),
      descripcion: edicion.value.descripcion,
    })
    Object.assign(entrada, actualizada)
    edicion.value = null
    success.value = 'Dominio actualizado. La configuración se está redesplegando (CA-09).'
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo actualizar el dominio.'
  } finally {
    guardando.value = false
  }
}

async function alternar(entrada: WhitelistEntry) {
  if (!canManage.value) return
  const anterior = entrada.activa
  entrada.activa = !anterior
  try {
    await whitelistsApi.actualizar(entrada.id, { activa: entrada.activa })
  } catch (e: any) {
    entrada.activa = anterior
    error.value = e?.response?.data?.error || 'No se pudo cambiar el estado.'
  }
}

async function eliminar(entrada: WhitelistEntry) {
  if (!canManage.value) return
  if (!window.confirm(`¿Eliminar ${entrada.url} de la lista blanca?`)) return
  error.value = ''
  success.value = ''
  try {
    await whitelistsApi.eliminar(entrada.id)
    if (resumen.value) {
      resumen.value.entradas = resumen.value.entradas.filter((item) => item.id !== entrada.id)
    }
    success.value = 'Dominio eliminado. La configuración se está redesplegando (CA-09).'
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo eliminar el dominio.'
  }
}

async function generar() {
  if (!labId.value) return
  generando.value = true
  error.value = ''
  success.value = ''
  try {
    const fila = await whitelistsApi.generar(labId.value)
    seleccionada.value = fila
    success.value = `Configuración generada (versión ${fila.version}).`
    await cargarGeneradas()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo generar la configuración.'
  } finally {
    generando.value = false
  }
}

async function desplegar(fila: NavigationGenerated) {
  desplegando.value = true
  error.value = ''
  success.value = ''
  try {
    seleccionada.value = await whitelistsApi.desplegar(fila.id)
    success.value = 'Configuración enviada a los equipos del laboratorio.'
    arrancarRefresco()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo desplegar la configuración.'
  } finally {
    desplegando.value = false
  }
}

async function sincronizar() {
  sincronizando.value = true
  error.value = ''
  success.value = ''
  try {
    const data = await whitelistsApi.sincronizar()
    success.value = `Sincronización manual completada en ${data.laboratorios.length} laboratorio(s).`
    await cargarGeneradas()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo sincronizar la configuración.'
  } finally {
    sincronizando.value = false
  }
}

function hayDespliegueActivo(fila: NavigationGenerated | null): boolean {
  if (!fila?.despliegues?.length) return false
  return fila.despliegues.some(
    (equipo) => equipo.estado === 'PENDIENTE' || equipo.estado === 'EN_PROCESO',
  )
}

async function refrescarSeleccionada() {
  if (!seleccionada.value) return
  try {
    seleccionada.value = await whitelistsApi.get(seleccionada.value.id)
    if (!hayDespliegueActivo(seleccionada.value)) detenerRefresco()
  } catch {
    /* ignorar */
  }
}

function arrancarRefresco() {
  detenerRefresco()
  timer = setInterval(refrescarSeleccionada, 2000)
}

function detenerRefresco() {
  if (timer) clearInterval(timer)
  timer = null
}

onMounted(async () => {
  loading.value = true
  try {
    const [labsData] = await Promise.all([labsApi.list(), cargar(), cargarGeneradas()])
    labs.value = labsData
    if (labs.value.length) labId.value = labs.value[0].id
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
        <h2 class="text-xl font-bold text-slate-900">Listas blancas de navegación</h2>
        <p class="text-sm text-slate-500">
          URLs permitidas por grupo (RN-016). El estudiante navega solo por la unión de las listas
          de sus grupos; todo lo demás se bloquea.
        </p>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="mb-1 block text-xs font-medium text-slate-600" for="nav-lab">
            Laboratorio
          </label>
          <select id="nav-lab" v-model="labId" class="sgl-input">
            <option v-for="lab in labs" :key="lab.id" :value="lab.id">{{ lab.nombre }}</option>
          </select>
        </div>
        <button
          v-if="canManage"
          class="sgl-btn"
          type="button"
          :disabled="generando || !labId"
          @click="generar"
        >
          {{ generando ? 'Generando…' : 'Generar y desplegar' }}
        </button>
        <button
          v-if="canManage"
          class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          :disabled="sincronizando"
          @click="sincronizar"
        >
          {{ sincronizando ? 'Sincronizando…' : 'Sincronizar todo' }}
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
      <section class="sgl-card space-y-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">Filtrado activo</h3>
            <p class="text-xs text-slate-500">
              {{ etiquetaProxy(config?.proxy) }} · sesión válida por
              {{ config?.sesion_horas ?? 0 }} h.
            </p>
          </div>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {{ resumenLista(grupos, entradas) }}
          </span>
        </div>
        <p class="text-xs text-slate-500">
          Las PCs bloquean la salida directa a Internet (HTTP/HTTPS, QUIC, DNS externo y VPN) y
          navegan únicamente por el proxy del servidor, que aplica la lista del grupo del usuario
          en sesión.
        </p>
      </section>

      <section class="sgl-card overflow-hidden p-0">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">Dominios permitidos</h3>
            <p class="text-xs text-slate-500">
              {{ grupoActual ? grupoActual.codigo : 'Sin grupo' }} ·
              {{ dominiosActuales.length }} dominio(s) activo(s)
            </p>
          </div>
          <div class="flex items-end gap-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-600" for="nav-grupo">Grupo</label>
              <select id="nav-grupo" v-model="grupoId" class="sgl-input">
                <option v-for="grupo in grupos" :key="grupo.id" :value="grupo.id">
                  {{ grupo.codigo }} ({{ grupo.dominios }})
                </option>
              </select>
            </div>
          </div>
        </div>

        <form
          v-if="canManage"
          class="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3"
          @submit.prevent="agregar"
        >
          <div class="min-w-[16rem] flex-1">
            <label class="mb-1 block text-xs font-medium text-slate-600" for="nav-url">URL o dominio</label>
            <input
              id="nav-url"
              v-model="nuevoDominio"
              class="sgl-input w-full"
              placeholder="ejemplo.com"
              autocomplete="off"
            />
          </div>
          <div class="min-w-[14rem] flex-1">
            <label class="mb-1 block text-xs font-medium text-slate-600" for="nav-desc">Descripción</label>
            <input
              id="nav-desc"
              v-model="nuevaDescripcion"
              class="sgl-input w-full"
              placeholder="Opcional"
              autocomplete="off"
            />
          </div>
          <button class="sgl-btn" type="submit" :disabled="guardando">
            {{ guardando ? 'Guardando…' : 'Agregar' }}
          </button>
        </form>

        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Dominio</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Descripción</th>
              <th class="px-4 py-3 text-center font-semibold text-slate-600">Activa</th>
              <th class="px-4 py-3 text-right font-semibold text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="entrada in entradasActuales" :key="entrada.id">
              <td class="px-4 py-3 font-mono text-slate-800">
                <template v-if="edicion && edicion.id === entrada.id">
                  <input v-model="edicion.url" class="sgl-input w-full" />
                </template>
                <template v-else>{{ entrada.url }}</template>
              </td>
              <td class="px-4 py-3 text-slate-600">
                <template v-if="edicion && edicion.id === entrada.id">
                  <input v-model="edicion.descripcion" class="sgl-input w-full" />
                </template>
                <template v-else>{{ entrada.descripcion || '—' }}</template>
              </td>
              <td class="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-blue-600"
                  :checked="entrada.activa"
                  :disabled="!canManage"
                  @change="alternar(entrada)"
                />
              </td>
              <td class="px-4 py-3 text-right">
                <div v-if="canManage" class="flex justify-end gap-2">
                  <template v-if="edicion && edicion.id === entrada.id">
                    <button
                      class="sgl-btn px-3 py-1.5 text-xs"
                      type="button"
                      :disabled="guardando"
                      @click="guardarEdicion(entrada)"
                    >
                      Guardar
                    </button>
                    <button
                      class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                      type="button"
                      @click="edicion = null"
                    >
                      Cancelar
                    </button>
                  </template>
                  <template v-else>
                    <button
                      class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      type="button"
                      @click="empezarEdicion(entrada)"
                    >
                      Editar
                    </button>
                    <button
                      class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      type="button"
                      @click="eliminar(entrada)"
                    >
                      Eliminar
                    </button>
                  </template>
                </div>
              </td>
            </tr>
            <tr v-if="!entradasActuales.length">
              <td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500">
                El grupo no tiene dominios. Sin lista blanca, el estudiante no accede a Internet.
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-slate-900">Configuraciones generadas</h3>
        <p v-if="!generadas.length" class="sgl-card px-4 py-6 text-center text-sm text-slate-500">
          Todavía no se generó la configuración de navegación.
        </p>

        <article v-for="fila in generadas" :key="fila.id" class="sgl-card p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-slate-900">
                {{ fila.laboratorio?.nombre || 'Laboratorio' }} · versión
                <span class="font-mono">{{ fila.version }}</span>
              </p>
              <p class="mt-0.5 text-xs text-slate-500">
                {{ formatDateTime(fila.fecha_generacion) }} ·
                {{ fila.resumen?.dominios ?? 0 }} dominio(s) ·
                {{ fila.resumen?.sesiones ?? 0 }} sesión(es) ·
                {{ etiquetaProxy(fila.resumen?.proxy) }}
              </p>
            </div>
            <div class="flex gap-2">
              <button
                class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                type="button"
                @click="seleccionada = fila"
              >
                Ver detalle
              </button>
              <button
                v-if="canManage"
                class="sgl-btn px-3 py-1.5 text-xs"
                type="button"
                :disabled="desplegando"
                @click="desplegar(fila)"
              >
                Desplegar
              </button>
            </div>
          </div>

          <div
            v-if="seleccionada && seleccionada.id === fila.id"
            class="mt-4 space-y-3 border-t border-slate-100 pt-3"
          >
            <div class="flex items-center justify-between text-xs text-slate-500">
              <span>{{ resumenTexto(resumenDespliegue(seleccionada.despliegues || [])) }}</span>
              <span v-if="hayDespliegueActivo(seleccionada)">Actualizando…</span>
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
                    Todavía no se desplegó esta configuración.
                  </td>
                </tr>
              </tbody>
            </table>

            <details class="rounded-lg border border-slate-200">
              <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">
                Ver squid.conf generado
              </summary>
              <pre class="max-h-64 overflow-auto rounded-b-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100">{{ seleccionada.config_squid }}</pre>
            </details>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>
