# AGENTS.md — Proyecto SGL

## Reglas de negocio (obligatorias)

Antes de editar o implementar cualquier cosa en este proyecto:

1. Lee `specs/business-rules.md` (RN-001 … RN-020).
2. Consulta `specs/compliance.md` para conocer el estado actual.
3. No contradigas ninguna regla. Si un requisito entra en conflicto con una RN,
   detente y pregunta antes de implementar.
4. Cita las RN afectadas en la descripción del cambio.
5. Actualiza `specs/compliance.md` cuando una regla pase a estar cubierta o cambie su evidencia.
6. Revisa la HU correspondiente en `specs/` (por ejemplo, `specs/hu-14.md`) antes de
   modificar autenticación, sesión o RBAC.

## Stack

- `frontend/`: Vue 3 + Vite + Tailwind + Pinia + Vue Router, servido por Nginx.
- `backend/`: Node.js + Express + Sequelize (JWT, RBAC).
- `db/`: PostgreSQL 16; esquema en `db/init/01-init.sql`.
- Docker Compose: `sgl-frontend` (8080), `sgl-backend` (3000 interno), `sgl-db` (5432 interno).
- Infra externa: Samba AD `CLOCKWORK.LOCAL`, MeshCentral y Squid (fuera de este compose).

## Convenciones

- API bajo `/api`.
- Autenticación JWT (`Authorization: Bearer <token>`).
- Auditoría obligatoria en acciones críticas (RN-010).
- Nunca exponer PostgreSQL ni el backend al host.
- Los secretos viven en `.env` (permisos 600); no versionar.
