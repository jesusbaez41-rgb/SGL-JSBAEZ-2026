#!/bin/bash
# =====================================================================
# HU-COM-09 - Inicialización del proxy de filtrado en contenedor (RN-016)
#
# - Levanta el contenedor `sgl-squid` (docker compose) en la red del host,
#   escuchando en 192.168.100.58:3128.
# - Detiene el Squid del host si quedó instalado de la versión anterior.
# - Instala el sincronizador que publica el squid.conf generado por el
#   backend y lo recarga cada 10 segundos.
# - Aplica la migración de base de datos si se indica.
#
# Uso (como root, en /opt/sgl-web):
#   sudo ./scripts/install-squid-hu09.sh
# =====================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecutar como root: sudo $0" >&2
    exit 1
fi

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

echo "==> Deteniendo el Squid del host (si existe)..."
systemctl disable --now squid 2>/dev/null || true

echo "==> Preparando la configuración viva..."
mkdir -p squid
if [ ! -f squid/squid.conf ] && [ -r /opt/sgl-instaladores/sgl-squid.conf ]; then
    install -m 644 /opt/sgl-instaladores/sgl-squid.conf squid/squid.conf
fi

echo "==> Levantando el contenedor sgl-squid..."
docker compose up -d squid

echo "==> Instalando el sincronizador de configuración..."
install -m 755 scripts/squid-sync.sh /opt/sgl-web/scripts/squid-sync.sh
install -m 644 scripts/sgl-squid-sync.service /etc/systemd/system/sgl-squid-sync.service
install -m 644 scripts/sgl-squid-sync.timer /etc/systemd/system/sgl-squid-sync.timer
systemctl daemon-reload
systemctl enable --now sgl-squid-sync.timer

echo "==> Permitiendo el proxy en el firewall del host (si ufw está activo)..."
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw allow from 192.168.100.0/24 to any port 3128 proto tcp >/dev/null || true
fi

echo "==> Aplicando la migración 11-hu09-navegacion.sql..."
if [ -f db/migrations/11-hu09-navegacion.sql ] && docker ps --format '{{.Names}}' | grep -q '^sgl-db$'; then
    docker exec -i sgl-db psql -U "${POSTGRES_USER:-sgl_user}" -d "${POSTGRES_DB:-sgl}" \
        -v ON_ERROR_STOP=1 < db/migrations/11-hu09-navegacion.sql
fi

echo "==> Listo. Estado:"
docker ps --filter name=sgl-squid --format '{{.Names}} {{.Status}}'
systemctl --no-pager --lines=0 status sgl-squid-sync.timer | head -n 5
