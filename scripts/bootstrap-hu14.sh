#!/usr/bin/env bash
# =====================================================================
# HU-COM-14 — Bootstrap de usuarios/grupos de demostración
#
# Crea cuentas en Samba AD y las registra en PostgreSQL con su rol web.
# Respeta:
#   RN-011 (código de grupo único)
#   RN-012 (estudiante en uno o más grupos)
#   RN-015 (solo ESTUDIANTE en membresia_grupo)
#   RN-017 (docente asignado por asignacion_docente)
#
# Ejecutar como root en el servidor:
#   sudo bash /opt/sgl-web/scripts/bootstrap-hu14.sh
# =====================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: ejecute este script con sudo." >&2
  exit 1
fi

cd /opt/sgl-web
set -a
# shellcheck disable=SC1091
source .env
set +a

DB_USER="${POSTGRES_USER:-sgl_user}"
DB_NAME="${POSTGRES_DB:-sgl}"
GROUP_CODE="GRP-1A"

create_user() {
  local uid="$1" pass="$2" given="$3" surname="$4"

  if samba-tool user show "$uid" >/dev/null 2>&1; then
    echo "[=] usuario AD $uid ya existe"
    return
  fi

  samba-tool user create "$uid" "$pass" \
    --given-name="$given" \
    --surname="$surname" \
    --mail-address="$uid@clockwork.local" \
    --description="Usuario demo HU-COM-14" >/dev/null

  echo "[+] usuario AD $uid creado"
}

user_attr() {
  samba-tool user show "$1" 2>/dev/null | sed -n "s/^$2: //p" | head -1
}

group_attr() {
  samba-tool group show "$1" 2>/dev/null | sed -n "s/^$2: //p" | head -1
}

insert_user() {
  local uid="$1" role="$2" nombre="$3"
  local sid dn email

  sid="$(user_attr "$uid" objectSid)"
  dn="$(user_attr "$uid" dn)"
  email="${uid}@clockwork.local"

  if [ -z "$sid" ] || [ -z "$dn" ]; then
    echo "ERROR: no se pudo leer SID/DN de $uid" >&2
    exit 1
  fi

  docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
    -v uid="$uid" \
    -v email="$email" \
    -v nombre="$nombre" \
    -v rol="$role" \
    -v sid="$sid" \
    -v dn="$dn" <<'SQL'
INSERT INTO usuario (uid, email, nombre_completo, rol, activo, samba_sid, samba_dn)
VALUES (:'uid', :'email', :'nombre', :'rol', TRUE, :'sid', :'dn')
ON CONFLICT (uid) DO UPDATE SET
  email = EXCLUDED.email,
  nombre_completo = EXCLUDED.nombre_completo,
  rol = EXCLUDED.rol,
  activo = TRUE,
  samba_sid = EXCLUDED.samba_sid,
  samba_dn = EXCLUDED.samba_dn,
  intentos_fallidos = 0,
  bloqueado_hasta = NULL;
SQL

  echo "[+] usuario BD $uid ($role)"
}

echo "=== 1) Usuarios de Samba AD ==="
create_user aacademico 'SglAcad2026!x9' 'Admin' 'Academico'
create_user atecnico   'SglTec2026!x9'  'Admin' 'Tecnico'
create_user docente    'SglDoc2026!x9'  'Docente' 'Demo'
create_user estudiante 'SglEst2026!x9'  'Estudiante' 'Demo'

echo "=== 2) Grupo de Samba AD ==="
if samba-tool group show "$GROUP_CODE" >/dev/null 2>&1; then
  echo "[=] grupo AD $GROUP_CODE ya existe"
else
  samba-tool group add "$GROUP_CODE" --description="Grupo demo HU-COM-14" >/dev/null
  echo "[+] grupo AD $GROUP_CODE creado"
fi

if samba-tool group listmembers "$GROUP_CODE" 2>/dev/null | grep -qx 'estudiante'; then
  echo "[=] estudiante ya pertenece a $GROUP_CODE"
else
  samba-tool group addmembers "$GROUP_CODE" estudiante >/dev/null
  echo "[+] estudiante agregado a $GROUP_CODE"
fi

echo "=== 3) Registro en PostgreSQL ==="
insert_user aacademico ADMIN_ACADEMICO 'Admin Académico'
insert_user atecnico   ADMIN_TECNICO   'Admin Técnico'
insert_user docente    DOCENTE         'Docente Demo'
insert_user estudiante ESTUDIANTE      'Estudiante Demo'

GSID="$(group_attr "$GROUP_CODE" objectSid)"
GDN="$(group_attr "$GROUP_CODE" dn)"

if [ -z "$GSID" ] || [ -z "$GDN" ]; then
  echo "ERROR: no se pudo leer SID/DN del grupo $GROUP_CODE" >&2
  exit 1
fi

docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -v codigo="$GROUP_CODE" -v sid="$GSID" -v dn="$GDN" <<'SQL'
INSERT INTO grupo (codigo, descripcion, samba_sid, samba_dn)
VALUES (:'codigo', 'Grupo demo HU-COM-14', :'sid', :'dn')
ON CONFLICT (codigo) DO UPDATE SET
  descripcion = EXCLUDED.descripcion,
  samba_sid = EXCLUDED.samba_sid,
  samba_dn = EXCLUDED.samba_dn;

-- RN-015: solo el rol ESTUDIANTE entra en membresia_grupo.
INSERT INTO membresia_grupo (usuario_id, grupo_id, activa)
SELECT u.id, g.id, TRUE
  FROM usuario u
  CROSS JOIN grupo g
 WHERE u.uid = 'estudiante'
   AND u.rol = 'ESTUDIANTE'
   AND g.codigo = :'codigo'
ON CONFLICT (usuario_id, grupo_id) DO UPDATE SET activa = TRUE;

-- RN-017: el docente se asigna al grupo para monitoreo.
INSERT INTO asignacion_docente (docente_id, grupo_id)
SELECT u.id, g.id
  FROM usuario u
  CROSS JOIN grupo g
 WHERE u.uid = 'docente'
   AND u.rol = 'DOCENTE'
   AND g.codigo = :'codigo'
ON CONFLICT (docente_id, grupo_id) DO NOTHING;
SQL

echo "=== 4) Verificación ==="
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT uid, rol, activo FROM usuario ORDER BY uid;"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT g.codigo, count(m.id) FILTER (WHERE m.activa) AS estudiantes,
          count(a.id) AS docentes_asignados
     FROM grupo g
     LEFT JOIN membresia_grupo m ON m.grupo_id = g.id
     LEFT JOIN asignacion_docente a ON a.grupo_id = g.id
    WHERE g.codigo = '$GROUP_CODE'
    GROUP BY g.codigo;"

cat <<'EOF'

=== Credenciales de demostración ===
Admin Académico : aacademico  / SglAcad2026!x9
Admin Técnico   : atecnico    / SglTec2026!x9
Docente         : docente     / SglDoc2026!x9
Estudiante      : estudiante  / SglEst2026!x9   (rechazado en el panel web, CA-04)
EOF
