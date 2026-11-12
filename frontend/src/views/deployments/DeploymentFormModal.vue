<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { appsApi, type AppRow } from '../../api/apps.api'
import { labsApi, type Lab } from '../../api/labs.api'
import { deploymentsApi, type Deployment } from '../../api/deployments.api'
import { validateDeploymentForm } from '../../utils/deploymentsLogic'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', despliegue: Deployment): void
}>()

const form = reactive({
  laboratorio_id: '',
  app_id: '',
  tipo: 'INSTALAR',
})

const labs = ref<Lab[]>([])
const apps = ref<AppRow[]>([])
const errors = reactive<Record<string, string>>({})
const serverError = ref('')
const loadingApps = ref(false)
const saving = ref(false)

const appsDisponibles = computed(() => apps.value)

async function cargarApps() {
  if (!form.laboratorio_id) {
    apps.value = []
    form.app_id = ''
    return
  }

  loadingApps.value = true
  try {
    // Solo las aplicaciones vinculadas al laboratorio (RN-002).
    apps.value = await appsApi.list({ laboratorio_id: form.laboratorio_id })
    if (form.app_id && !apps.value.some((app) => app.id === form.app_id)) {
      form.app_id = ''
    }
  } catch (e: any) {
    serverError.value = e?.response?.data?.error || 'No se pudieron cargar las aplicaciones.'
  } finally {
    loadingApps.value = false
  }
}

watch(() => form.laboratorio_id, cargarApps)

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key])
  Object.assign(errors, validateDeploymentForm(form))
  return Object.keys(errors).length === 0
}

async function submit() {
  serverError.value = ''
  if (!validate()) return

  saving.value = true
  try {
    const despliegue = await deploymentsApi.create({
      app_id: form.app_id,
      laboratorio_id: form.laboratorio_id,
      tipo: form.tipo as 'INSTALAR' | 'DESINSTALAR',
    })
    emit('created', despliegue)
  } catch (e: any) {
    serverError.value = e?.response?.data?.error || 'No se pudo crear el despliegue.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    labs.value = await labsApi.list()
  } catch (e: any) {
    serverError.value = e?.response?.data?.error || 'No se pudieron cargar los laboratorios.'
  }
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <form class="sgl-card w-full max-w-lg space-y-4" novalidate @submit.prevent="submit">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">Nuevo despliegue</h3>
          <p class="mt-1 text-sm text-slate-500">
            La orden se envía a todas las PCs del laboratorio; las que estén apagadas quedan
            pendientes y se reintentan al encenderse.
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

      <p v-if="serverError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {{ serverError }}
      </p>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="dep-lab">
          Laboratorio
        </label>
        <select
          id="dep-lab"
          v-model="form.laboratorio_id"
          class="sgl-input"
          :class="{ 'border-red-400': errors.laboratorio_id }"
        >
          <option value="">Elegí un laboratorio…</option>
          <option v-for="lab in labs" :key="lab.id" :value="lab.id">
            {{ lab.nombre }} · {{ lab.subred }}
          </option>
        </select>
        <p v-if="errors.laboratorio_id" class="mt-1 text-xs text-red-600">
          {{ errors.laboratorio_id }}
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="dep-app">
          Aplicación
        </label>
        <select
          id="dep-app"
          v-model="form.app_id"
          class="sgl-input"
          :class="{ 'border-red-400': errors.app_id }"
          :disabled="!form.laboratorio_id || loadingApps"
        >
          <option value="">
            {{ loadingApps ? 'Cargando…' : 'Elegí una aplicación vinculada…' }}
          </option>
          <option v-for="app in appsDisponibles" :key="app.id" :value="app.id">
            {{ app.nombre }} {{ app.version }}
          </option>
        </select>
        <p v-if="errors.app_id" class="mt-1 text-xs text-red-600">{{ errors.app_id }}</p>
        <p v-else-if="form.laboratorio_id && !loadingApps" class="mt-1 text-xs text-slate-400">
          Solo se listan las aplicaciones vinculadas a este laboratorio (RN-002).
        </p>
      </div>

      <div>
        <span class="mb-1 block text-sm font-medium text-slate-700">Acción</span>
        <div class="flex gap-2">
          <label
            class="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            :class="
              form.tipo === 'INSTALAR'
                ? 'border-blue-400 bg-blue-50 text-blue-800'
                : 'border-slate-300 text-slate-600'
            "
          >
            <input v-model="form.tipo" type="radio" value="INSTALAR" class="sr-only" />
            Instalar
          </label>
          <label
            class="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            :class="
              form.tipo === 'DESINSTALAR'
                ? 'border-amber-400 bg-amber-50 text-amber-800'
                : 'border-slate-300 text-slate-600'
            "
          >
            <input v-model="form.tipo" type="radio" value="DESINSTALAR" class="sr-only" />
            Desinstalar
          </label>
        </div>
        <p v-if="errors.tipo" class="mt-1 text-xs text-red-600">{{ errors.tipo }}</p>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          :disabled="saving"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button class="sgl-btn" type="submit" :disabled="saving || !form.laboratorio_id">
          {{ saving ? 'Enviando…' : 'Desplegar' }}
        </button>
      </div>
    </form>
  </div>
</template>
