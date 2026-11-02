import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/tailwind.css'

// La redirección a HTTPS es opcional y se activa en producción con
// VITE_FORCE_HTTPS=true. En local se trabaja por HTTP sin redirecciones.
if (
  import.meta.env.VITE_FORCE_HTTPS === 'true' &&
  window.location.protocol === 'http:'
) {
  window.location.replace(
    `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
} else {
  createApp(App).use(createPinia()).use(router).mount('#app')
}
