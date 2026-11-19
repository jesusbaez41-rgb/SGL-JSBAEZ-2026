# specs/ — Normativa del proyecto SGL

Esta carpeta contiene las reglas de negocio y su estado de cumplimiento.
Es **normativa vinculante**: cualquier cambio en el sistema debe respetarla.

## Documentos

| Archivo | Contenido |
|---|---|
| `business-rules.md` | RN-001 a RN-020 completas (descripción, aplicación, validación). |
| `compliance.md` | Estado actual frente a cada regla, evidencias y pendientes. |
| `hu-14.md` | HU-COM-14: autenticación, sesión, RBAC, auditoría y pruebas. |
| `hu-02.md` | HU-COM-02: CRUD y sincronización de cuentas con Samba AD. |
| `hu-01.md` | HU-COM-01: autenticación web + PC cliente, Kerberos, GPO y sesión centralizada. |
| `hu-03.md` | HU-COM-03: laboratorios, equipos y estado desde MeshCentral. |
| `hu-04.md` | HU-COM-04: registro y monitoreo de PCs con agente MeshCentral. |
| `hu-05.md` | HU-COM-05: administración de grupos y membresías con Samba AD. |
| `hu-06.md` | HU-COM-06: permisos de aplicaciones por grupo, ejecución y bloqueo con AppLocker. |
| `hu-07.md` | HU-COM-07: catálogo de aplicaciones e instaladores con verificación SHA-256 y vínculos a laboratorios. |
| `hu-08.md` | HU-COM-08: despliegue remoto de aplicaciones (instalación/desinstalación masiva vía MeshCentral). |
| `hu-12.md` | HU-COM-12: auditoría y trazabilidad inmutable (consulta, filtros, inmutabilidad y rol de aplicación). |
| `diagrama-clases.md` | Diagrama de clases UML del dominio, servicios backend y frontend (PlantUML/Mermaid). |

## Flujo obligatorio antes de implementar

1. Leer `business-rules.md`.
2. Identificar las RN afectadas por el cambio.
3. Revisar `compliance.md` para ver qué ya está cubierto.
4. Implementar sin contradecir ninguna regla.
5. Actualizar `compliance.md` con el nuevo estado y la evidencia.

## Reglas con impacto directo en el código actual

- **RN-001**: `equipo.laboratorio_id` es `NOT NULL` y FK `RESTRICT`.
- **RN-007/RN-008**: vinculación de apps y permisos por defecto.
- **RN-010**: toda acción crítica debe escribir en `auditoria` (tabla inmutable).
- **RN-011/RN-012/RN-014**: unicidad de códigos, N:M de estudiantes y borrado en cascada.
- **RN-015**: solo estudiantes pueden entrar en grupos de estudiantes.
- **RN-004/RN-013**: permisos = unión de grupos.
- **RN-016**: listas blancas = unión de grupos del estudiante.
