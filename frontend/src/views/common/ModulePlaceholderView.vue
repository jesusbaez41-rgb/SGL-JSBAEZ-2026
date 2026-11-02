<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.store'

const route = useRoute()
const auth = useAuthStore()

const title = computed(() => String(route.meta.title || 'Módulo'))
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold text-slate-900">{{ title }}</h2>
      <p class="text-sm text-slate-500">
        Módulo habilitado para su rol ({{ auth.roleLabel }}).
      </p>
    </div>

    <div class="sgl-card">
      <p class="text-sm text-slate-600">
        El control de acceso a este módulo ya está activo. La funcionalidad completa se
        implementará en la historia de usuario correspondiente.
      </p>
      <p class="mt-3 text-xs text-slate-400">
        Si no debería ver este módulo, el backend rechazará la petición con 403 y el evento
        quedará registrado en auditoría.
      </p>
    </div>

    <div class="sgl-card">
      <h3 class="text-sm font-semibold text-slate-900">Permisos efectivos de su sesión</h3>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="permission in auth.permissions"
          :key="permission"
          class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
        >
          {{ permission }}
        </span>
      </div>
    </div>
  </div>
</template>
