#!/usr/bin/env bash
# Regenera el instalador del agente MeshCentral con la configuracion vigente.
#
# Por que hace falta:
#   El agente fija (pin) el hash de la clave publica del certificado web de
#   MeshCentral. Si los certificados del servidor se regeneran (por ejemplo al
#   reinstalar MeshCentral o al recrear su carpeta de datos), el agente deja de
#   validar el servidor: la sesion queda en "holding connection" y la PC nunca
#   aparece en linea.
#
#   Este script vuelve a pedirle el agente a MeshCentral, que lo genera con el
#   hash y la URL actuales, y lo deja listo para descargar en
#   http://<servidor>:8080/mesh/instalador
#
# Uso:  sudo bash scripts/mesh-agent-installer.sh
set -euo pipefail

MESH_DATA="${MESH_DATA:-/opt/meshcentral/meshcentral-data}"
STATIC_DIR="${STATIC_DIR:-/opt/sgl-web/frontend/static}"
MESH_HOST="${MESH_HOST:-192.168.100.58}"
GROUP_NAME="${GROUP_NAME:-SGL-Lab}"
OUTPUT="${OUTPUT:-${STATIC_DIR}/meshagent64-SGL-Lab.exe}"
TYPE="${TYPE:-4}"   # 4 = Mesh Service 64 bits (servicio de Windows, todos los usuarios)

if [[ ! -f /etc/sgl-mesh-bridge.env ]]; then
  echo "Falta /etc/sgl-mesh-bridge.env (MESH_USER / MESH_PASS)" >&2
  exit 1
fi
# shellcheck disable=SC1091
source /etc/sgl-mesh-bridge.env

cd /opt/meshcentral

echo "==> Buscando el grupo ${GROUP_NAME}"
MESHDID=$(node node_modules/meshcentral/meshctrl.js ListDeviceGroups --json \
  --loginuser "$MESH_USER" --loginpass "$MESH_PASS" --url "$MESH_URL" --ignorecert \
  | node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      const g=JSON.parse(d).find(x=>x.name==='${GROUP_NAME}');
      if (!g) { console.error('grupo no encontrado'); process.exit(1); }
      console.log(g._id.replace(/^mesh\/mesh\//,''));
    });")

echo "==> Iniciando sesion en https://${MESH_HOST}/mesh/"
COOKIE=$(mktemp)
trap 'rm -f "$COOKIE"' EXIT
curl -sk -c "$COOKIE" -o /dev/null -w '    login: %{http_code}\n' \
  --resolve "${MESH_HOST}:443:127.0.0.1" \
  --data-urlencode "username=${MESH_USER}" --data-urlencode "password=${MESH_PASS}" \
  "https://${MESH_HOST}/mesh/login"

echo "==> Descargando el agente (tipo ${TYPE})"
TMP=$(mktemp --suffix=.exe)
curl -sk -b "$COOKIE" --resolve "${MESH_HOST}:443:127.0.0.1" \
  -o "$TMP" -w '    descarga: %{http_code} %{size_download} bytes\n' \
  "https://${MESH_HOST}/mesh/meshagents?id=${TYPE}&meshid=${MESHDID}&installflags=2"

if ! file "$TMP" | grep -q 'PE32'; then
  echo "La descarga no es un ejecutable de Windows; se aborta." >&2
  rm -f "$TMP"
  exit 1
fi

install -m 644 "$TMP" "$OUTPUT"
rm -f "$TMP"
echo "==> Listo: ${OUTPUT}"
echo "    Descargalo desde http://${MESH_HOST}:8080/mesh/instalador"
echo "    y en la PC (consola como administrador):  meshagent64-SGL-Lab.exe -fullinstall"
