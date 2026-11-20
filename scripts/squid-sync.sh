#!/bin/bash
# =====================================================================
# HU-COM-09 - Publica el squid.conf del backend en el contenedor sgl-squid
#
# El backend (contenedor) escribe /opt/sgl-instaladores/sgl-squid.conf.
# Este servicio valida el candidato dentro del propio contenedor con
# `squid -k parse` y solo entonces reemplaza la configuración viva y la
# recarga. Así un cambio inválido nunca deja el proxy sin servicio.
# =====================================================================
set -u

SRC="${SGL_SQUID_SRC:-/opt/sgl-instaladores/sgl-squid.conf}"
DEST="${SGL_SQUID_DEST:-/opt/sgl-web/squid/squid.conf}"
CONTENEDOR="${SGL_SQUID_CONTAINER:-sgl-squid}"
TAG="sgl-squid"

[ -r "$SRC" ] || exit 0
# Sin cambios: nada que hacer.
cmp -s "$SRC" "$DEST" && exit 0

# El contenedor debe estar corriendo para validar/recargar.
if ! docker inspect -f '{{.State.Running}}' "$CONTENEDOR" 2>/dev/null | grep -q true; then
    docker start "$CONTENEDOR" >/dev/null 2>&1
    sleep 2
fi

if ! docker exec "$CONTENEDOR" squid -k parse -f /sgl/sgl-squid.conf \
        >/tmp/sgl-squid-parse.log 2>&1; then
    logger -t "$TAG" "configuracion invalida, se conserva la anterior: $(tail -n 3 /tmp/sgl-squid-parse.log | tr '\n' ' ')"
    exit 1
fi

# Copia de seguridad de la última configuración válida.
[ -f "$DEST" ] && cp "$DEST" "${DEST}.bak"
# Se escribe sobre el mismo archivo (no se reemplaza el inodo): el bind mount
# del contenedor apunta a este archivo y un rename dejaría la copia vieja.
cat "$SRC" > "$DEST"
chmod 644 "$DEST"

if docker exec "$CONTENEDOR" squid -k reconfigure >/dev/null 2>&1; then
    logger -t "$TAG" "configuracion actualizada y recargada"
else
    docker restart "$CONTENEDOR" >/dev/null 2>&1
    logger -t "$TAG" "reconfigure fallo: contenedor reiniciado"
fi
