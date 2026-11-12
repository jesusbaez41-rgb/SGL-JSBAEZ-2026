<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { appsApi, type AppRow } from '../../api/apps.api'
import {
  ALLOWED_INSTALLER_EXTENSIONS,
  formatFileSize,
  installerTargetName,
  normalizeChecksum,
  validateAppForm,
  validateInstallerFile,
  validateUploadForm,
} from '../../utils/appsLogic'

const props = defineProps<{
  app: AppRow | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', app: AppRow): void
}>()

const isEdit = computed(() => Boolean(props.app))
const hasLinks = computed(() => Number(props.app?.vinculos_activos || 0) > 0)

const form = reactive({
  nombre: props.app?.nombre || '',
  version: props.app?.version || '',
  ruta_instalador: props.app?.ruta_instalador || '',
  parametros_silenciosos: props.app?.parametros_silenciosos || '',
  checksum: props.app?.checksum || '',
  comando_desinstalacion: props.app?.comando_desinstalacion || '',
})

const errors = reactive<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

const file = ref<File | null>(null)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const acceptAttr = ALLOWED_INSTALLER_EXTENSIONS.join(',')

const hasFile = computed(() => Boolean(file.value))
const targetName = computed(() =>
  file.value
    ? installerTargetName(form.nombre || 'app', form.version || '1.0', file.value.name)
    : '',
)

function clearErrors() {
  Object.keys(errors).forEach((key) => delete errors[key])
}

function validate() {
  clearErrors()
  if (file.value) {
    Object.assign(errors, validateInstallerFile(file.value))
    Object.assign(errors, validateUploadForm(form))
  } else {
    Object.assign(errors, validateAppForm(form))
  }
  return Object.keys(errors).length === 0
}

function pickFile() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  setFile(input.files && input.files.length ? input.files[0] : null)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const dropped = event.dataTransfer?.files
  if (dropped && dropped.length) setFile(dropped[0])
}

function setFile(selected: File | null) {
  file.value = selected
  clearErrors()
  if (!selected && fileInput.value) fileInput.value.value = ''
}

function resetFile() {
  setFile(null)
}

async function submit() {
  serverError.value = ''
  if (!validate()) return

  saving.value = true
  try {
    if (file.value) {
      const payload = new FormData()
      payload.append('archivo', file.value)
      payload.append('nombre', form.nombre.trim())
      payload.append('version', form.version.trim())
      payload.append('parametros_silenciosos', form.parametros_silenciosos.trim())
      payload.append('comando_desinstalacion', form.comando_desinstalacion.trim())

      const result = isEdit.value && props.app
        ? await appsApi.replaceInstaller(props.app.id, payload)
        : await appsApi.upload(payload)

      emit('saved', result.app)
      return
    }

    const payload = {
      nombre: form.nombre.trim(),
      version: form.version.trim(),
      ruta_instalador: form.ruta_instalador.trim(),
      parametros_silenciosos: form.parametros_silenciosos.trim(),
      checksum: normalizeChecksum(form.checksum),
      comando_desinstalacion: form.comando_desinstalacion.trim(),
    }
    const saved = isEdit.value && props.app
      ? await appsApi.update(props.app.id, payload)
      : await appsApi.create(payload)
    emit('saved', saved)
  } catch (e: any) {
    const status = e?.response?.status
    if (status === 413) {
      serverError.value =
        'El archivo es demasiado grande para el servidor. Aumentá el límite o usá un instalador más chico.'
    } else if (status === 409) {
      serverError.value = e?.response?.data?.error || 'Ya existe una aplicación con ese nombre y versión.'
    } else if (!e?.response) {
      serverError.value =
        'No se pudo contactar al servidor (¿se cortó la conexión durante la subida?).'
    } else {
      serverError.value = e?.response?.data?.error || 'No se pudo guardar la aplicación.'
    }
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
    <form class="sgl-card w-full max-w-xl space-y-4" novalidate @submit.prevent="submit">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">
            {{ isEdit ? 'Editar aplicación' : 'Nueva aplicación' }}
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            Arrastra el instalador y el servidor calcula su SHA-256 automáticamente (RNF-006).
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
      <p v-if="hasLinks" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
        La aplicación tiene laboratorios vinculados: el nombre y la versión no se pueden
        modificar hasta desvincularla (RN-007).
      </p>

      <div
        class="rounded-xl border-2 border-dashed px-4 py-5 text-center transition"
        :class="[
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50',
          hasFile ? 'border-emerald-300 bg-emerald-50' : '',
        ]"
        role="button"
        tabindex="0"
        @click="pickFile"
        @keydown.enter.prevent="pickFile"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInput"
          class="hidden"
          type="file"
          :accept="acceptAttr"
          @change="onFileChange"
        />

        <template v-if="hasFile">
          <p class="text-sm font-medium text-emerald-800">{{ file?.name }}</p>
          <p class="mt-1 text-xs text-emerald-700">
            {{ formatFileSize(file?.size || 0) }} · se guardará como
            <span class="font-mono">{{ targetName }}</span>
          </p>
          <button
            class="mt-2 rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            type="button"
            @click.stop="resetFile"
          >
            Quitar archivo
          </button>
        </template>

        <template v-else>
          <p class="text-sm font-medium text-slate-700">
            Arrastrá el instalador (.msi, .exe) o hacé clic para buscarlo
          </p>
          <p class="mt-1 text-xs text-slate-500">
            Se almacena en el servidor y se valida por SHA-256 antes de guardarlo.
          </p>
        </template>
      </div>

      <p v-if="errors.archivo" class="-mt-2 text-xs text-red-600">{{ errors.archivo }}</p>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700" for="app-name">Nombre</label>
          <input
            id="app-name"
            v-model="form.nombre"
            class="sgl-input"
            :class="{ 'border-red-400': errors.nombre }"
            type="text"
            placeholder="Firefox"
            maxlength="128"
            :disabled="hasLinks"
          />
          <p v-if="errors.nombre" class="mt-1 text-xs text-red-600">{{ errors.nombre }}</p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700" for="app-version">
            Versión
          </label>
          <input
            id="app-version"
            v-model="form.version"
            class="sgl-input font-mono"
            :class="{ 'border-red-400': errors.version }"
            type="text"
            placeholder="128.0"
            maxlength="32"
            :disabled="hasLinks"
          />
          <p v-if="errors.version" class="mt-1 text-xs text-red-600">{{ errors.version }}</p>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="app-path">
          Ruta del instalador
        </label>
        <input
          id="app-path"
          v-model="form.ruta_instalador"
          class="sgl-input font-mono text-sm"
          :class="{ 'border-red-400': errors.ruta_instalador }"
          type="text"
          placeholder="/opt/sgl-instaladores/Firefox-128.0.exe"
          maxlength="512"
          :disabled="hasFile"
        />
        <p v-if="errors.ruta_instalador" class="mt-1 text-xs text-red-600">
          {{ errors.ruta_instalador }}
        </p>
        <p v-else-if="hasFile" class="mt-1 text-xs text-emerald-700">
          Se usará el archivo subido.
        </p>
        <p v-else class="mt-1 text-xs text-slate-400">
          Ruta del servidor o relativa a <span class="font-mono">APPS_INSTALLERS_DIR</span>.
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="app-params">
          Parámetros silenciosos
        </label>
        <input
          id="app-params"
          v-model="form.parametros_silenciosos"
          class="sgl-input font-mono text-sm"
          :class="{ 'border-red-400': errors.parametros_silenciosos }"
          type="text"
          placeholder="/S /quiet"
          maxlength="2000"
        />
        <p v-if="errors.parametros_silenciosos" class="mt-1 text-xs text-red-600">
          {{ errors.parametros_silenciosos }}
        </p>
        <p
          v-else-if="form.ruta_instalador.trim().toLowerCase().endsWith('.exe') && !form.parametros_silenciosos.trim()"
          class="mt-1 text-xs text-amber-700"
        >
          Los instaladores .exe necesitan parámetros silenciosos (por ejemplo /S);
          sin ellos el instalador se queda esperando y el despliegue falla.
        </p>
        <p
          v-if="/user[-_. ]?setup|user-installer|-user-/i.test(form.ruta_instalador)"
          class="mt-1 text-xs text-amber-700"
        >
          Parece un instalador <strong>por usuario</strong>. El despliegue corre como
          SYSTEM, así que va a quedar en el perfil del sistema y no para el usuario.
          Usá el instalador de sistema (por ejemplo VSCodeSetup, no VSCodeUserSetup).
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="app-uninstall">
          Comando de desinstalación
        </label>
        <input
          id="app-uninstall"
          v-model="form.comando_desinstalacion"
          class="sgl-input font-mono text-sm"
          :class="{ 'border-red-400': errors.comando_desinstalacion }"
          type="text"
          placeholder="Start-Process 'C:\\Program Files\\App\\uninstall.exe' -Wait"
          maxlength="2000"
        />
        <p v-if="errors.comando_desinstalacion" class="mt-1 text-xs text-red-600">
          {{ errors.comando_desinstalacion }}
        </p>
        <p v-else class="mt-1 text-xs text-slate-400">
          Opcional. Si queda vacío, en los instaladores .msi se usa
          <span class="font-mono">msiexec /x</span>.
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700" for="app-checksum">
          Checksum SHA-256
        </label>
        <input
          id="app-checksum"
          v-model="form.checksum"
          class="sgl-input font-mono text-sm"
          :class="{ 'border-red-400': errors.checksum }"
          type="text"
          placeholder="9f2c… 64 caracteres hexadecimales"
          maxlength="71"
          spellcheck="false"
          :disabled="hasFile"
        />
        <p v-if="errors.checksum" class="mt-1 text-xs text-red-600">{{ errors.checksum }}</p>
        <p v-else-if="hasFile" class="mt-1 text-xs text-emerald-700">
          Se calculará en el servidor al subir el archivo.
        </p>
        <p v-else class="mt-1 text-xs text-slate-400">
          Calcúlalo en el servidor con <span class="font-mono">sha256sum archivo</span>.
        </p>
      </div>

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
          {{ saving ? 'Verificando…' : hasFile ? 'Subir y registrar' : isEdit ? 'Guardar cambios' : 'Crear aplicación' }}
        </button>
      </div>
    </form>
  </div>
</template>