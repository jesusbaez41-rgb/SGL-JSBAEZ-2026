# Reglas de negocio — SGL

**Versión:** 1.0  
**Fecha:** 2026-11-04  
**Ámbito:** SGL — Sistema de Gestión de Laboratorios  
**Carácter:** normativo y obligatorio

> Toda implementación, cambio de esquema, endpoint, vista, integración o refactor
> debe cumplir estas reglas. Si un cambio entra en conflicto con una regla,
> debe detenerse y consultarse antes de continuar.

## Índice rápido

| Código | Regla |
|---|---|
| RN-001 | Pertenencia de PC a Laboratorio |
| RN-002 | Vinculación previa de App para desplegar |
| RN-003 | Despliegue por Laboratorio completo |
| RN-004 | Permiso de Uso por Grupo y Laboratorio |
| RN-005 | Privilegios de ejecución |
| RN-006 | Estado de instalación persistente |
| RN-007 | Una app, un instalador por laboratorio |
| RN-008 | Restricción por defecto |
| RN-009 | Bloqueo de aplicaciones no permitidas |
| RN-010 | Trazabilidad de acciones críticas |
| RN-011 | Código de grupo único y obligatorio |
| RN-012 | Pertenencia de estudiantes a grupos |
| RN-013 | Permisos por grupo |
| RN-014 | Eliminación de grupo |
| RN-015 | Grupos solo para rol Estudiante |
| RN-016 | Páginas web permitidas por grupo |
| RN-017 | Monitoreo docente limitado a sus grupos |
| RN-018 | Cliente fat y gestión central |
| RN-019 | Conexión por Ethernet |
| RN-020 | Registro de sesión para monitoreo |

---

## RN-001 — Pertenencia de PC a Laboratorio

| Campo | Contenido |
|---|---|
| Descripción | Toda computadora deberá pertenecer a un laboratorio y no podrá estar huérfana. |
| Aplicación | Gestión de Equipos. |
| Validación | Al registrar o actualizar una PC, el sistema deberá exigir un laboratorio válido. |

## RN-002 — Vinculación previa de App para desplegar

| Campo | Contenido |
|---|---|
| Descripción | Una app no podrá desplegarse en un laboratorio si no fue vinculada previamente a ese laboratorio. |
| Aplicación | Despliegue de aplicaciones. |
| Validación | Antes de disparar la instalación, el sistema deberá verificar el vínculo app-laboratorio. |

## RN-003 — Despliegue por Laboratorio completo

| Campo | Contenido |
|---|---|
| Descripción | Al disparar una instalación, el sistema intentará instalar en todas las PCs activas del laboratorio; en el MVP no se seleccionarán PCs individuales. |
| Aplicación | Despliegue remoto. |
| Validación | El disparo deberá generar una lista de todas las PCs activas del laboratorio. |

## RN-004 — Permiso de Uso por Grupo y Laboratorio

| Campo | Contenido |
|---|---|
| Descripción | Un estudiante solo verá y ejecutará una app si está instalada en su laboratorio y al menos uno de sus grupos tiene permiso para esa app en ese laboratorio. |
| Aplicación | Permisos de aplicaciones. |
| Validación | El sistema deberá calcular la unión de permisos de los grupos del estudiante y verificar el laboratorio. |

## RN-005 — Privilegios de ejecución

| Campo | Contenido |
|---|---|
| Descripción | Las tareas de instalación y mantenimiento se ejecutarán en segundo plano con privilegios de sistema mediante MeshAgent. |
| Aplicación | Instalación y mantenimiento remoto. |
| Validación | Verificar que las tareas se ejecuten como servicio local con privilegios suficientes. |

## RN-006 — Estado de instalación persistente

| Campo | Contenido |
|---|---|
| Descripción | El sistema deberá guardar el estado por PC: Instalado, Fallido o Pendiente; si falla, el Admin podrá reintentar solo esa PC o todo el laboratorio. |
| Aplicación | Monitoreo de instalación. |
| Validación | El estado deberá persistir y permitir reintento individual o masivo. |

## RN-007 — Una app, un instalador por laboratorio

| Campo | Contenido |
|---|---|
| Descripción | No se podrán vincular dos versiones distintas de la misma app al mismo laboratorio simultáneamente. |
| Aplicación | Vinculación app-laboratorio. |
| Validación | Al vincular, el sistema deberá rechazar una segunda versión activa de la misma app en el mismo laboratorio. |

## RN-008 — Restricción por defecto

| Campo | Contenido |
|---|---|
| Descripción | Al vincular una nueva app a un laboratorio, por defecto ningún grupo tendrá permiso; el Admin deberá habilitarlo explícitamente. |
| Aplicación | Permisos de aplicaciones. |
| Validación | El sistema deberá crear el vínculo sin permisos de grupo y exigir habilitación posterior. |

## RN-009 — Bloqueo de aplicaciones no permitidas

| Campo | Contenido |
|---|---|
| Descripción | Si un usuario intenta ejecutar una app no autorizada para sus grupos en su laboratorio, se bloqueará mediante polkit/GPO/scripts desplegados por MeshCentral y se registrará en el log. |
| Aplicación | Control de ejecución. |
| Validación | Prueba de ejecución no autorizada debe ser bloqueada y auditada. |

## RN-010 — Trazabilidad de acciones críticas

| Campo | Contenido |
|---|---|
| Descripción | Se deberá auditar quién vinculó app a laboratorio, quién cambió permisos, quién disparó instalación y quién modificó listas blancas. |
| Aplicación | Auditoría. |
| Validación | Cada acción crítica deberá generar un registro con usuario, fecha y detalle. |

## RN-011 — Código de grupo único y obligatorio

| Campo | Contenido |
|---|---|
| Descripción | Todo grupo deberá tener un código único a nivel global y no se permitirán duplicados. |
| Aplicación | Gestión de grupos. |
| Validación | El sistema deberá rechazar cualquier código repetido en Samba AD o en la BD. |

## RN-012 — Pertenencia de estudiantes a grupos

| Campo | Contenido |
|---|---|
| Descripción | Un estudiante podrá pertenecer a uno o más grupos; la asignación la realizará un administrador sobre Samba AD. |
| Aplicación | Asignación de estudiantes. |
| Validación | El sistema deberá permitir múltiples grupos por estudiante y reflejarlo en Samba AD. |

## RN-013 — Permisos por grupo

| Campo | Contenido |
|---|---|
| Descripción | Si un estudiante pertenece a varios grupos, los permisos de aplicación se calcularán como la unión de los permisos de sus grupos. |
| Aplicación | Permisos de aplicaciones. |
| Validación | El sistema deberá aplicar la unión de permisos, no la intersección. |

## RN-014 — Eliminación de grupo

| Campo | Contenido |
|---|---|
| Descripción | Al eliminar un grupo, no se eliminarán los estudiantes; solo se eliminará la relación grupo-estudiante y grupo-docente en Samba AD y en la BD. |
| Aplicación | Gestión de grupos. |
| Validación | El sistema deberá eliminar solo las relaciones, conservando usuarios y docentes. |

## RN-015 — Grupos solo para rol Estudiante

| Campo | Contenido |
|---|---|
| Descripción | Solo los usuarios con rol Estudiante podrán ser asignados a grupos de estudiantes; docentes y administradores no pertenecerán a estos grupos, aunque los docentes se asignen a grupos para monitoreo. |
| Aplicación | Asignación de grupos. |
| Validación | El sistema deberá rechazar la asignación de usuarios con rol distinto a Estudiante. |

## RN-016 — Páginas web permitidas por grupo

| Campo | Contenido |
|---|---|
| Descripción | Cada grupo tendrá su propia lista blanca de URLs; un estudiante solo podrá acceder a las URLs de la lista blanca de al menos uno de sus grupos; si no tiene grupo, no tendrá acceso a Internet excepto recursos internos. El filtrado se implementará con proxy/firewall local configurado por MeshCentral. |
| Aplicación | Filtrado web. |
| Validación | El sistema deberá aplicar la unión de listas blancas de los grupos y bloquear el resto. |

## RN-017 — Monitoreo docente limitado a sus grupos

| Campo | Contenido |
|---|---|
| Descripción | Un Docente solo podrá monitorear las PCs donde estén logueados estudiantes que pertenezcan a los grupos que tiene asignados; no podrá monitorear otras PCs. |
| Aplicación | Monitoreo en tiempo real. |
| Validación | El sistema deberá verificar la relación docente-grupo-estudiante antes de abrir el KVM. |

## RN-018 — Cliente fat y gestión central

| Campo | Contenido |
|---|---|
| Descripción | Cada PC contará con disco duro y sistema operativo local; la autenticación y los grupos se gestionarán centralmente en Samba AD, mientras que el despliegue de software, las políticas locales y el monitoreo en tiempo real se ejecutarán mediante MeshCentral sobre red Ethernet. |
| Aplicación | Arquitectura general. |
| Validación | Verificar que cada PC tenga SO local y que las funciones centrales operen por Samba AD y MeshCentral. |

## RN-019 — Conexión por Ethernet

| Campo | Contenido |
|---|---|
| Descripción | Toda comunicación entre servidor y clientes se realizará a través de la red Ethernet del laboratorio; no se usará WiFi para administración. |
| Aplicación | Infraestructura de red. |
| Validación | El sistema deberá operar solo sobre interfaces Ethernet para administración. |

## RN-020 — Registro de sesión para monitoreo

| Campo | Contenido |
|---|---|
| Descripción | Al iniciar sesión un estudiante, el sistema deberá registrar la sesión con usuario, PC y hora contra Samba AD y la plataforma; el docente podrá ver esa PC en su panel de monitoreo. |
| Aplicación | Registro de sesiones y monitoreo. |
| Validación | Cada inicio de sesión deberá generar un registro visible para el docente autorizado. |
