<script setup lang="ts">
import { computed, ref } from 'vue'
import { appsApi, type AppDetail, type AppLink } from '../../api/apps.api'
import type { Lab } from '../../api/labs.api'
import { shortChecksum } from '../../utils/appsLogic'

const props = defineProps<{
  app: AppDetail
  labs: Lab[]
  canManage: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const links = ref<AppLink[]>([...props.app.vinculos])
const busy = ref<string | null>(null)
const error = ref('')
const success = ref('')

const activeLinks = computed(() => links.value.filter((link) => link.activo))
const labNames = computed(() => {
  const map = new Map<string, string>()
  for (const lab of props.labs) map.set(lab.id, lab.nombre)
  return map
})

function activeFor(laboratorioId: string): AppLink | null {
  return (
    activeLinks.value.find((link) => link.laboratorio_id === laboratorioId) || null
  )
}

function historyFor(laboratorioId: string): AppLink[] {
  return links.value.filter(
    (link) => !link.activo && link.laboratorio_id === laboratorioId,
  )
}

async function linkLab(lab: Lab) {
  busy.value = lab.id
  error.value = ''
  success.value = ''
  try {
    const result = await appsApi.link(props.app.id, lab.id)
    links.value = [result.vinculo, ...links.value.filter((link) => link.id !== result.vinculo.id)]
    success.value = result.created
      ? `Aplicación vinculada a ${lab.nombre}.`
      : `La aplicación ya estaba vinculada a ${lab.nombre}.`
    emit('updated')
  } catch (e: any) {
    error.value =
      e?.response?.data?.error || 'No se pudo vincular la aplicación al laboratorio.'
  } finally {
    busy.value = null
  }
}

async function unlinkLab(lab: Lab) {
  const confirmed = window.confirm(
    `¿Desvincular ${props.app.nombre} de ${lab.nombre}? Se conservará el historial.`,
  )
  if (!confirmed) return

  busy.value = lab.id
  error.value = ''
  success.value = ''
  try {
    const result = await appsApi.unlink(props.app.id, lab.id)
    links.value = links.value.map((link) =>
      link.id === result.vinculo.id ? result.vinculo : link,
    )
    success.value = `Aplicación desvinculada de ${lab.nombre}.`
    emit('updated')
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'No se pudo desvincular la aplicación.'
  } finally {
    busy.value = null
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
    <div class="sgl-card w-full max-w-2xl space-y-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">
            Laboratorios de {{ app.nombre }} {{ app.version }}
          </h3>
          <p class="mt-1 font-mono text-xs text-slate-400">
            SHA-256 {{ shortChecksum(app.checksum, 20) }}
          </p>
          <p class="mt-1 text-sm text-slate-500">
            Una app solo se puede desplegar en los laboratorios vinculados (RN-002).
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

      <div class="rounded-xl border border-slate-200">
        <ul class="divide-y divide-slate-100">
          <li
            v-for="lab in labs"
            :key="lab.id"
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p class="text-sm font-medium text-slate-800">{{ lab.nombre }}</p>
              <p class="text-xs text-slate-500">{{ lab.ubicacion }} · {{ lab.subred }}</p>
              <p v-if="activeFor(lab.id)" class="mt-1 text-xs text-emerald-700">
                Vinculada · versión {{ activeFor(lab.id)?.version || app.version }}
              </p>
              <p v-else-if="historyFor(lab.id).length > 0" class="mt-1 text-xs text-slate-400">
                Sin vínculo activo · {{ historyFor(lab.id).length }} registro(s) histórico(s)
              </p>
            </div>

            <div class="flex items-center gap-2">
              <span
                v-if="activeFor(lab.id)"
                class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
              >
                Activo
              </span>
              <button
                v-if="canManage && activeFor(lab.id)"
                class="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                type="button"
                :disabled="busy === lab.id"
                @click="unlinkLab(lab)"
              >
                Desvincular
              </button>
              <button
                v-else-if="canManage"
                class="sgl-btn px-3 py-1.5 text-xs"
                type="button"
                :disabled="busy === lab.id"
                @click="linkLab(lab)"
              >
                {{ busy === lab.id ? 'Vinculando…' : 'Vincular' }}
              </button>
            </div>
          </li>
          <li v-if="labs.length === 0" class="px-4 py-6 text-center text-sm text-slate-500">
            No hay laboratorios registrados.
          </li>
        </ul>
      </div>

      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-slate-400">
          {{ activeLinks.length }} laboratorio{{ activeLinks.length === 1 ? '' : 's' }}
          vinculado{{ activeLinks.length === 1 ? '' : 's' }}
        </p>
        <button
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="emit('close')"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
</template>
