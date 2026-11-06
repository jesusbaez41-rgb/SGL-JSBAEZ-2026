import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi, type SglUser, type SessionInfo } from '../api/auth.api'
import { homeForRole } from '../utils/authLogic'

export { ROLE_HOME } from '../utils/authLogic'

const TOKEN_KEY = 'sgl_token'
const USER_KEY = 'sgl_user'
const PERMISSIONS_KEY = 'sgl_permissions'
const SESSION_KEY = 'sgl_session'

export const ROLE_LABELS: Record<string, string> = {
  ADMIN_ACADEMICO: 'Administrador Académico',
  ADMIN_TECNICO: 'Administrador Técnico',
  DOCENTE: 'Docente',
  ESTUDIANTE: 'Estudiante',
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function clearStorage() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(PERMISSIONS_KEY)
  localStorage.removeItem(SESSION_KEY)
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<SglUser | null>(readJson<SglUser>(USER_KEY))
  const permissions = ref<string[]>(readJson<string[]>(PERMISSIONS_KEY) || [])
  const session = ref<SessionInfo | null>(readJson<SessionInfo>(SESSION_KEY))
  const loading = ref(false)
  const error = ref('')
  const errorCode = ref('')
  const ready = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value && user.value))
  const roleLabel = computed(() => (user.value ? ROLE_LABELS[user.value.rol] || user.value.rol : ''))
  const homeRoute = computed(() => (user.value ? homeForRole(user.value.rol) : '/login'))
  const can = (permission: string) => permissions.value.includes(permission)

  function persist() {
    if (token.value) localStorage.setItem(TOKEN_KEY, token.value)
    if (user.value) localStorage.setItem(USER_KEY, JSON.stringify(user.value))
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions.value))
    if (session.value) localStorage.setItem(SESSION_KEY, JSON.stringify(session.value))
  }

  function clear() {
    token.value = null
    user.value = null
    permissions.value = []
    session.value = null
    error.value = ''
    errorCode.value = ''
    clearStorage()
  }

  async function login(uid: string, password: string) {
    loading.value = true
    error.value = ''
    errorCode.value = ''

    try {
      const data = await authApi.login(uid, password)
      token.value = data.token
      user.value = data.user
      permissions.value = data.permissions || []
      session.value = data.session
      persist()
      ready.value = true
      return data
    } catch (e: any) {
      error.value = e?.response?.data?.error || 'No se pudo iniciar sesión'
      errorCode.value = e?.response?.data?.code || ''
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    if (!token.value) {
      ready.value = true
      return false
    }

    try {
      const data = await authApi.me()
      user.value = data.user
      permissions.value = data.permissions || []
      session.value = data.session
      persist()
      ready.value = true
      return true
    } catch {
      clear()
      ready.value = true
      return false
    }
  }

  async function logout() {
    try {
      if (token.value) await authApi.logout()
    } catch {
      /* la sesión local se cierra igual */
    } finally {
      clear()
    }
  }

  async function heartbeat() {
    if (!token.value) return false
    try {
      const data = await authApi.heartbeat()
      if (data.session) {
        session.value = data.session
        persist()
      }
      return true
    } catch {
      return false
    }
  }

  return {
    token,
    user,
    permissions,
    session,
    loading,
    error,
    errorCode,
    ready,
    isAuthenticated,
    roleLabel,
    homeRoute,
    can,
    login,
    fetchMe,
    logout,
    heartbeat,
    clear,
  }
})
