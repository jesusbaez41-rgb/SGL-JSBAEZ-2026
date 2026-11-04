<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { equipmentApi, type Equipment } from '../../api/equipment.api'
import type { Lab } from '../../api/labs.api'

const props = defineProps<{
  equipment: Equipment | null
  labs: Lab[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', equipment: Equipment): void
}>()

const isEdit = computed(() => Boolean(props.equipment))

const form = reactive({
  hostname: props.equipment?.hostname || '',
  mac_address: props.equipment?.mac_address || '',
  ip_address: props.equipment?.ip_address || '',
  laboratorio_id: props.equipment?.laboratorio_id || props.labs[0]?.id || '',
  mesh_agent_id: props.equipment?.mesh_agent_id || '',
})

const errors = reactive<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

function isValidMac(value: string) {
  return /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(value.trim())
}

function isValidHostname(value: string) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(value.trim())
}

function isValidIp(value: string) {
  const ip = value.trim()
  if (!ip) return true
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.includes(':')
}

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key])

  if (!form.hostname.trim()) errors.hostname = 'El hostname es obligatorio.'
  else if (!isValidHostname(form.hostname)) errors.hostname = 'Hostname inválido.'

  if (!form.mac_address.trim()) errors.mac_address = 'La MAC es obligatoria.'
  else if (!isValidMac(form.mac_address)) errors.mac_address = 'Use el formato AA:BB:CC:DD:EE:FF.'

  if (!isValidIp(form.ip_address)) errors.ip_address = 'IP inválida.'

  if (!form.laboratorio_id) errors.laboratorio_id = 'Debe asignar un laboratorio.'

  return Object.keys(errors).length === 0
}

async function submit() {
  serverError.value = ''
  if (!validate()) return

  saving.value = true
  try {
    const payload = {
      hostname: form.hostname.trim(),
      mac_address: form.mac_address.trim(),
      ip_address: form.ip_address.trim(),
      laboratorio_id: form.laboratorio_id,
      mesh_agent_id: form.mesh_agent_id.trim() || undefined,
    }
    const saved =
      isEdit.value && props.equipment
        ? await equipmentApi.update(props.equipment.id, payload)
        : await equipmentApi.create(payload)
    emit('saved', saved)
  } catch (e: any) {
    serverError.value = e?.response?.data?.error || 'No se pudo guardar el equipo.'
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
            {{ isEdit ? 'Editar equipo' : 'Nuevo equipo' }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            El equipo debe pertenecer a un laboratorio (RN-001).
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
        <label class="mb-1 block text-sm font-medium text-slate-700" for="eq-hostname">Hostname</label>
        <input
          id="eq-hostname"
          v-model="form.hostname"
          class="sgl-input font-mono"
          :class="{ 'border-red-400': errors.hostname }"
          type="text"
          placeholder="PC-LAB01"
        />
        <p v-if="errors.hostname" class="mt-1 text-xs text-red-600">{{ errors.hostname }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="eq-mac">MAC</label>
        <input
          id="eq-mac"
          v-model="form.mac_address"
          class="sgl-input font-mono"
          :class="{ 'border-red-400': errors.mac_address }"
          type="text"
          placeholder="AA:BB:CC:DD:EE:FF"
        />
        <p v-if="errors.mac_address" class="mt-1 text-xs text-red-600">{{ errors.mac_address }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="eq-ip">IP actual (opcional)</label>
        <input
          id="eq-ip"
          v-model="form.ip_address"
          class="sgl-input font-mono"
          :class="{ 'border-red-400': errors.ip_address }"
          type="text"
          placeholder="192.168.100.101"
        />
        <p v-if="errors.ip_address" class="mt-1 text-xs text-red-600">{{ errors.ip_address }}</p>
        <p v-else class="mt-1 text-xs text-slate-400">
          MeshCentral puede actualizar la IP automáticamente.
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="eq-lab">Laboratorio</label>
        <select
          id="eq-lab"
          v-model="form.laboratorio_id"
          class="sgl-input"
          :class="{ 'border-red-400': errors.laboratorio_id }"
        >
          <option disabled value="">Seleccione un laboratorio</option>
          <option v-for="lab in labs" :key="lab.id" :value="lab.id">
            {{ lab.nombre }} · {{ lab.subred }}
          </option>
        </select>
        <p v-if="errors.laboratorio_id" class="mt-1 text-xs text-red-600">
          {{ errors.laboratorio_id }}
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="eq-mesh">
          ID de MeshCentral (opcional)
        </label>
        <input
          id="eq-mesh"
          v-model="form.mesh_agent_id"
          class="sgl-input font-mono"
          type="text"
          placeholder="node//..."
        />
        <p class="mt-1 text-xs text-slate-400">
          Si se deja vacío, la sincronización lo completa por hostname.
        </p>
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
          {{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar equipo' }}
        </button>
      </div>
    </form>
  </div>
</template>
