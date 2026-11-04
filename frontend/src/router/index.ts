import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth.store'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: { public: true, title: 'Iniciar sesión' },
  },
  {
    path: '/',
    component: () => import('../layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('../views/common/HomeRedirect.vue'),
      },
      {
        path: 'academico',
        name: 'academico',
        component: () => import('../views/panels/AcademicoView.vue'),
        meta: { permission: 'panel:academico', title: 'Panel académico' },
      },
      {
        path: 'tecnico',
        name: 'tecnico',
        component: () => import('../views/panels/TecnicoView.vue'),
        meta: { permission: 'panel:tecnico', title: 'Panel técnico' },
      },
      {
        path: 'docencia',
        name: 'docencia',
        component: () => import('../views/panels/DocenciaView.vue'),
        meta: { permission: 'panel:docencia', title: 'Panel de docencia' },
      },
      {
        path: 'usuarios',
        name: 'usuarios',
        component: () => import('../views/users/UsersView.vue'),
        meta: { permission: 'users:read', title: 'Usuarios' },
      },
      {
        path: 'grupos',
        name: 'grupos',
        component: () => import('../views/common/ModulePlaceholderView.vue'),
        meta: { permission: 'groups:read', title: 'Grupos' },
      },
      {
        path: 'listas-blancas',
        name: 'listas-blancas',
        component: () => import('../views/common/ModulePlaceholderView.vue'),
        meta: { permission: 'whitelists:read', title: 'Listas blancas' },
      },
      {
        path: 'auditoria',
        name: 'auditoria',
        component: () => import('../views/audit/AuditView.vue'),
        meta: { permission: 'audit:read', title: 'Auditoría' },
      },
      {
        path: 'laboratorios',
        name: 'laboratorios',
        component: () => import('../views/labs/LabsView.vue'),
        meta: { permission: 'labs:read', title: 'Laboratorios' },
      },
      {
        path: 'equipos',
        name: 'equipos',
        component: () => import('../views/equipment/EquipmentView.vue'),
        meta: { permission: 'equipment:read', title: 'Equipos' },
      },
      {
        path: 'aplicaciones',
        name: 'aplicaciones',
        component: () => import('../views/common/ModulePlaceholderView.vue'),
        meta: { permission: 'apps:read', title: 'Aplicaciones' },
      },
      {
        path: 'despliegues',
        name: 'despliegues',
        component: () => import('../views/common/ModulePlaceholderView.vue'),
        meta: { permission: 'deployments:read', title: 'Despliegues' },
      },
      {
        path: 'politicas',
        name: 'politicas',
        component: () => import('../views/common/ModulePlaceholderView.vue'),
        meta: { permission: 'policies:read', title: 'Políticas' },
      },
      {
        path: 'monitoreo',
        name: 'monitoreo',
        component: () => import('../views/monitoring/MonitoringView.vue'),
        meta: { permission: 'monitoring:read', title: 'Monitoreo' },
      },
      {
        path: '403',
        name: 'access-denied',
        component: () => import('../views/errors/AccessDeniedView.vue'),
        meta: { title: 'Acceso denegado' },
      },
      { path: 'dashboard', redirect: '/' },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/errors/NotFoundView.vue'),
    meta: { public: true, title: 'Página no encontrada' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated) {
      return { path: auth.homeRoute }
    }
    return true
  }

  if (!auth.isAuthenticated) {
    return {
      name: 'login',
      query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : undefined,
    }
  }

  if (!auth.ready) {
    const ok = await auth.fetchMe()
    if (!ok) return { name: 'login' }
  }

  if (to.name === 'home') {
    return { path: auth.homeRoute }
  }

  if (to.meta.permission && !auth.can(String(to.meta.permission))) {
    return { name: 'access-denied' }
  }

  return true
})

export default router
