<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { usersApi, type UserRow } from '../../api/users.api'
import { ROLE_LABELS } from '../../stores/auth.store'

const props = defineProps<{
  user: UserRow | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', user: UserRow): void
}>()

const isEdit = computed(() => Boolean(props.user))

const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

const form = reactive({
  uid: props.user?.uid || '',
  nombre_completo: props.user?.nombre_completo || '',
  email: props.user?.email || '',
  rol: String(props.user?.rol || 'DOCENTE'),
  password: '',
  activo: props.user ? Boolean(props.user.activo) : true,
})

const errors = reactive<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key])

  if (!isEdit.value) {
    if (!form.uid.trim()) {
      errors.uid = 'El identificador es obligatorio.'
    } else if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(form.uid.trim())) {
      errors.uid = 'Use 3-32 caracteres: letras, números, punto, guion o guion bajo.'
    }
  }

  if (!form.nombre_completo.trim()) {
    errors.nombre_completo = 'El nombre completo es obligatorio.'
  }

  if (!form.email.trim()) {
    errors.email = 'El correo es obligatorio.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'El correo no tiene un formato válido.'
  }

  if (!isEdit.value && !form.password) {
    errors.password = 'La contraseña inicial es obligatoria.'
  }

  if (form.password) {
    const classes = [
      /[a-z]/.test(form.password),
      /[A-Z]/.test(form.password),
      /[0-9]/.test(form.password),
      /[^A-Za-z0-9]/.test(form.password),
    ].filter(Boolean).length

    if (form.password.length < 8) {
      errors.password = 'Debe tener al menos 8 caracteres.'
    } else if (classes < 3) {
      errors.password = 'Combine al menos 3 de: minúscula, mayúscula, número y símbolo.'
    }
  }

  return Object.keys(errors).length === 0
}

async function submit() {
  serverError.value = ''

  if (!validate()) return

  saving.value = true
  try {
    let saved: UserRow

    if (isEdit.value && props.user) {
      saved = await usersApi.update(props.user.id, {
        nombre_completo: form.nombre_completo.trim(),
        email: form.email.trim().toLowerCase(),
        rol: form.rol,
        activo: form.activo,
        password: form.password ? form.password : undefined,
      })
    } else {
      saved = await usersApi.create({
        uid: form.uid.trim().toLowerCase(),
        nombre_completo: form.nombre_completo.trim(),
        email: form.email.trim().toLowerCase(),
        rol: form.rol,
        password: form.password,
      })
    }

    emit('saved', saved)
  } catch (e: any) {
    serverError.value = e?.response?.data?.error || 'No se pudo guardar el usuario.'
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
            {{ isEdit ? 'Editar usuario' : 'Nuevo usuario' }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            {{ isEdit ? 'Los cambios se sincronizan con Samba AD.' : 'La cuenta se crea en Samba AD y en PostgreSQL.' }}
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
        <label class="mb-1 block text-sm font-medium text-slate-700" for="user-uid">Usuario</label>
        <input
          id="user-uid"
          v-model="form.uid"
          class="sgl-input font-mono disabled:bg-slate-100 disabled:text-slate-500"
          :class="{ 'border-red-400': errors.uid }"
          type="text"
          autocomplete="off"
          :disabled="isEdit"
          placeholder="jperez"
        />
        <p v-if="errors.uid" class="mt-1 text-xs text-red-600">{{ errors.uid }}</p>
        <p v-else-if="isEdit" class="mt-1 text-xs text-slate-400">
          El identificador no se puede modificar.
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="user-name">Nombre completo</label>
        <input
          id="user-name"
          v-model="form.nombre_completo"
          class="sgl-input"
          :class="{ 'border-red-400': errors.nombre_completo }"
          type="text"
          autocomplete="name"
          placeholder="Juan Pérez"
        />
        <p v-if="errors.nombre_completo" class="mt-1 text-xs text-red-600">
          {{ errors.nombre_completo }}
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="user-email">Correo</label>
        <input
          id="user-email"
          v-model="form.email"
          class="sgl-input"
          :class="{ 'border-red-400': errors.email }"
          type="email"
          autocomplete="email"
          placeholder="jperez@clockwork.local"
        />
        <p v-if="errors.email" class="mt-1 text-xs text-red-600">{{ errors.email }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="user-role">Rol</label>
        <select id="user-role" v-model="form.rol" class="sgl-input">
          <option v-for="role in roleOptions" :key="role.value" :value="role.value">
            {{ role.label }}
          </option>
        </select>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="user-password">
          {{ isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña inicial' }}
        </label>
        <input
          id="user-password"
          v-model="form.password"
          class="sgl-input"
          :class="{ 'border-red-400': errors.password }"
          type="password"
          autocomplete="new-password"
          :placeholder="isEdit ? 'Dejar vacío para conservarla' : 'Mínimo 8 caracteres'"
        />
        <p v-if="errors.password" class="mt-1 text-xs text-red-600">{{ errors.password }}</p>
        <p v-else class="mt-1 text-xs text-slate-400">
          Debe combinar al menos 3 de: minúscula, mayúscula, número y símbolo.
        </p>
      </div>

      <label v-if="isEdit" class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="form.activo" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
        Cuenta activa (al desactivar se cierran sus sesiones)
      </label>

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
          {{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario' }}
        </button>
      </div>
    </form>
  </div>
</template>
