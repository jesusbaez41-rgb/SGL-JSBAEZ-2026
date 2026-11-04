<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { labsApi, type Lab } from '../../api/labs.api'

const props = defineProps<{
  lab: Lab | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', lab: Lab): void
}>()

const isEdit = computed(() => Boolean(props.lab))

const form = reactive({
  nombre: props.lab?.nombre || '',
  ubicacion: props.lab?.ubicacion || '',
  subred: props.lab?.subred || '',
})

const errors = reactive<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

function isValidSubred(value: string) {
  const match = value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!match) return false
  const octets = match.slice(1, 5).map(Number)
  const prefix = Number(match[5])
  return octets.every((n) => n >= 0 && n <= 255) && prefix >= 0 && prefix <= 32
}

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key])

  if (!form.nombre.trim()) errors.nombre = 'El nombre es obligatorio.'
  if (!form.ubicacion.trim()) errors.ubicacion = 'La ubicación es obligatoria.'
  if (!form.subred.trim()) {
    errors.subred = 'La subred es obligatoria.'
  } else if (!isValidSubred(form.subred)) {
    errors.subred = 'Use el formato CIDR, por ejemplo 192.168.100.0/24.'
  }

  return Object.keys(errors).length === 0
}

async function submit() {
  serverError.value = ''
  if (!validate()) return

  saving.value = true
  try {
    const payload = {
      nombre: form.nombre.trim(),
      ubicacion: form.ubicacion.trim(),
      subred: form.subred.trim(),
    }
    const saved = isEdit.value && props.lab
      ? await labsApi.update(props.lab.id, payload)
      : await labsApi.create(payload)
    emit('saved', saved)
  } catch (e: any) {
    serverError.value = e?.response?.data?.error || 'No se pudo guardar el laboratorio.'
  } finally {
    saving.value = false
  }
}
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
          <h3 class="text-lg font-semibold text-slate-900">
            {{ isEdit ? 'Editar laboratorio' : 'Nuevo laboratorio' }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            Nombre, ubicación física y subred del laboratorio.
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
        <label class="mb-1 block text-sm font-medium text-slate-700" for="lab-name">Nombre</label>
        <input
          id="lab-name"
          v-model="form.nombre"
          class="sgl-input"
          :class="{ 'border-red-400': errors.nombre }"
          type="text"
          placeholder="Laboratorio de Redes"
        />
        <p v-if="errors.nombre" class="mt-1 text-xs text-red-600">{{ errors.nombre }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="lab-location">Ubicación</label>
        <input
          id="lab-location"
          v-model="form.ubicacion"
          class="sgl-input"
          :class="{ 'border-red-400': errors.ubicacion }"
          type="text"
          placeholder="Edificio A, planta 2"
        />
        <p v-if="errors.ubicacion" class="mt-1 text-xs text-red-600">{{ errors.ubicacion }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="lab-subnet">Subred</label>
        <input
          id="lab-subnet"
          v-model="form.subred"
          class="sgl-input font-mono"
          :class="{ 'border-red-400': errors.subred }"
          type="text"
          placeholder="192.168.100.0/24"
        />
        <p v-if="errors.subred" class="mt-1 text-xs text-red-600">{{ errors.subred }}</p>
        <p v-else class="mt-1 text-xs text-slate-400">Formato CIDR IPv4, por ejemplo 192.168.100.0/24.</p>
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
        <button class="sgl-btn" type="submit" :disabled="saving">
          {{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear laboratorio' }}
        </button>
      </div>
    </form>
  </div>
</template>
