<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { groupsApi, type GroupRow } from '../../api/groups.api'
import { validateGroupCode } from '../../utils/groupsLogic'

const props = defineProps<{
  group: GroupRow | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', group: GroupRow): void
}>()

const isEdit = computed(() => Boolean(props.group))

const form = reactive({
  codigo: props.group?.codigo || '',
  descripcion: props.group?.descripcion || '',
})

const errors = reactive<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key])

  const codigoError = validateGroupCode(form.codigo)
  if (codigoError) errors.codigo = codigoError
  if (form.descripcion.trim().length > 255) {
    errors.descripcion = 'La descripción no puede superar los 255 caracteres.'
  }

  return Object.keys(errors).length === 0
}

async function submit() {
  serverError.value = ''
  if (!validate()) return

  saving.value = true
  try {
    const descripcion = form.descripcion.trim()
    const saved =
      isEdit.value && props.group
        ? await groupsApi.update(props.group.id, { descripcion })
        : await groupsApi.create({
            codigo: form.codigo.trim(),
            descripcion,
          })
    emit('saved', saved)
  } catch (e: any) {
    serverError.value = e?.response?.data?.error || 'No se pudo guardar el grupo.'
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
            {{ isEdit ? 'Editar grupo' : 'Nuevo grupo' }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            El código se sincroniza con Samba AD y es único a nivel global (RN-011).
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
        <label class="mb-1 block text-sm font-medium text-slate-700" for="group-code">Código</label>
        <input
          id="group-code"
          v-model="form.codigo"
          class="sgl-input font-mono uppercase"
          :class="{ 'border-red-400': errors.codigo }"
          type="text"
          placeholder="GRP-1A"
          :disabled="isEdit"
          maxlength="32"
        />
        <p v-if="errors.codigo" class="mt-1 text-xs text-red-600">{{ errors.codigo }}</p>
        <p v-else-if="isEdit" class="mt-1 text-xs text-slate-400">
          El código no se puede modificar.
        </p>
        <p v-else class="mt-1 text-xs text-slate-400">
          Ejemplo: GRP-1A. Se normaliza a mayúsculas.
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="group-description">
          Descripción
        </label>
        <textarea
          id="group-description"
          v-model="form.descripcion"
          class="sgl-input min-h-[96px]"
          :class="{ 'border-red-400': errors.descripcion }"
          placeholder="Primer año, comisión A"
          maxlength="255"
        ></textarea>
        <p v-if="errors.descripcion" class="mt-1 text-xs text-red-600">
          {{ errors.descripcion }}
        </p>
        <p v-else class="mt-1 text-xs text-slate-400">
          Se sincroniza con la descripción del grupo en Samba AD.
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
          {{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear grupo' }}
        </button>
      </div>
    </form>
  </div>
</template>
