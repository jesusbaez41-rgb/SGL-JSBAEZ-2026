#!/usr/bin/env bash
# Vigilante del agente MeshCentral (HU-COM-03/HU-COM-04/HU-COM-08).
#
# Problema que previene:
#   El agente fija (pin) el hash de la clave publica del certificado web de
#   MeshCentral. Si los certificados del servidor se regeneran, todos los
#   agentes quedan con un hash viejo, la sesion se queda en "holding
#   connection" y las PCs nunca vuelven a reportar (figuran APAGADAS aunque
#   esten encendidas).
#
# Que hace:
#   1. Mira el log de MeshCentral en busca de "bad web cert hash".
#   2. Si lo encuentra, regenera el instalador del agente (que lleva el hash
#      vigente) para que la descarga de SGL siga siendo válida.
#   3. Avisa por syslog y deja registro en /var/log/sgl-mesh-guard.log.
#
# No modifica nada del servidor MeshCentral: solo regenera el instalador
# distribuible y avisa.
set -uo pipefail

LOG="/var/log/sgl-mesh-guard.log"
SINCE="${1:-10 minutes ago}"
REGEN="/opt/sgl-web/scripts/mesh-agent-installer.sh"

echo "[$(date -Is)] iniciandorevision" >> "$LOG"

if ! command -v journalctl >/dev/null 2>&1; then
  exit 0
fi

MISMATCH=$(journalctl -u meshcentral --no-pager --since "$SINCE" 2>/dev/null \
  | grep -c "bad web cert hash" || true)

if [[ "${MISMATCH:-0}" -gt 0 ]]; then
  echo "[$(date -Is)] ALERTA: ${MISMATCH} agente(s) con hash de certificado desactualizado" >> "$LOG"
  logger -t sgl-mesh-guard "Hash de certificado desactualizado en ${MISMATCH} agente(s); regenerando instalador"

  if [[ -x "$REGEN" ]]; then
    if bash "$REGEN" >> "$LOG" 2>&1; then
      echo "[$(date -Is)] instalador regenerado correctamente" >> "$LOG"
      logger -t sgl-mesh-guard "Instalador del agente regenerado con el hash vigente"
    else
      echo "[$(date -Is)] ERROR: no se pudo regenerar el instalador" >> "$LOG"
      logger -t sgl-mesh-guard "No se pudo regenerar el instalador del agente"
    fi
  else
    echo "[$(date -Is)] ERROR: no existe ${REGEN}" >> "$LOG"
  fi
fi

exit 0
