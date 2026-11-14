# Matriz de cumplimiento — SGL

**Última revisión:** 2026-11-05  
**Alcance:** Samba AD, carpetas privadas, stack SGL web, PostgreSQL, autenticación web (HU-COM-14), CRUD de usuarios (HU-COM-02), autenticación de PC cliente/GPO (HU-COM-01), laboratorios/equipos y MeshCentral (HU-COM-03), registro y monitoreo de PCs con agente (HU-COM-04), administración de grupos y membresías (HU-COM-05), catálogo de aplicaciones e instaladores (HU-COM-07), specs.

## Resultado global

| Área | Resultado |
|---|---|
| Samba AD (DNS, Kerberos, SMB, dominio) | **Funciona** |
| Carpetas privadas por usuario | **Funciona** (aislamiento verificado) |
| Stack Docker (frontend/backend/db) | **Funciona** |
| Autenticación web contra Samba AD (LDAPS) | **Implementada** (HU-COM-14) |
| Sesión JWT revocable + inactividad | **Implementada** (HU-COM-14) |
| RBAC por permisos y redirección por rol | **Implementado** (HU-COM-14) |
| Auditoría de acceso append-only | **Implementada** (HU-COM-14, CA-12) |
| CRUD de usuarios sincronizado con Samba AD | **Implementado** (HU-COM-02) |
| Autenticación de PC cliente Windows (Kerberos) | **Parcial** (KDC/DNS listos; `sgl-win` en NAT, sin unir) |
| GPO y perfil por rol | **Pendiente** (sin OUs/GPOs SGL) |
| Registro de sesión de PC | **Parcial** (`sesion_activa` existe; 0 filas, sin agente) |
| Laboratorios y equipos (HU-COM-03) | **Implementado** (CA-06 verificado con `sgl-win`) |
| Registro y monitoreo de PCs con MeshCentral (HU-COM-04) | **Implementado** (MAC/hostname/IP, sync y estado en vivo) |
| Grupos y membresías con Samba AD (HU-COM-05) | **Implementado** (CRUD, estudiantes, docentes y auditoría) |
| Catálogo de aplicaciones e instaladores (HU-COM-07) | **Implementado** (SHA-256, metadatos y vínculos por laboratorio) |
| Despliegue remoto de aplicaciones (HU-COM-08) | **Implementado** (despliegue masivo vía MeshCentral, estado por equipo y reintentos) |
| Permisos por grupo y políticas de ejecución (HU-COM-06) | **Implementado** (matriz app × grupo, AppLocker y despliegue a las PCs) |
| MeshCentral + `/mesh` | **Funciona** (agente `sgl-win` conectado y sincronizado) |
| Esquema PostgreSQL | 19 tablas + triggers de inmutabilidad |
| Specs RN-001…RN-020 | **Presentes** |

## HU-COM-14 — estado de criterios de aceptación

| CA | Estado | Evidencia |
|---|---|---|
| CA-01 Formulario de login | ✅ | `frontend/src/views/auth/LoginView.vue` |
| CA-02 Validación contra Samba AD (LDAPS) | ✅ | `backend/src/modules/auth/ldap.service.js` |
| CA-03 JWT con uid/rol/permisos y expiración | ✅ | `auth.service.js`, `utils/jwt.js`, `JWT_EXPIRES` |
| CA-04 Roles web habilitados | ✅ | `config/permissions.js` (ESTUDIANTE rechazado) |
| CA-05 Redirección por rol | ✅ | `/academico`, `/tecnico`, `/docencia` |
| CA-06 Menú y vistas dinámicas | ✅ | `layouts/AdminLayout.vue` |
| CA-07 Matriz de permisos | ✅ | `config/permissions.js`, `specs/hu-14.md` §4 (Admin Técnico con `users:read`/`users:manage` por HU-COM-02) |
| CA-08 Denegación 403 + página | ✅ | `rbac.middleware.js`, `views/errors/AccessDeniedView.vue` |
| CA-09 Error genérico + bloqueo | ✅ | `AUTH_MAX_ATTEMPTS`, `AUTH_LOCK_MINUTES` |
| CA-10 Logout invalida token | ✅ | `sesion_web.revocada_en` |
| CA-11 Expiración por inactividad | ✅ | `SESSION_IDLE_MINUTES`, heartbeat, aviso UI |
| CA-12 Auditoría de acceso | ✅ | `evento_autenticacion` append-only |
| CA-13 Protección de rutas y APIs | ✅ | `auth.middleware.js`, guard Vue Router |
| CA-14 Inactivo / sin rol | ✅ | `auth.service.js`, `auth.middleware.js` |

### Verificación en vivo (2026-11-04, `192.168.100.58`)

Pruebas ejecutadas contra el stack desplegado (HTTPS):

| Prueba | Resultado |
|---|---|
| Login `aacademico` (ADMIN_ACADEMICO) | 200, 9 permisos, redirección a `/academico` |
| Login `atecnico` (ADMIN_TECNICO) | 200, resumen de laboratorios/equipos |
| Login `docente` (DOCENTE) | 200, resumen de sus grupos |
| Login `estudiante` (ESTUDIANTE) | 403 `ROL_NO_HABILITADO` |
| Contraseña inválida | 401 `CREDENCIALES_INVALIDAS` (mensaje genérico) |
| 5 intentos fallidos | Bloqueo 15 min; 6.º intento 401 `CUENTA_BLOQUEADA` |
| `/api/users` como docente | Solo el estudiante de `GRP-1A` |
| `/api/users` como admin académico | Los 4 usuarios |
| `/api/audit/events` como docente | 403 `ACCESO_DENEGADO` (auditado) |
| `/api/audit/events` como admin académico | 200 con eventos |
| `/api/monitoring/overview` como docente | 200, grupo `GRP-1A` |
| Logout y reuso del token | 401 `SESION_REVOCADA` |
| Inactividad forzada (`ultima_actividad` -2 h) | 401 `SESION_EXPIRADA`, motivo `INACTIVIDAD` |
| `UPDATE`/`DELETE` sobre `evento_autenticacion` | Rechazado por trigger `trg_evento_auth_inmutable` |
| `http://…:8080` con `FORCE_HTTPS=false` (local) | 200, SPA y API por HTTP |
| `http://…:8080` con `FORCE_HTTPS=true` (prod) | 308 → `https://…` (conserva POST) |
| `https://…` | 200 |

Los eventos quedan en `evento_autenticacion` con `LOGIN`, `LOGOUT`,
`LOGIN_FALLIDO`, `LOGIN_BLOQUEADO`, `ROL_NO_HABILITADO`, `ACCESO_DENEGADO` y
`SESION_EXPIRADA`.

## HU-COM-02 — estado de criterios de aceptación

| CA | Estado | Evidencia |
|---|---|---|
| CA-01 Sincronización con Samba AD | ✅ | `users.service.js` + `ldap.service.js` (LDAPS, con compensación) |
| CA-02 Asignación de roles | ✅ | `users.validators.js` (4 roles válidos) |
| CA-03 Unicidad de cuenta | ✅ | `assertNoDuplicates` + `uq_usuario_uid/email` |
| CA-04 Creación/Modificación/Desactivación | ✅ | `POST/PATCH /api/users`, LDAP `add`/`modify` |

**RBAC:** `users:read` y `users:manage` para Admin Académico y Admin Técnico;
el Docente conserva solo lectura limitada a sus grupos (RN-017).

**Auditoría (RN-010):** altas y modificaciones se insertan en `auditoria`
(acciones `CREAR`/`ACTUALIZAR`, entidad `usuario`) con actor, IP, fecha y
detalle. La contraseña nunca se almacena ni se audita.

**Desactivación:** actualiza `usuario.activo`, deshabilita la cuenta en Samba AD
(`userAccountControl = 514`) y revoca las sesiones web activas.

### Verificación en vivo HU-COM-02 (2026-11-04)

| Prueba | Resultado |
|---|---|
| Alta por LDAPS con contraseña | Cuenta creada en AD (`samba_sid`/`samba_dn`) y en PostgreSQL |
| Login con la cuenta creada | 200 |
| `uid` duplicado en BD | 409 `UID_DUPLICADO` |
| `uid` existente solo en AD | 409 `UID_DUPLICADO_AD` |
| `email` duplicado | 409 `EMAIL_DUPLICADO` |
| Rol inválido / contraseña débil | 400 con detalle |
| Edición de nombre/correo | Reflejada en AD y PostgreSQL |
| Cambio de contraseña | Nueva clave 200; clave anterior 401 (`old password allowed period = 0`) |
| Desactivación | AD `UAC=514`, `activo=false`, sesiones revocadas |
| Reactivación | Login correcto de nuevo |
| Docente intenta crear/editar | 403 `ACCESO_DENEGADO` |
| Admin Técnico crea/edita | Permitido |
| Registro en `auditoria` | `CREAR`/`ACTUALIZAR` por cada operación |

## HU-COM-01 — estado de criterios de aceptación

Leyenda: ✅ cumple · 🟡 parcial · ⏳ pendiente de implementación/verificación.

| CA | Requisito | Estado | Evidencia / brecha |
|---|---|---|---|
| CA-01 | Validación contra Samba AD (LDAP/Kerberos) | ✅ | `ldap.service.js` + `auth.service.js` (LDAPS); probado 2026-11-04. |
| CA-02 | Sesión/JWT con rol y permisos | ✅ | JWT con `uid`, `rol`, `permisos`, `jti`; `sesion_web` revocable. |
| CA-03 | Error sin información sensible | 🟡 | Credenciales inválidas → 401 genérico; 403 de rol/sin acceso revela que la cuenta existe. Falta decidir si se unifica a 401. |
| CA-04 | Kerberos/LDAP en PC cliente | ⏳ | KDC (88/tcp), LDAP/LDAPS y SRV listos; `sgl-win` está en NAT y no unida al dominio. |
| CA-05 | Perfil y GPO por rol | ⏳ | Sin OUs ni GPOs SGL; `samba-tool gpo listall` solo muestra las políticas por defecto. |
| CA-06 | Registro de sesión (usuario, PC, hora) | 🟡 | Web auditada (`sesion_web` + `evento_autenticacion`); `sesion_activa` tiene 0 filas y no hay agente de logon. |
| CA-07 | Error genérico en PC | 🟡 | Windows/AD lo hace nativamente; falta probarlo con la PC unida. |
| CA-08 | LDAPS backend–Samba AD | ✅ | `ldaps://dc.clockwork.local:636` + CA + `rejectUnauthorized=true`. |
| CA-09 | Tickets Kerberos en PC | ⏳ | KDC/SRV activos; falta verificar `klist`/TGT en la PC cliente. |
| CA-10 | Respuesta API con rol | ✅ | `POST /api/auth/login` devuelve token, usuario, permisos y sesión. |
| CA-11 | Sin contraseñas en texto plano | ✅ | `usuario` no tiene columna de contraseña; bind LDAP en memoria; `.env` solo guarda credencial de servicio. |

**Resumen HU-COM-01:** 5 CA cumplidos · 3 parciales · 3 pendientes.

**Brechas principales:**

1. **PC cliente:** `sgl-win` ya está en la red interna `sgl` (IP `192.168.100.100`, sesión `CLOCKWORK\luan`); faltan las GPO por rol y la verificación Kerberos/GPO.
2. **Grupos/OUs/GPO:** no hay grupos AD de rol ni GPOs SGL. Falta crear `SGL-AdminAcademico`, `SGL-AdminTecnico`, `SGL-Docente`, `SGL-Estudiante`, OUs y GPO por rol.
3. **Perfil:** definir perfil local por defecto, móvil o obligatorio. La animación de primer inicio se desactiva con `EnableFirstLogonAnimation=0`.
4. **Sesión de PC:** `sesion_activa` existe pero no se registra al logon; falta endpoint de agente, autenticación máquina–API y script/GPO o servicio en la PC.
5. **CA-03:** decidir entre 401 genérico para todos los fallos o mantener 403 para cuentas válidas sin rol.

El detalle y el plan están en `specs/hu-01.md`.

## HU-COM-03 — estado de criterios de aceptación

| CA | Requisito | Estado | Evidencia |
|---|---|---|---|
| CA-01 | Registrar nombre, ubicación y subred | ✅ | `POST /api/labs`, tabla `laboratorio` |
| CA-02 | Validar subred IPv4/CIDR | ✅ | `labs.validators.js` + trigger `tg_laboratorio_subred_valida` |
| CA-03 | Listar laboratorios ordenados con detalle | ✅ | `GET /api/labs` (orden por nombre + conteo de equipos) |
| CA-04 | Equipo obligatoriamente asociado a un laboratorio | ✅ | `equipo.laboratorio_id NOT NULL` + FK `RESTRICT`; API valida |
| CA-05 | MAC y hostname únicos | ✅ | `uq_equipo_mac`, `uq_equipo_hostname`; normalización + 409 |
| CA-06 | Estado/IP/usuario desde MeshCentral | ✅ | Bridge `/devices` + sync verificado: `sgl-win` ENCENDIDO, `192.168.100.100`, usuario `CLOCKWORK\luan` |

**Resumen HU-COM-03:** 6 CA cumplidos · 0 pendientes.

**Verificación CA-06:**

1. MeshCentral activo y publicado en `/mesh/`.
2. Cuenta `sgladmin` y grupo `SGL-Lab` creados.
3. Agente instalado en el Win10 (`sgl-win`) y conectado.
4. `Equipos → Sincronizar estado` actualizó estado/IP/usuario correctamente.

> El backend debe usar `MESH_API_URL=http://172.18.0.1:4444`.
> `host.docker.internal` resuelve a `172.17.0.1`, donde el bridge no escucha,
> y produce `fetch failed`.

El instalador Windows para `SGL-Lab` quedó publicado en `/mesh/instalador`
(`meshagent64-SGL-Lab.exe`, 3.4 MB) y se sirve desde `frontend/static`.
El detalle está en `specs/hu-03.md` y la instalación en `docs/meshcentral.md`.

## HU-COM-04 — estado de criterios de aceptación

| CA | Requisito | Estado | Evidencia |
|---|---|---|---|
| CA-01 | Instalación del agente y conexión WSS | ✅ | `docs/agent-windows.md`; `sgl-win` conectado a `SGL-Lab` |
| CA-02 | Registro de MAC, hostname e IP | ✅ | Bridge `ListDevices --details` (`net.netif2.mac`) + sync |
| CA-03 | Conexión saliente sin puertos entrantes | ✅ | MeshAgent inicia WSS hacia `/mesh/` |
| CA-04 | Listado de PCs por laboratorio | ✅ | `GET /api/equipment?laboratorio_id=` + filtro UI |
| CA-05 | Estado, IP y usuario activo desde MeshCentral | ✅ | `meshcentral.service.js` + bridge |
| CA-06 | Datos actualizados en el panel | ✅ | Sync bajo demanda + auto-refresco cada 30 s |
| CA-07 | Backend consume API de MeshCentral | ✅ | Bridge `172.18.0.1:4444` |
| CA-08 | Actualización periódica o bajo demanda | ✅ | `MESH_SYNC_MINUTES` + `GET /api/equipment` |
| CA-09 | Error controlado con estado Desconocido | ✅ | `mesh_error:true`, `estado=DESCONOCIDO`, log y auditoría |

**Resumen HU-COM-04:** 9 CA cumplidos · 0 pendientes.

**Registro automático:** el bridge obtiene MAC/hostname/IP de MeshCentral y el
backend hace upsert en `equipo`; si la PC no existe, infiere el laboratorio por
`laboratorio.subred` (RN-001). Si no hay MAC o laboratorio, no crea el registro
y lo reporta en el resumen.

**Errores:** si MeshCentral no responde, la API devuelve las filas con
`mesh_error: true` y `estado: "DESCONOCIDO"`; el detalle técnico queda solo en
el log.

El detalle está en `specs/hu-04.md`.

## HU-COM-05 — estado de criterios de aceptación

| CA | Requisito | Estado | Evidencia |
|---|---|---|---|
| CA-01 | Código único en plataforma y Samba AD | ✅ | `groups.service.js`, `ldap.service.js`, `uq_grupo_codigo` |
| CA-02 | Sincronización de altas/modificaciones con Samba AD | ✅ | `groups.service.create/update` + `ldap.createGroup/updateGroup` |
| CA-03 | No se eliminan cuentas de estudiantes al borrar un grupo | ✅ | `groups.service.remove` + cascada solo en relaciones |
| CA-04 | Operaciones LDAP sobre grupos | ✅ | `ldap.service.js` (create/update/delete/members) |
| CA-05 | Persistencia de `samba_sid`/`samba_dn` | ✅ | Tabla `grupo` y servicio de grupos |
| CA-06 | Eliminación segura de relaciones | ✅ | `membresia_grupo`/`asignacion_docente` con `ON DELETE CASCADE` |
| CA-07 | Solo estudiantes como miembros | ✅ | Validación `rol = ESTUDIANTE` |
| CA-08 | Múltiple membresía | ✅ | `uq_membresia_usuario_grupo` + alta por grupo |
| CA-09 | Asignación de docentes para monitoreo | ✅ | `asignacion_docente` + `addTeacher` |
| CA-10 | Auditoría de acciones críticas | ✅ | `recordAuditEvent` en altas, cambios y membresías |

**Resumen HU-COM-05:** 10 CA cumplidos · 0 pendientes.

**Decisiones de diseño:**

- El código del grupo se normaliza a mayúsculas y es inmutable después de la
  creación para no romper el DN ni las membresías en Samba AD.
- Los estudiantes se agregan como miembros del grupo en Samba AD.
- Los docentes **no** se agregan como miembros del grupo en Samba AD; se
  asignan en `asignacion_docente` para habilitar el monitoreo (RN-015).
- El Docente solo puede listar/consultar los grupos que tiene asignados
  (RN-017).

El detalle está en `specs/hu-05.md`.

## HU-COM-07 — estado de criterios de aceptación

| CA | Requisito | Estado | Evidencia |
|---|---|---|---|
| CA-01 | Verificación del checksum antes de guardar (RNF-006) | ✅ | `apps.checksum.js` + `apps.service.create/update` (SHA-256 por streaming) |
| CA-02 | Solo se despliega si la app está vinculada al laboratorio (RN-002) | ✅ | `apps.service.link` + `assertAppLinked` |
| CA-03 | Una sola versión activa por app y laboratorio (RN-007) | ✅ | `apps.service.link` + índice `ux_vinculo_app_lab_activo` |
| CA-04 | Registro de ruta, parámetros, versión y checksum | ✅ | Tabla `aplicacion`, `apps.validators.js` y `AppsView.vue` |
| CA-05 | Auditoría de acciones críticas (RN-010) | ✅ | `recordAuditEvent` en altas, cambios, bajas, vínculos y verificación |
| CA-06 | Subida del instalador con SHA-256 automático (RNF-006) | ✅ | `apps.upload.js` + `apps.storage.js` + `apps.service.createFromUpload` |

**Resumen HU-COM-07:** 6 CA cumplidos · 0 pendientes.

**Decisiones de diseño:**

- El checksum se normaliza a SHA-256 hexadecimal (64 caracteres) y se calcula
  leyendo el archivo por streaming.
- Si el instalador no existe, la ruta es remota o el hash no coincide, no se
  guarda la fila y se devuelve `400`.
- El vínculo app-laboratorio se crea sin permisos de grupo (RN-008); los
  permisos se habilitan en una HU posterior.
- Desvincular conserva el historial (`activo = false`), por lo que RN-007 solo
  limita las filas activas.
- Con vínculos activos no se permite cambiar nombre ni versión de la app.
- `assertAppLinked` queda disponible para HU-COM-08 como precondición de
  despliegue (RN-002).
- El instalador se puede subir desde el navegador (arrastrar `.msi`/`.exe`):
  el backend lo guarda en `APPS_INSTALLERS_DIR`, calcula el SHA-256 y da de
  alta la app en un paso. La columna `aplicacion.origen` distingue `upload`
  de `ruta` (migración `05-hu07-apps-upload.sql`).
- Extensiones permitidas: `.msi`, `.exe`, `.msix`, `.appx`, `.zip`. Tamaño
  máximo por archivo: `APPS_MAX_UPLOAD_MB` (1024 MB por defecto).
- Si el alta de una app subida falla, el archivo se borra del servidor; al
  eliminar la app, el instalador se borra solo si ninguna otra app lo usa.

El detalle está en `specs/hu-07.md`.

## HU-COM-08 — estado de criterios de aceptación

| CA | Requisito | Estado | Evidencia |
|---|---|---|---|
| CA-01 | Despliegue masivo silencioso en menos de 2 s (RN-003, RNF-004) | ✓ | `deployments.service.create` despacha en paralelo sin esperar la respuesta (≈130 ms medidos) |
| CA-02 | Equipos apagados quedan PENDIENTE y se reintentan (RNF-005, RNF-006) | ✓ | `despacharEquipo` + barrido `deployments.sync` + `POST /:id/retry` |
| CA-03 | Monitoreo de estado por equipo (RF-017) | ✓ | `despliegue_equipo.estado` + `DeploymentDetailModal.vue` |
| CA-04 | Desinstalación remota | ✓ | Tipo `DESINSTALAR` + `aplicacion.comando_desinstalacion` |
| CA-05 | Validación del vínculo antes de desplegar | ✓ | `assertAppLinked` → `409 APP_NO_VINCULADA` |
| CA-06 | Envío de comandos a MeshCentral | ✓ | `deployments.mesh.desplegar` → bridge `POST /desplegar` |
| CA-07 | Actualización de estados según los reportes | ✓ | `despacharEquipo` + refresco automático de la UI |
| CA-08 | Reintentos de equipos pendientes o fallidos | ✓ | `POST /api/deployments/:id/retry` y barrido `sweep` |
| CA-09 | Recepción vía agente con privilegios de sistema (RN-005) | ✓ | `meshctrl RunCommand --powershell` (agente como servicio `LocalSystem`) |
| CA-10 | Instalación silenciosa | ✓ | `msiexec /qn` o `Start-Process -WindowStyle Hidden` |
| CA-11 | Reporte de estado desde la PC | ✓ | El agente devuelve `SGL_EXITCODE` y el bridge lo parsea |

**Resumen HU-COM-08:** 11 CA cumplidos · 0 pendientes.

**Decisiones de diseño:**

- El despliegue siempre nace de un vínculo app-laboratorio (`despliegue.vinculo_id`),
  así que RN-002 se cumple por esquema además de por la validación del servicio.
- La orden se envía sin esperar la respuesta del equipo: el alta responde en
  menos de 2 segundos (CA-01) y el resultado por equipo se refleja después.
- MeshCentral encola las órdenes de los equipos apagados pero no las ejecuta;
  por eso el backend las mantiene en PENDIENTE y las reintenta cuando el
  agente vuelve a estar en línea.
- La desinstalación usa `aplicacion.comando_desinstalacion`; para los `.msi`
  sin comando propio se usa `msiexec /x`.
- El bridge se despliega como servicio systemd (`sgl-mesh-bridge`) y expone
  `POST /desplegar` además de `GET /devices`.

El detalle está en `specs/hu-08.md`.
## HU-COM-06 — estado de criterios de aceptación

| CA | Requisito | Estado | Evidencia |
|---|---|---|---|
| CA-01 | Restricción por defecto (RN-008) | ✓ | `permiso_app_grupo.habilitado DEFAULT FALSE`; ausencia = `false` en la matriz |
| CA-02 | Unión de permisos (RN-013) | ✓ | `policies.service.efectivos` (unión por laboratorio) |
| CA-03 | Bloqueo efectivo (RN-009) | ✓ | Política AppLocker `EnforcementMode="Enabled"` con reglas `Allow` por SID |
| CA-04 | Aplicación de políticas en la PC | ✓ | `Set-AppLockerPolicy -XmlPolicy` + `AppIDSvc` activo |
| CA-05 | Bloqueo local y registro del intento | ✓ | AppLocker bloquea y registra en su Event Log |
| CA-06 | Unión de permisos del estudiante | ✓ | `GET /api/policies/users/:id/effective` |
| CA-07 | Generación de políticas | ✓ | `policies.service.generar` + XML por grupo y por laboratorio |
| CA-08 | Despliegue vía MeshCentral | ✓ | `POST /api/policies/:id/deploy` → bridge `/politica` |
| CA-09 | Auditoría del despliegue | ✓ | Eventos `CAMBIO_PERMISO`, `EJECUTAR` y `DESPLEGAR` |

**Resumen HU-COM-06:** 9 CA cumplidos · 0 pendientes.

**Decisiones de diseño:**

- La regla AppLocker se genera por **grupo** (SID de Samba AD) y se combina en
  una política por laboratorio; así un estudiante solo recibe las apps de sus
  grupos (RN-004/RN-013).
- `politica_ejecucion` guarda el XML por grupo y `politica_laboratorio` el XML
  combinado que se despliega.
- `aplicacion.ruta_ejecutable` es la ruta del binario instalado en la PC; si
  falta, la app se excluye de la política y la interfaz lo avisa.
- El despliegue usa la misma infraestructura que HU-COM-08 (estado en vivo de
  MeshCentral, despacho por equipo y auditoría).
- Verificado en `sgl-win`: `SrpV2\Exe` con `EnforcementMode=1`, la regla de
  7-Zip para el SID de `GRP-1A`, y la tarea `SGL-Lockdown` creada con
  `C:\ProgramData\SGL\SGL-Lockdown.ps1`.

El detalle está en `specs/hu-06.md`.
## Leyenda RN

- **Cubierta**: la regla se garantiza con el esquema o el código actual.
- **Parcial**: existe la base (tabla, trigger, API o infraestructura) pero falta parte funcional.
- **Pendiente**: no implementada.

| Regla | Estado | Evidencia verificada | Falta |
|---|---|---|---|
| RN-001 | Cubierta (BD + API/UI + sync) | `equipo.laboratorio_id NOT NULL` + FK `RESTRICT`; `/api/equipment` valida el laboratorio; el sync lo infiere por subred y no crea PCs huérfanas | — |
| RN-002 | Cubierta (API + despliegue) | `apps.service.link` crea el vínculo app-laboratorio y `assertAppLinked` lo exige antes de desplegar (HU-COM-07); el despliegue de HU-COM-08 lo invoca y responde `409 APP_NO_VINCULADA` | — |
| RN-003 | Cubierta (API) | `deployments.service.create` genera un despliegue para todas las PCs del laboratorio y no permite seleccionar PCs individuales (HU-COM-08) | — |
| RN-004 | Cubierta (API) | `policies.service.efectivos` calcula la unión de permisos de los grupos del estudiante; la regla AppLocker se limita al SID del grupo y al laboratorio del vínculo (HU-COM-06) | Intento de ejecución bloqueado visible en SGL |
| RN-005 | Cubierta (infra + API) | El agente se instala como servicio Windows `LocalSystem` (`docs/agent-windows.md`); las órdenes viajan por `meshctrl RunCommand --powershell` (HU-COM-08) | — |
| RN-006 | Cubierta (BD + API) | `despliegue_equipo.estado/intentos/mensaje_error`; `equipo.estado/ultimo_reporte` (HU-COM-03/HU-COM-04); reintento individual (`POST /:id/retry` con `equipo_id`) y masivo, más barrido automático de los equipos que se encienden (HU-COM-08) | — |
| RN-007 | Cubierta (BD + API) | `app_nombre` + índice único parcial `(lower(app_nombre), laboratorio_id) WHERE activo`; `apps.service.link` rechaza otra versión activa y permite históricas inactivas | — |
| RN-008 | Cubierta (BD + API + PC) | `permiso_app_grupo.habilitado DEFAULT FALSE`; el vínculo no crea permisos; la política AppLocker usa `EnforcementMode="Enabled"` y deniega por defecto lo no autorizado (HU-COM-06) | — |
| RN-009 | Cubierta (PC + API) | AppLocker aplica reglas `Allow` por SID de grupo y bloquea el resto; el despliegue y los cambios de permisos se auditan. El Event Log de AppLocker queda disponible en la PC (HU-COM-06) | Mostrar los intentos bloqueados en SGL |
| RN-010 | Parcial | `auditoria` inmutable + `evento_autenticacion` append-only (login/logout/fallos/403) + altas/ediciones de usuario (HU-COM-02) + laboratorios/equipos y sincronizaciones MeshCentral (HU-COM-03/04) + grupos/membresías (HU-COM-05) + catálogo, subidas y vínculos de aplicaciones (HU-COM-07) + despliegues y reintentos (HU-COM-08) + permisos por grupo y despliegue de políticas (HU-COM-06) | Auditar logon de PC en SGL (HU-COM-01) y listas blancas |
| RN-011 | Cubierta (BD + API + Samba AD) | `grupo.codigo UNIQUE`; validación en `groups.service` y `ldap.findGroupByCode`; `GRP-1A` creado en Samba AD y BD | — |
| RN-012 | Cubierta (BD + API + Samba AD) | `membresia_grupo` N:M; alta/baja por API y sincronización con `member` de Samba AD; múltiple membresía | — |
| RN-013 | Cubierta (API) | `GET /api/policies/users/:id/effective` devuelve la unión de apps de todos los grupos activos del estudiante, agrupada por laboratorio (HU-COM-06) | — |
| RN-014 | Cubierta (BD + API) | FK `ON DELETE CASCADE` en membresías/asignaciones; `groups.service.remove` elimina el grupo en Samba AD y las relaciones, sin borrar usuarios | — |
| RN-015 | Cubierta (API + UI) | `groups.service.addStudent` exige `rol = ESTUDIANTE`; `addTeacher` exige `rol = DOCENTE` y usa `asignacion_docente`; la UI filtra por rol | Trigger de BD como defensa en profundidad |
| RN-016 | Parcial | Tabla `lista_blanca_url` por grupo | Unión de listas + proxy/firewall |
| RN-017 | Parcial | Docente limitado a sus grupos en `/users`, `/dashboard/summary`, `/monitoring/overview` y `/groups` (lista/detalle); asignación docente en `asignacion_docente` (HU-COM-05) | Validación antes de abrir KVM/MeshCentral |
| RN-018 | Cubierta (infra) | Samba AD, Docker, MeshCentral y agente Windows operativos; gestión central de inventario y estado | — |
| RN-019 | Parcial (infra, desvío) | `enp0s3` es puente a **Wi-Fi**; `enp0s8` es la red interna `sgl` | Administración por Ethernet (no Wi-Fi); topología física de laboratorio |
| RN-020 | Parcial | Lectura de `sesion_activa` en panel docente (RN-017); 0 filas registradas | Registro automático al login de la PC (HU-COM-01) |

**Resumen:** 15 cubiertas · 5 parciales · 0 pendientes.

## Observaciones

1. **RN-007 — resuelto:** se eliminó `uq_vinculo_app_lab`; se añadió `app_nombre` (sincronizado por trigger) y el índice único parcial `ux_vinculo_app_lab_activo (lower(app_nombre), laboratorio_id) WHERE activo = TRUE`. Probado: rechaza dos versiones activas de la misma app, permite históricas inactivas y no bloquea apps distintas.
2. **RN-006:** la regla usa `Instalado/Fallido/Pendiente`; el esquema usa `COMPLETADO/EN_PROCESO/FALLIDO/PENDIENTE`. Mapeo: `COMPLETADO = Instalado`.
3. **RN-015:** el bootstrap respeta la regla, pero la BD todavía no impide por sí sola asignar un docente a `membresia_grupo`. Falta trigger o servicio de asignación.
4. **RN-010:** `auditoria.usuario_id` es `NOT NULL`; las acciones del sistema necesitan un usuario técnico. Los eventos de autenticación usan una tabla separada (`evento_autenticacion`) porque los intentos fallidos pueden no tener usuario.
5. **RN-004/RN-013/RN-016:** requieren una capa de cálculo de permisos (unión de grupos) que aún no existe.
6. **RN-017/RN-020:** HU-COM-14 implementa la parte de consulta y autorización; la apertura de KVM y el registro automático de sesión desde la PC quedan para sus HU.
7. **HU-COM-02 — contraseñas:** Samba AD mantiene la contraseña anterior válida durante `old password allowed period` (60 min por defecto). Se configuró `old password allowed period = 0` en `/etc/samba/smb.conf` para que el cambio sea inmediato; respaldo en `smb.conf.bak-hu02`.
8. **HU-COM-02 — trigger de auditoría:** la migración `03-hu02-auth-fk.sql` permite solo la anonimización de `evento_autenticacion.usuario_id` (`ON DELETE SET NULL`) al eliminar una cuenta; `UPDATE`/`DELETE` generales siguen bloqueados.
9. **HU-COM-01 — alcance:** la parte web (CA-01/02/08/10/11) ya está cubierta por HU-COM-14. El trabajo pendiente es la PC cliente Windows (CA-04/09), la carga de perfil/GPO por rol (CA-05) y el registro de sesión de PC (CA-06).
10. **HU-COM-01 — estado de la PC:** la VM `sgl-win` está en **NAT**, no en la red interna `sgl`. Por eso no toma DHCP de `192.168.100.58` y no puede unirse al dominio. Debe cambiarse a la red interna `sgl` antes de probar CA-04/CA-07/CA-09.
11. **HU-COM-01 — GPO/sesiones:** `samba-tool gpo listall` solo muestra las políticas por defecto; no hay OUs ni GPOs SGL. `sesion_activa` existe pero tiene **0 filas**; falta el agente/script de logon.
12. **RN-019 — desvío de infraestructura:** el adaptador puente `enp0s3` está sobre Wi-Fi (`Intel Wi-Fi 6 AX201`) y `enp0s8` es una red interna virtual de VirtualBox. Para cumplir RN-019 en producción, la administración y la red de laboratorio deben ir por Ethernet, no por Wi-Fi.
13. **HU-COM-03 — laboratorios/equipos:** CRUD implementado con validación de subred, laboratorio obligatorio, unicidad de MAC/hostname y auditoría. CA-06 (estado desde MeshCentral) está implementado con bridge + UI, pendiente de probar con el agente instalado.
14. **MeshCentral:** instalado como servicio systemd en `/opt/meshcentral` (fuera de los 3 contenedores de SGL), publicado en `/mesh/` vía Nginx y con bridge local en `172.18.0.1:4444`. Guía en `docs/meshcentral.md`.
15. **Acceso web tras el cambio de red:** desde el host usar `http://192.168.0.50:8080/`; desde el Win10 en `sgl`, `http://192.168.100.58:8080/`. La IP `192.168.100.58` ya no es alcanzable desde el host porque no está en la red `sgl`.
16. **HU-COM-07 — verificación de integridad:** el backend calcula el SHA-256 del archivo indicado en `ruta_instalador`; las rutas relativas se resuelven contra `APPS_INSTALLERS_DIR` (`/opt/sgl-instaladores`). El binario debe ser legible por el contenedor `sgl-backend`; no se admiten URLs remotas. El directorio debe ser escribible por el usuario
   del backend porque también es el destino de los instaladores subidos (CA-06).

## Qué significa "Cubierta (BD)"

La restricción se cumple a nivel de base de datos, pero puede faltar el endpoint o la pantalla que la ejerza. Para dar una RN por terminada se necesita: esquema + servicio/API + UI + prueba.
