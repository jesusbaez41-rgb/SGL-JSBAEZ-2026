<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.store'
import { useIdleTimeout } from '../composables/useIdleTimeout'

interface MenuItem {
  label: string
  to: string
  permission: string
}

interface MenuSection {
  title: string
  items: MenuItem[]
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)

const sections: MenuSection[] = [
  {
    title: 'Panel',
    items: [
      { label: 'Panel académico', to: '/academico', permission: 'panel:academico' },
      { label: 'Panel técnico', to: '/tecnico', permission: 'panel:tecnico' },
      { label: 'Panel de docencia', to: '/docencia', permission: 'panel:docencia' },
    ],
  },
  {
    title: 'Gestión académica',
    items: [
      { label: 'Usuarios', to: '/usuarios', permission: 'users:read' },
      { label: 'Grupos', to: '/grupos', permission: 'groups:read' },
      { label: 'Listas blancas', to: '/listas-blancas', permission: 'whitelists:read' },
      { label: 'Auditoría', to: '/auditoria', permission: 'audit:read' },
    ],
  },
  {
    title: 'Gestión técnica',
    items: [
      { label: 'Laboratorios', to: '/laboratorios', permission: 'labs:read' },
      { label: 'Equipos', to: '/equipos', permission: 'equipment:read' },
      { label: 'Aplicaciones', to: '/aplicaciones', permission: 'apps:read' },
      { label: 'Despliegues', to: '/despliegues', permission: 'deployments:read' },
      { label: 'Políticas', to: '/politicas', permission: 'policies:read' },
    ],
  },
  {
    title: 'Docencia',
    items: [{ label: 'Monitoreo', to: '/monitoreo', permission: 'monitoring:read' }],
  },
]

const visibleSections = computed(() =>
  sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => auth.can(item.permission)),
    }))
    .filter((section) => section.items.length > 0),
)

const idleMinutes = auth.session?.idleMinutes || 30
const { remaining, showWarning, reset } = useIdleTimeout(handleIdleExpire, idleMinutes)

const remainingText = computed(() => {
  const minutes = Math.floor(remaining.value / 60)
  const seconds = remaining.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

async function handleIdleExpire() {
  await auth.logout()
  await router.replace({ name: 'login', query: { reason: 'idle' } })
}

async function logout() {
  await auth.logout()
  await router.replace({ name: 'login' })
}

function go(to: string) {
  mobileOpen.value = false
  return router.push(to)
}
</script>

<template>
  <div class="min-h-full">
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
      aria-hidden="true"
      @click="mobileOpen = false"
    ></div>

    <aside
      class="fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0"
      :class="mobileOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
        <img src="/favicon.svg" class="h-8 w-8" alt="SGL" />
        <div>
          <p class="text-sm font-bold text-slate-900">SGL</p>
          <p class="text-xs text-slate-500">Gestión de Laboratorios</p>
        </div>
      </div>

      <nav class="flex-1 space-y-5 overflow-y-auto p-4">
        <div v-for="section in visibleSections" :key="section.title">
          <p class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {{ section.title }}
          </p>
          <button
            v-for="item in section.items"
            :key="item.to"
            type="button"
            class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition"
            :class="
              route.path === item.to
                ? 'bg-sgl-50 text-sgl-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            "
            @click="go(item.to)"
          >
            {{ item.label }}
          </button>
        </div>
      </nav>

      <div class="border-t border-slate-200 p-4 text-xs text-slate-400">
        <p>SGL Web v0.2.0 · HU-COM-14</p>
        <p class="mt-1">CLOCKWORK.LOCAL</p>
      </div>
    </aside>

    <div class="flex min-h-full flex-col lg:pl-64">
      <header class="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 lg:hidden"
            aria-label="Abrir menú"
            @click="mobileOpen = true"
          >
            ☰
          </button>
          <div>
            <p class="text-sm font-semibold text-slate-900">Sistema de Gestión de Laboratorios</p>
            <p class="text-xs text-slate-500">{{ auth.roleLabel }}</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="hidden text-right sm:block">
            <p class="text-sm font-medium text-slate-800">{{ auth.user?.nombre || auth.user?.uid }}</p>
            <p class="text-xs text-slate-500">{{ auth.user?.uid }} · {{ auth.roleLabel }}</p>
          </div>
          <button
            class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            @click="logout"
          >
            Salir
          </button>
        </div>
      </header>

      <main class="flex-1 p-4 sm:p-6">
        <RouterView />
      </main>
    </div>

    <!-- CA-11: aviso previo al cierre por inactividad -->
    <div
      v-if="showWarning"
      class="fixed bottom-4 right-4 z-50 w-[min(92vw,22rem)] rounded-xl border border-amber-200 bg-white p-4 shadow-lg"
      role="alertdialog"
      aria-live="assertive"
    >
      <p class="text-sm font-semibold text-slate-900">La sesión está por expirar</p>
      <p class="mt-1 text-sm text-slate-600">
        Por inactividad, la sesión se cerrará en
        <span class="font-mono font-semibold text-amber-700">{{ remainingText }}</span>.
      </p>
      <div class="mt-3 flex gap-2">
        <button class="sgl-btn" type="button" @click="reset">Extender sesión</button>
        <button
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="logout"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  </div>
</template>
