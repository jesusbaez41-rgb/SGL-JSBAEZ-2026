<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.store'
import { validateLogin } from '../../utils/authLogic'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const uid = ref('')
const password = ref('')
const uidError = ref('')
const passwordError = ref('')
const formError = ref('')

const reasonMessage = computed(() => {
  if (route.query.reason === 'idle') {
    return 'Su sesión se cerró por inactividad. Vuelva a iniciar sesión.'
  }
  if (route.query.reason === 'expired') {
    return 'Su sesión expiró. Vuelva a iniciar sesión.'
  }
  return ''
})

function validate() {
  // PU-01/PU-02: la validación es lógica pura y testeable.
  const validation = validateLogin(uid.value, password.value)
  uidError.value = validation.uidError
  passwordError.value = validation.passwordError
  return validation.valid
}

function clearMessages() {
  formError.value = ''
  auth.error = ''
  auth.errorCode = ''
}

async function submit() {
  clearMessages()

  if (!validate()) return

  try {
    await auth.login(uid.value.trim(), password.value)
    await router.replace(auth.homeRoute)
  } catch (e: any) {
    const code = e?.response?.data?.code
    const message = e?.response?.data?.error

    if (code === 'CREDENCIALES_INVALIDAS' || code === 'CUENTA_BLOQUEADA') {
      // CA-09: mensaje genérico, sin confirmar si el usuario existe.
      formError.value = 'Credenciales inválidas. Verifique su usuario y contraseña.'
    } else if (code === 'AUTH_NO_DISPONIBLE') {
      formError.value = 'El servicio de autenticación no está disponible. Intente más tarde.'
    } else {
      formError.value = message || 'No se pudo iniciar sesión.'
    }
  }
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-gradient-to-br from-sgl-900 via-sgl-700 to-slate-900 p-4">
    <div class="w-full max-w-md">
      <div class="mb-8 flex flex-col items-center text-white">
        <img src="/favicon.svg" class="mb-4 h-14 w-14" alt="SGL" />
        <h1 class="text-2xl font-bold">SGL</h1>
        <p class="text-sm text-sgl-100">Sistema de Gestión de Laboratorios</p>
      </div>

      <form class="sgl-card space-y-5" novalidate @submit.prevent="submit">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">Iniciar sesión</h2>
          <p class="mt-1 text-sm text-slate-500">
            Use sus credenciales de dominio <span class="font-medium">CLOCKWORK.LOCAL</span>.
          </p>
        </div>

        <p
          v-if="reasonMessage"
          class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
          role="status"
        >
          {{ reasonMessage }}
        </p>

        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700" for="uid">Usuario</label>
          <input
            id="uid"
            v-model="uid"
            class="sgl-input"
            :class="{ 'border-red-400 focus:border-red-500 focus:ring-red-100': uidError }"
            type="text"
            autocomplete="username"
            placeholder="usuario de dominio"
            :aria-invalid="Boolean(uidError)"
            aria-describedby="uid-error"
            @input="uidError = ''; clearMessages()"
          />
          <p v-if="uidError" id="uid-error" class="mt-1 text-xs text-red-600">{{ uidError }}</p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700" for="password">Contraseña</label>
          <input
            id="password"
            v-model="password"
            class="sgl-input"
            :class="{ 'border-red-400 focus:border-red-500 focus:ring-red-100': passwordError }"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            :aria-invalid="Boolean(passwordError)"
            aria-describedby="password-error"
            @input="passwordError = ''; clearMessages()"
          />
          <p v-if="passwordError" id="password-error" class="mt-1 text-xs text-red-600">
            {{ passwordError }}
          </p>
        </div>

        <p v-if="formError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {{ formError }}
        </p>

        <button class="sgl-btn w-full" type="submit" :disabled="auth.loading">
          {{ auth.loading ? 'Validando credenciales…' : 'Iniciar sesión' }}
        </button>

        <p class="text-center text-xs text-slate-400">
          La autenticación se valida contra Samba AD mediante LDAPS.
        </p>
      </form>
    </div>
  </div>
</template>
