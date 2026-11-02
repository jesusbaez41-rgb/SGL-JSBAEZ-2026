import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('sgl_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function clearLocalSession() {
  localStorage.removeItem('sgl_token')
  localStorage.removeItem('sgl_user')
  localStorage.removeItem('sgl_permissions')
  localStorage.removeItem('sgl_session')
}

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = String(error.config?.url || '')
    const isLoginRequest = url.includes('/auth/login')
    const isSessionCheck = url.includes('/auth/me')

    // CA-09: los errores del login se muestran en el formulario, no redirigen.
    if (status === 401 && !isLoginRequest) {
      clearLocalSession()
      const code = error.response?.data?.code
      const reason = code === 'SESION_EXPIRADA' ? 'idle' : 'expired'
      if (!isSessionCheck && window.location.pathname !== '/login') {
        window.location.assign(`/login?reason=${reason}`)
      }
    }

    // CA-08: acceso denegado a una API o ruta protegida.
    // En /auth/me se deja que el guard del router decida (evita carreras).
    if (status === 403 && !isLoginRequest && !isSessionCheck) {
      if (window.location.pathname !== '/403' && window.location.pathname !== '/login') {
        window.location.assign('/403')
      }
    }

    return Promise.reject(error)
  },
)
