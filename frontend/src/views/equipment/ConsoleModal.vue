<script setup lang="ts">
import { ref } from 'vue'
import { equipmentApi, type Equipment } from '../../api/equipment.api'

const props = defineProps<{
  equipo: Equipment
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const comando = ref('cmd /c hostname && whoami && ipconfig')
const salida = ref('')
const error = ref('')
const running = ref(false)

const atajos = [
  { label: 'Identidad', cmd: 'cmd /c hostname && whoami' },
  { label: 'Red', cmd: 'cmd /c ipconfig' },
  { label: 'Procesos', cmd: 'cmd /c tasklist | findstr /i "explorer notepad"' },
  { label: 'Espacio', cmd: 'cmd /c dir C:\\Windows\\Temp' },
  { label: 'PowerShell', cmd: 'powershell -NoProfile -Command "Get-Date"' },
]

async function ejecutar() {
  if (!comando.value.trim()) return
  running.value = true
  error.value = ''
  salida.value = ''
  try {
    const resultado = await equipmentApi.consola(props.equipo.id, comando.value)
    salida.value = resultado.salida || '(sin salida)'
    if (resultado.error) error.value = resultado.error
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo ejecutar el comando.'
  } finally {
    running.value = false
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
    <div class="sgl-card w-full max-w-3xl space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">
            Consola de {{ equipo.hostname }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            El comando se ejecuta en el equipo mediante el agente MeshCentral, con
            privilegios de sistema.
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

      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="atajo in atajos"
          :key="atajo.label"
          class="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          type="button"
          @click="comando = atajo.cmd"
        >
          {{ atajo.label }}
        </button>
      </div>

      <textarea
        v-model="comando"
        class="sgl-input h-20 font-mono text-xs"
        rows="3"
        spellcheck="false"
        placeholder="cmd /c hostname"
      />

      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-slate-400">La salida del agente se muestra debajo.</p>
        <button class="sgl-btn" type="button" :disabled="running" @click="ejecutar">
          {{ running ? 'Ejecutando…' : 'Ejecutar' }}
        </button>
      </div>

      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {{ error }}
      </p>

      <pre
        class="max-h-72 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100"
      >{{ salida || 'Sin salida todavía.' }}</pre>

      <div class="flex justify-end">
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
</template>
