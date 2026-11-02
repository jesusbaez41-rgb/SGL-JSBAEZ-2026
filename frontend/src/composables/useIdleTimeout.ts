import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth.store'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

/**
 * HU-COM-14 / CA-11: cierra la sesión por inactividad.
 * - El backend también expira la sesión; esto es la capa de UX.
 * - Envía heartbeat cada 5 min mientras el usuario esté activo para que
 *   la actividad del cliente y la del servidor no se desincronicen.
 */
export function useIdleTimeout(onExpire: () => void, idleMinutes = 30, warningSeconds = 60) {
  const auth = useAuthStore()
  const remaining = ref(idleMinutes * 60)
  const showWarning = ref(false)

  let lastActivity = Date.now()
  let lastHeartbeat = Date.now()
  let timer: number | undefined

  function reset() {
    lastActivity = Date.now()
    remaining.value = idleMinutes * 60
    showWarning.value = false
  }

  function onActivity() {
    reset()
    if (Date.now() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeat = Date.now()
      void auth.heartbeat()
    }
  }

  function onTick() {
    const elapsed = Math.floor((Date.now() - lastActivity) / 1000)
    const left = idleMinutes * 60 - elapsed
    remaining.value = Math.max(left, 0)
    showWarning.value = left <= warningSeconds && left > 0

    if (left <= 0) {
      stop()
      onExpire()
    }
  }

  function stop() {
    ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity))
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  onMounted(() => {
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    )
    timer = window.setInterval(onTick, 1000)
  })

  onBeforeUnmount(stop)

  return { remaining, showWarning, reset }
}
