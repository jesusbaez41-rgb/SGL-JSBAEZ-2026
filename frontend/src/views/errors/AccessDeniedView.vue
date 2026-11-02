<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.store'

const auth = useAuthStore()
const router = useRouter()

async function logout() {
  await auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6 py-10">
    <div class="sgl-card text-center">
      <p class="text-5xl font-black text-red-500">403</p>
      <h2 class="mt-3 text-xl font-bold text-slate-900">Acceso denegado</h2>
      <p class="mt-2 text-sm text-slate-600">
        Su rol ({{ auth.roleLabel }}) no tiene permiso para esta ruta o recurso.
      </p>
      <p class="mt-2 text-xs text-slate-400">
        El intento quedó registrado en la auditoría con usuario, rol, IP y fecha.
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <RouterLink class="sgl-btn" :to="auth.homeRoute">Volver a mi panel</RouterLink>
        <button
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="logout"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  </div>
</template>
