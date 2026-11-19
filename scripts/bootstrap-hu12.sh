#!/usr/bin/env bash
#
# HU-COM-12 - Aplica la migracion de auditoria inmutable y configura el rol
# de aplicacion (sgl_app) con el password de .env.
#
# Uso:
#   sudo bash scripts/bootstrap-hu12.sh
#   docker compose up -d backend
#
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Falta .env en $(pwd)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${POSTGRES_USER:=sgl_user}"
: "${POSTGRES_DB:=sgl}"
: "${DB_APP_USER:=sgl_app}"
: "${DB_APP_PASSWORD:?Defini DB_APP_PASSWORD en .env}"

echo "Aplicando db/migrations/10-hu12-auditoria.sql ..."
docker exec -i sgl-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 -1 < db/migrations/10-hu12-auditoria.sql

echo "Configurando el password de ${DB_APP_USER} ..."
docker exec -i sgl-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 -c "ALTER ROLE ${DB_APP_USER} PASSWORD '${DB_APP_PASSWORD}';"

echo "OK. Reinicia el backend con: docker compose up -d backend"
