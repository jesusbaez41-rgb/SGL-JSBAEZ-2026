# SGL Web — Sistema de Gestión de Laboratorios

Stack de 3 contenedores:

| Contenedor | Tecnología | Puerto |
|---|---|---|
| `sgl-frontend` | Vue 3 + Vite + Tailwind, servido por Nginx | `443:443` y `8080:80` (HTTP local; redirige solo con `FORCE_HTTPS=true`) |
| `sgl-backend` | Node.js 22 + Express + Sequelize + LDAPS | `3000` (solo red interna) |
| `sgl-db` | PostgreSQL 16 Alpine | `5432` (solo red interna) |

El frontend compilado se sirve con Nginx, que termina TLS y hace proxy de `/api`
hacia `backend:3000`. PostgreSQL y el backend **no** se exponen al host.

## Arranque

```bash
cd /opt/sgl-web
docker compose up -d --build
docker compose ps
```

- HTTPS: <https://192.168.100.58/> (certificado autofirmado)
- HTTP local: <http://192.168.100.58:8080/> (sin redirección por defecto)
- Salud API: <https://192.168.100.58/api/health>

### HTTPS local vs. producción

El comportamiento se controla con dos variables en `.env`:

| Variable | Local | Producción |
|---|---|---|
| `FORCE_HTTPS` | `false` (Nginx sirve HTTP) | `true` (Nginx responde 308 → HTTPS) |
| `VITE_FORCE_HTTPS` | `false` | `true` (el bundle redirige a HTTPS) |

Para activar HTTPS obligatorio en producción:

```bash
# .env
FORCE_HTTPS=true
VITE_FORCE_HTTPS=true

docker compose build frontend
docker compose up -d frontend
```

Para volver a desarrollo local, poner ambas en `false` y reconstruir el frontend
(`VITE_FORCE_HTTPS` se incrusta en el bundle en tiempo de build).

## Autenticación (HU-COM-14)

La plataforma valida las credenciales contra **Samba AD por LDAPS**.
No se almacenan contraseñas. El JWT incluye `uid`, `rol`, `permisos` y `jti`;
la sesión es revocable y expira por inactividad.

Bootstrap de usuarios demo:

```bash
sudo bash /opt/sgl-web/scripts/bootstrap-hu14.sh
```

| Rol | Usuario | Contraseña |
|---|---|---|
| Admin Académico | `aacademico` | `SglAcad2026!x9` |
| Admin Técnico | `atecnico` | `SglTec2026!x9` |
| Docente | `docente` | `SglDoc2026!x9` |
| Estudiante (rechazado en web) | `estudiante` | `SglEst2026!x9` |

## Estructura

```txt
sgl-web/
├─ docker-compose.yml
├─ .env / .env.example
├─ frontend/        Vue + Nginx (TLS)
├─ backend/         API REST + Sequelize + LDAPS
├─ db/init/         01-init.sql (esquema SGL)
├─ db/migrations/   02-hu14-auth.sql (sesiones y auditoría)
│                    03-hu02-auth-fk.sql (anonimización de eventos)
├─ scripts/         bootstrap-hu14.sh
└─ specs/           reglas de negocio, cumplimiento y HU
```

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/health` | Público |
| `POST` | `/api/auth/login` | Público |
| `GET` | `/api/auth/me` | Autenticado |
| `POST` | `/api/auth/logout` | Autenticado |
| `POST` | `/api/auth/heartbeat` | Autenticado |
| `GET` | `/api/users` | `users:read` |
| `GET` | `/api/users/:id` | `users:read` |
| `POST` | `/api/users` | `users:manage` |
| `PATCH` | `/api/users/:id` | `users:manage` |
| `PATCH` | `/api/users/:id/status` | `users:manage` |
| `GET` | `/api/dashboard/summary` | `dashboard:read` |
| `GET` | `/api/audit/events` | `audit:read` |
| `GET` | `/api/monitoring/overview` | `monitoring:read` |

## Comandos útiles

```bash
docker compose logs -f backend
docker compose exec db psql -U sgl_user -d sgl -c '\dt'
docker compose down            # conserva volúmenes
docker compose down -v         # borra también la base de datos
docker compose up -d --build
```

## Reglas de negocio

Las reglas RN-001 a RN-020 son normativas y obligatorias. Ver
`specs/business-rules.md`, el estado en `specs/compliance.md`, la HU de
autenticación en `specs/hu-14.md` y la de cuentas en `specs/hu-02.md`.

## Gestión de usuarios (HU-COM-02)

El Admin Académico y el Admin Técnico pueden crear, editar y desactivar cuentas
desde **Usuarios**. Cada operación se sincroniza con Samba AD por LDAPS y se
audita en la tabla `auditoria` (RN-010). El Docente solo puede consultar
estudiantes de sus grupos asignados (RN-017). Al desactivar una cuenta se
deshabilita en AD y se revocan sus sesiones web.

El cambio de contraseña se aplica por LDAPS. El DC tiene configurado
`old password allowed period = 0` en `/etc/samba/smb.conf` para invalidar la
contraseña anterior de inmediato.
