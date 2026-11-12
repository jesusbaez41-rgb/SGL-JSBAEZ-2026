#!/usr/bin/env bash
# Respaldo de los datos de MeshCentral.
#
# Lo que se guarda es critico: la carpeta de datos contiene los certificados
# (raiz, web, agente y firma de codigo). Si esa carpeta se borra o se recrea,
# MeshCentral genera certificados nuevos y TODOS los agentes instalados quedan
# con el hash viejo: las PCs dejan de reportar y figuran APAGADAS aunque
# esten encendidas.
#
# Con este respaldo se puede restaurar la carpeta y los agentes siguen
# conectando sin reinstalar nada en los equipos.
#
# Se excluyen las carpetas de binarios (agents, agentbuilds, signedagents):
# son re-descargables desde GitHub y ocupan mas de 270 MB.
set -euo pipefail

SRC="/opt/meshcentral/meshcentral-data"
DEST="/opt/meshcentral-backup"
STAMP=$(date +%Y%m%d-%H%M)

mkdir -p "$DEST"

TMP="${DEST}/data-${STAMP}.tar.gz.tmp"
tar -czf "$TMP" \
  --exclude='meshcentral-data/agents' \
  --exclude='meshcentral-data/agentbuilds' \
  --exclude='meshcentral-data/signedagents' \
  -C "$(dirname "$SRC")" "$(basename "$SRC")"
mv "$TMP" "${DEST}/data-${STAMP}.tar.gz"

# Conservar las ultimas 14 copias.
ls -1t "${DEST}"/data-*.tar.gz 2>/dev/null | tail -n +15 | while read -r viejo; do
  rm -f "$viejo"
done

echo "[$(date -Is)] respaldo creado: ${DEST}/data-${STAMP}.tar.gz ($(du -h "${DEST}/data-${STAMP}.tar.gz" | cut -f1))"
