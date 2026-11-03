# Matriz de cumplimiento — SGL

**Última revisión:** 2026-11-04  
**Alcance:** Samba AD, carpetas privadas, stack SGL web, PostgreSQL, autenticación web (HU-COM-14), specs.

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

## Leyenda RN

- **Cubierta**: la regla se garantiza con el esquema o el código actual.
- **Parcial**: existe la base (tabla, trigger, API o infraestructura) pero falta parte funcional.
- **Pendiente**: no implementada.

| Regla | Estado | Evidencia verificada | Falta |
|---|---|---|---|
| RN-001 | Cubierta (BD) | `equipo.laboratorio_id NOT NULL` + FK `RESTRICT` | Validación en API/UI |
| RN-002 | Pendiente | — | Verificar vínculo app-lab antes de desplegar |
| RN-003 | Pendiente | — | Generar despliegue para todas las PCs activas |
| RN-004 | Pendiente | — | Cálculo de permisos por grupo + laboratorio |
| RN-005 | Pendiente | — | Integración MeshAgent como servicio |
| RN-006 | Parcial | `despliegue_equipo.estado/intentos/mensaje_error` | Reintento individual y masivo |
| RN-007 | Cubierta (BD) | `app_nombre` + índice único parcial `(lower(app_nombre), laboratorio_id) WHERE activo` | Validación en API |
| RN-008 | Cubierta (BD) | `permiso_app_grupo.habilitado DEFAULT FALSE` | Forzarlo en el servicio |
| RN-009 | Pendiente | — | Políticas polkit/GPO + auditoría |
| RN-010 | Parcial | `auditoria` inmutable + `evento_autenticacion` append-only (login/logout/fallos/403) + altas/ediciones de usuario (HU-COM-02) | Auditar apps, permisos, despliegues y listas blancas desde la API |
| RN-011 | Cubierta (BD + bootstrap) | `grupo.codigo UNIQUE`; `GRP-1A` creado en Samba AD y BD | Validación en API de grupos |
| RN-012 | Cubierta (BD + bootstrap) | `membresia_grupo` N:M; estudiante demo en `GRP-1A` | Sincronización automática desde la API |
| RN-013 | Pendiente | — | Unión de permisos de grupos |
| RN-014 | Cubierta (BD) | FK `ON DELETE CASCADE` en membresías/asignaciones | Borrado en Samba AD |
| RN-015 | Parcial | El bootstrap inserta en `membresia_grupo` solo `rol = ESTUDIANTE`; el docente va a `asignacion_docente` | Trigger/API que rechace otros roles |
| RN-016 | Parcial | Tabla `lista_blanca_url` por grupo | Unión de listas + proxy/firewall |
| RN-017 | Parcial | Docente limitado a sus grupos en `/users`, `/dashboard/summary` y `/monitoring/overview` | Validación antes de abrir KVM/MeshCentral |
| RN-018 | Parcial (infra) | Samba AD y Docker operativos | MeshCentral |
| RN-019 | Parcial (infra) | Administración por `enp0s3` (Ethernet) | Bloqueo explícito de WiFi |
| RN-020 | Parcial | Lectura de `sesion_activa` en panel docente (RN-017) | Registro automático al login de la PC |

**Resumen:** 6 cubiertas · 8 parciales · 6 pendientes.

## Observaciones

1. **RN-007 — resuelto:** se eliminó `uq_vinculo_app_lab`; se añadió `app_nombre` (sincronizado por trigger) y el índice único parcial `ux_vinculo_app_lab_activo (lower(app_nombre), laboratorio_id) WHERE activo = TRUE`. Probado: rechaza dos versiones activas de la misma app, permite históricas inactivas y no bloquea apps distintas.
2. **RN-006:** la regla usa `Instalado/Fallido/Pendiente`; el esquema usa `COMPLETADO/EN_PROCESO/FALLIDO/PENDIENTE`. Mapeo: `COMPLETADO = Instalado`.
3. **RN-015:** el bootstrap respeta la regla, pero la BD todavía no impide por sí sola asignar un docente a `membresia_grupo`. Falta trigger o servicio de asignación.
4. **RN-010:** `auditoria.usuario_id` es `NOT NULL`; las acciones del sistema necesitan un usuario técnico. Los eventos de autenticación usan una tabla separada (`evento_autenticacion`) porque los intentos fallidos pueden no tener usuario.
5. **RN-004/RN-013/RN-016:** requieren una capa de cálculo de permisos (unión de grupos) que aún no existe.
6. **RN-017/RN-020:** HU-COM-14 implementa la parte de consulta y autorización; la apertura de KVM y el registro automático de sesión desde la PC quedan para sus HU.
7. **HU-COM-02 — contraseñas:** Samba AD mantiene la contraseña anterior válida durante `old password allowed period` (60 min por defecto). Se configuró `old password allowed period = 0` en `/etc/samba/smb.conf` para que el cambio sea inmediato; respaldo en `smb.conf.bak-hu02`.
8. **HU-COM-02 — trigger de auditoría:** la migración `03-hu02-auth-fk.sql` permite solo la anonimización de `evento_autenticacion.usuario_id` (`ON DELETE SET NULL`) al eliminar una cuenta; `UPDATE`/`DELETE` generales siguen bloqueados.

## Qué significa "Cubierta (BD)"

La restricción se cumple a nivel de base de datos, pero puede faltar el endpoint o la pantalla que la ejerza. Para dar una RN por terminada se necesita: esquema + servicio/API + UI + prueba.
