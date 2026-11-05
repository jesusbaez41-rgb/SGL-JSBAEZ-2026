# MeshCentral en SGL — instalación completa, problemas y estado

**Servidor:** `dc.clockwork.local` · `192.168.100.58` (red interna `sgl`)  
**Node.js:** `v22.22.1`  
**MeshCentral:** `1.3.1`  
**Última actualización:** 2026-11-05

Esta guía documenta **todo lo que se hizo** para dejar MeshCentral operativo en
el Ubuntu, publicarlo en `/mesh/`, generar el instalador del agente y conectarlo
al inventario de SGL.

---

## 0. Estado actual

| Elemento | Estado |
|---|---|
| MeshCentral | Activo (`systemctl is-active meshcentral`) |
| Puerto web | `4433` (HTTP interno, TLS en Nginx) |
| Puerto Intel AMT/MPS | `44330` |
| URL web | `https://192.168.100.58/mesh/` |
| Dominio MeshCentral | `mesh` |
| Cuenta admin | `sgladmin` (contraseña definida en el servidor) |
| Grupo de equipos | `SGL-Lab` |
| meshid | `JDJ3dJ5AB8e8Bi@3h@EIMbxlExahO@ta10w3455j53GYueT1LiljIPdFO923hjNU` |
| Instalador Windows x64 | `/mesh/instalador` → `meshagent64-SGL-Lab.exe` (3.4 MB) |
| Bridge SGL | Activo en `172.18.0.1:4444` |
| Backend SGL | `MESH_API_URL=http://host.docker.internal:4444` |
| Agente Win10 | Instalado y conectado (`sgl-win`, `192.168.100.100`, usuario `CLOCKWORK\luan`) |
| Equipo en SGL | `sgl-win` sincronizado: ENCENDIDO, IP `192.168.100.100`, usuario `CLOCKWORK\luan` |

### URLs útiles

- MeshCentral desde el Win10: `https://192.168.100.58/mesh/`
- MeshCentral desde el host: `https://192.168.0.50/mesh/`
- Instalador desde el Win10: `http://192.168.100.58:8080/mesh/instalador`
- Instalador desde el host: `http://192.168.0.50:8080/mesh/instalador`
- Instalador por HTTPS: `https://192.168.100.58/mesh/instalador`

> El host usa `192.168.0.50` (puente a Wi-Fi). El Win10 usa
> `192.168.100.58` (red interna `sgl`). La IP `192.168.100.58` no es
> alcanzable desde el host.

---

## 1. Arquitectura

```text
Win10 / navegador
   │  http(s)://192.168.100.58:8080/mesh/
   ▼
Nginx (contenedor sgl-frontend)
   │  proxy_pass http://host.docker.internal:4433
   ▼
MeshCentral (systemd en el host, 4433)
   ▲
   │  meshctrl ListDevices
Bridge SGL (systemd en el host, 172.18.0.1:4444)
   ▲
   │  GET /devices (x-api-key)
Backend SGL (contenedor sgl-backend)
```

- MeshCentral **no** es un cuarto contenedor de SGL: corre como servicio del
  host, fuera del `docker compose` de SGL.
- Base de datos: NeDB (embebida), suficiente para el laboratorio.
- Nginx termina TLS y publica MeshCentral bajo `/mesh/`.
- El bridge consulta `meshctrl` y expone una lista normalizada al backend.

---

## 2. Decisiones de diseño

1. **Servicio nativo**, no contenedor, para respetar los 3 contenedores de SGL.
2. **Dominio `mesh`** de MeshCentral, porque MeshCentral usa rutas absolutas y
   un subpath requiere un dominio propio.
3. **TLS offload** en Nginx (`TlsOffload: true`); MeshCentral escucha HTTP en
   `4433`.
4. **Puerto MPS separado** (`44330`) para que el puerto web quede en `4433`.
5. **Bridge local** para no acoplar el backend a la base interna de MeshCentral.
6. **Instalador servido por Nginx** desde un volumen (`frontend/static`), no
   desde MeshCentral, para que la descarga sea estable y persistente.

---

## 3. Instalación real paso a paso

### 3.1 Node.js

`apt` se quedó colgado descargando `nodejs`/`npm` (más de 20 minutos). Se
canceló y se instaló el binario oficial:

```bash
cd /tmp
curl -fsSL -o node-v22.22.1-linux-x64.tar.xz \
  https://nodejs.org/dist/v22.22.1/node-v22.22.1-linux-x64.tar.xz
sudo tar -xJf node-v22.22.1-linux-x64.tar.xz -C /usr/local --strip-components=1
node -v    # v22.22.1
npm -v     # 10.9.4
```

Queda en `/usr/local/bin/node` y `/usr/local/bin/npm`.

### 3.2 MeshCentral

El primer `npm install` se cortó por inestabilidad de SSH. Se relanzó como
servicio transitorio de systemd:

```bash
sudo useradd --system --home /opt/meshcentral --shell /usr/sbin/nologin meshcentral 2>/dev/null || true
sudo mkdir -p /opt/meshcentral
sudo chown -R sgl:sgl /opt/meshcentral
cd /opt/meshcentral
npm init -y

sudo systemd-run --unit=meshcentral-install --uid=sgl --gid=sgl \
  --working-directory=/opt/meshcentral \
  /usr/local/bin/npm install meshcentral --no-audit --no-fund --omit=dev --prefer-offline
systemctl status meshcentral-install --no-pager
```

El tarball de MeshCentral (75 MB) seguía bajando lento desde el servidor. Se
descargó en el host y se instaló localmente:

```bash
# En el host:
curl -L --fail -o meshcentral-1.3.1.tgz \
  https://registry.npmjs.org/meshcentral/-/meshcentral-1.3.1.tgz
pscp -scp meshcentral-1.3.1.tgz sgl@192.168.0.50:/tmp/meshcentral-1.3.1.tgz

# En el servidor:
sudo systemctl stop meshcentral-install
sudo rm -rf /opt/meshcentral/node_modules/meshcentral
sudo systemd-run --unit=meshcentral-install2 --uid=sgl --gid=sgl \
  --working-directory=/opt/meshcentral \
  /usr/local/bin/npm install /tmp/meshcentral-1.3.1.tgz \
  --no-audit --no-fund --omit=dev --prefer-offline
```

### 3.3 Configuración

`/opt/meshcentral/meshcentral-data/config.json`:

```json
{
  "settings": {
    "Cert": "192.168.100.58",
    "Port": 4433,
    "MpsPort": 44330,
    "AliasPort": 443,
    "RedirPort": 0,
    "TlsOffload": true,
    "SessionKey": "CAMBIA_ESTO_POR_UNA_CLAVE_LARGA",
    "AllowLoginToken": true,
    "AllowFraming": true,
    "SelfUpdate": false
  },
  "domains": {
    "": {
      "Title": "SGL",
      "Title2": "MeshCentral",
      "NewAccounts": false
    },
    "mesh": {
      "Title": "SGL",
      "Title2": "MeshCentral",
      "NewAccounts": false,
      "certhash": "66d3e9f2965b93e107036c374a0aca509faf32acdc9bef43b259b78945c10ac1c2427ed080ef37994494774e91847dc7"
    }
  }
}
```

Puntos clave:

- `MpsPort: 44330` evita que Intel AMT ocupe el `4433` y desplace la web al
  `4434`.
- `TlsOffload: true` porque Nginx termina TLS.
- `certhash` es el hash SHA-384 del certificado que presenta Nginx. Se agregó
  porque el agente reportaba el certificado de Nginx y MeshCentral lo rechazaba.
  Si cambia el certificado de Nginx, hay que actualizar este valor con el hash
  que reporte el agente en el log.

Permisos:

```bash
sudo chown -R meshcentral:meshcentral /opt/meshcentral/meshcentral-data
sudo chmod 700 /opt/meshcentral/meshcentral-data
sudo mkdir -p /opt/meshcentral/meshcentral-backups
sudo chown meshcentral:meshcentral /opt/meshcentral/meshcentral-backups
```

### 3.4 Servicio systemd

`/etc/systemd/system/meshcentral.service`:

```ini
[Unit]
Description=MeshCentral
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=meshcentral
Group=meshcentral
WorkingDirectory=/opt/meshcentral
ExecStart=/usr/local/bin/node /opt/meshcentral/node_modules/meshcentral
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now meshcentral
sudo systemctl status meshcentral --no-pager
ss -tulpn | grep -E ':(4433|44330) '
```

> Se intentó `--host 172.18.0.1`, pero esta versión no lo soporta
> (`Invalid argument "host"`). Se quitó y MeshCentral escucha en `0.0.0.0`.

### 3.5 Publicar `/mesh` en Nginx

`frontend/nginx-locations.conf`:

```nginx
location /mesh/ {
    proxy_pass http://host.docker.internal:4433;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

`docker-compose.yml` / `docker-compose.override.yml`:

```yaml
services:
  frontend:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./frontend/static:/usr/share/nginx/html/static:ro
```

```bash
cd /opt/sgl-web
docker compose build frontend
docker compose up -d frontend
```

Verificación:

```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://192.168.100.58/mesh/
```

### 3.6 Crear la cuenta de administración

El navegador integrado rechazaba el certificado autofirmado, así que la primera
cuenta se creó por POST local:

```bash
curl -s -X POST http://127.0.0.1:4433/mesh/ \
  --data-urlencode 'action=createaccount' \
  --data-urlencode 'username=sgladmin' \
  --data-urlencode 'email=sgladmin@clockwork.local' \
  --data-urlencode 'password1=LA_PASSWORD' \
  --data-urlencode 'password2=LA_PASSWORD' \
  --data-urlencode 'apasswordhint=lab'
```

La primera cuenta creada queda como **site administrator**. Luego se puso
`"NewAccounts": false` en el dominio `mesh` y se reinició MeshCentral.

> La contraseña de `sgladmin` está definida en el servidor; no se versiona en
> este documento ni en el repositorio.

### 3.7 Crear el grupo `SGL-Lab`

Con `meshctrl`:

```bash
CRED="--loginuser sgladmin --loginpass LA_PASSWORD --url wss://192.168.100.58/mesh --ignorecert"

node /opt/meshcentral/node_modules/meshcentral/meshctrl.js \
  adddevicegroup --name "SGL-Lab" --desc "Equipos del laboratorio SGL" $CRED
```

El meshid resultante fue:

```text
JDJ3dJ5AB8e8Bi@3h@EIMbxlExahO@ta10w3455j53GYueT1LiljIPdFO923hjNU
```

### 3.8 Binarios del agente

MeshCentral 1.3.1 descarga 31 binarios de agente (119 MB) desde GitHub, pero la
conexión del servidor era muy lenta. Se descargaron en el host y se copiaron:

```text
Repositorio: Ylianst/MeshAgent
Tag:         legacy-1.2.6
Archivos:    31 (MeshService.exe, MeshService64.exe, meshagent_x86-64, etc.)
```

El manifiesto está en:

```text
/opt/meshcentral/node_modules/meshcentral/agents/agent-defaults.json
```

Se empaquetaron como `meshagents.tar.gz` (los `.exe` se descargaron como `.bin`
para evitar que Windows Defender los bloqueara en el host), se copiaron al
servidor y se extrajeron en:

```text
/opt/meshcentral/meshcentral-data/agents
```

Luego se copiaron también a:

```text
/opt/meshcentral/node_modules/meshcentral/agents
```

y se reinició MeshCentral. El log mostró `Code signed MeshService.exe`,
confirmando que los binarios se reconocieron.

### 3.9 Generar el instalador Windows

El comando correcto usa `wss://` (no `https://`, que da `Invalid url`, ni
`ws://`, que da error de protocolo al descargar):

```bash
MESHID='JDJ3dJ5AB8e8Bi@3h@EIMbxlExahO@ta10w3455j53GYueT1LiljIPdFO923hjNU'

mkdir -p /tmp/agentbuild4 && cd /tmp/agentbuild4
node /opt/meshcentral/node_modules/meshcentral/meshctrl.js \
  agentdownload --type 4 --id "$MESHID" \
  --loginuser sgladmin --loginpass LA_PASSWORD \
  --url wss://192.168.100.58/mesh --ignorecert
```

Tipos:

- `--type 3` → `meshagent32-SGL-Lab.exe` (Windows x86)
- `--type 4` → `meshagent64-SGL-Lab.exe` (Windows x64)
- `--type 5` → `meshagent` (otras plataformas)

El archivo generado para Windows x64 fue `meshagent64-SGL-Lab.exe` (3,480,682
bytes).

### 3.10 Publicar `/mesh/instalador`

El instalador se copió a:

```text
/opt/sgl-web/frontend/static/meshagent64-SGL-Lab.exe
```

y se montó en el frontend con `docker-compose.override.yml`:

```yaml
services:
  frontend:
    volumes:
      - ./frontend/static:/usr/share/nginx/html/static:ro
```

Nginx (`frontend/nginx-locations.conf`):

```nginx
location = /mesh/instalador {
    alias /usr/share/nginx/html/static/meshagent64-SGL-Lab.exe;
    default_type application/octet-stream;
    add_header Content-Disposition "attachment; filename=meshagent64-SGL-Lab.exe";
    add_header Cache-Control "no-store";
}

location = /mesh/instalador/ {
    return 308 $scheme://$http_host/mesh/instalador;
}
```

La redirección con `$scheme://$http_host` es importante para conservar el puerto
`8080`; sin eso, Nginx redirigía a `http://host/mesh/instalador` (puerto 80) y
daba 404.

Verificación:

```bash
curl -sI http://192.168.100.58:8080/mesh/instalador
curl -s -o /tmp/agent.exe -w "%{http_code} %{size_download}\n" \
  http://192.168.100.58:8080/mesh/instalador
```

### 3.11 Bridge de estado para SGL

Archivo: `/opt/meshcentral/meshcentral-bridge.js` (desde
`scripts/meshcentral-bridge.js`).

`/etc/sgl-mesh-bridge.env` (modo 600):

```ini
BRIDGE_HOST=172.18.0.1
BRIDGE_PORT=4444
BRIDGE_TOKEN=TOKEN_COMPARTIDO
MESHCTRL_PATH=/opt/meshcentral/node_modules/meshcentral/meshctrl.js
MESH_URL=ws://127.0.0.1:4433/mesh
MESH_USER=sgladmin
MESH_PASS=LA_PASSWORD
```

`/etc/systemd/system/sgl-mesh-bridge.service`:

```ini
[Unit]
Description=SGL MeshCentral bridge
After=network-online.target meshcentral.service
Wants=network-online.target

[Service]
Type=simple
User=meshcentral
Group=meshcentral
EnvironmentFile=/etc/sgl-mesh-bridge.env
ExecStart=/usr/local/bin/node /opt/meshcentral/meshcentral-bridge.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sgl-mesh-bridge
curl -H "x-api-key: TOKEN_COMPARTIDO" http://172.18.0.1:4444/health
curl -H "x-api-key: TOKEN_COMPARTIDO" http://172.18.0.1:4444/devices
```

### 3.12 Backend SGL

En `/opt/sgl-web/.env`:

```ini
MESH_API_URL=http://172.18.0.1:4444
MESH_API_TOKEN=TOKEN_COMPARTIDO
```

> **Importante:** no usar `host.docker.internal`. En este entorno resuelve a
> `172.17.0.1` (bridge por defecto de Docker), pero el bridge de SGL escucha en
> `172.18.0.1` (gateway de `sgl-net`). Con `host.docker.internal` el backend
> devuelve `fetch failed`.

```bash
cd /opt/sgl-web
docker compose up -d backend
```

El backend consulta el bridge al listar equipos y al ejecutar
`POST /api/equipment/sync`.

### 3.13 Agente en el Win10

1. El Win10 debe estar en la red interna **`sgl`** (no NAT).
2. DHCP del servidor: IP `192.168.100.100–200`, gateway/DNS
   `192.168.100.58`.
3. Descargar `meshagent64-SGL-Lab.exe` desde `/mesh/instalador`.
4. Ejecutarlo **como administrador** y pulsar **Install**, o:
   ```cmd
   meshagent64-SGL-Lab.exe -fullinstall
   ```
5. El servicio queda como `mesh agent`, `LocalSystem`, `AUTO_START`, para
   **todos los usuarios**.
6. Verificar:
   ```cmd
   sc qc "mesh agent"
   ```
7. Si el agente ya estaba instalado y MeshCentral cambió de certificado,
   reiniciar el servicio:
   ```cmd
   net stop "mesh agent"
   net start "mesh agent"
   ```

---

## 4. Problemas encontrados y soluciones

| Problema | Causa | Solución |
|---|---|---|
| `apt-get install nodejs npm` colgado | Mirror/red lenta | Node por tarball oficial en `/usr/local` |
| SSH se corta durante `npm install` | Red inestable / descarga larga | `systemd-run` transitorio |
| `npm install` atascado en el tarball de MeshCentral | Descarga lenta desde npmjs | Descargar el `.tgz` en el host y `npm install` local |
| Windows Defender bloquea `.exe` en el host | Política antivirus | Descargar en el Ubuntu o empaquetar con extensión `.bin` |
| `Invalid argument "host"` | Versión de MeshCentral sin `--host` | Quitar `--host` del `ExecStart` |
| Web de MeshCentral en `4434` | Intel AMT/MPS ocupaba `4433` | `MpsPort: 44330` |
| `/mesh/` daba 502 | MeshCentral no estaba en `4433` | Corregir `MpsPort`, reiniciar |
| Navegador rechaza certificado autofirmado | Certificado no confiado | Crear admin por `curl` local |
| `meshctrl agentdownload` “Invalid url” | Se pasó `https://` | Usar `wss://.../mesh` |
| `agentdownload` “Protocol ws not supported” | Se pasó `ws://` | Usar `wss://` para que genere `https://` |
| `/mesh/instalador` daba 404 | Barra final o falta de bloque exacto | `location = /mesh/instalador` + redirección con `$http_host` |
| Agente conecta pero no aparece | Hash del certificado de Nginx distinto al de MeshCentral | Agregar `certhash` al dominio `mesh` |
| Agente instalado pero no se ve | Servicio no reiniciado tras `certhash` | `net stop/start "mesh agent"` |
| Host no puede abrir la web | Usa `192.168.100.58` desde el host | Usar `http://192.168.0.50:8080` |
| Win10 no llega al servidor | Adaptador en NAT | Cambiar a red interna `sgl` |
| SGL: `No se pudo consultar MeshCentral: fetch failed` | `host.docker.internal` resuelve a `172.17.0.1` y el bridge escucha en `172.18.0.1` | `MESH_API_URL=http://172.18.0.1:4444` y recrear backend |
| Equipo no se actualiza aunque el agente conecta | Hostname del equipo distinto al `name` de MeshCentral | Editar el equipo en SGL con el hostname real (`sgl-win`) |

---

## 5. Verificación rápida

```bash
# Servicios
systemctl is-active meshcentral sgl-mesh-bridge

# Puertos
ss -tulpn | grep -E ':(4433|44330|4444) '

# Web MeshCentral
curl -sk -o /dev/null -w "mesh: %{http_code}\n" https://192.168.100.58/mesh/

# Instalador
curl -sI http://192.168.100.58:8080/mesh/instalador
curl -s -o /dev/null -w "instalador: %{http_code} %{size_download}\n" \
  http://192.168.100.58:8080/mesh/instalador

# Bridge
curl -H "x-api-key: TOKEN" http://172.18.0.1:4444/health
curl -H "x-api-key: TOKEN" http://172.18.0.1:4444/devices

# Dispositivos en MeshCentral
node /opt/meshcentral/node_modules/meshcentral/meshctrl.js \
  listdevices --loginuser sgladmin --loginpass LA_PASSWORD \
  --url wss://192.168.100.58/mesh --ignorecert --json
```

En el servidor, el log debe mostrar `Agent connected` y **no** el mensaje
`Agent bad web cert hash`.

---

## 6. Pendientes / siguientes pasos

1. **Verificado:** el agente `sgl-win` conectó y el equipo se sincronizó en SGL
   (`ENCENDIDO`, `192.168.100.100`, usuario `CLOCKWORK\luan`).
2. Cambiar las contraseñas de laboratorio (`sgladmin`, bridge, token) antes de
   producción.
3. Revocar el token de GitHub usado para subir el repositorio.
4. Para producción, valorar Ethernet en lugar de Wi-Fi (RN-019) y certificados
   TLS válidos.
5. Programar backup de `/opt/meshcentral/meshcentral-data` y de la base SGL.

---

## 7. Archivos clave

| Archivo | Uso |
|---|---|
| `/opt/meshcentral/meshcentral-data/config.json` | Configuración de MeshCentral |
| `/opt/meshcentral/meshcentral-data/agents/` | Binarios del agente |
| `/opt/meshcentral/node_modules/meshcentral/` | Paquete MeshCentral 1.3.1 |
| `/etc/systemd/system/meshcentral.service` | Servicio MeshCentral |
| `/etc/systemd/system/sgl-mesh-bridge.service` | Servicio del bridge |
| `/etc/sgl-mesh-bridge.env` | Credenciales/token del bridge |
| `/opt/meshcentral/meshcentral-bridge.js` | Código del bridge |
| `/opt/sgl-web/frontend/static/meshagent64-SGL-Lab.exe` | Instalador publicado |
| `/opt/sgl-web/frontend/nginx-locations.conf` | Proxy `/mesh/` e instalador |
| `/opt/sgl-web/docker-compose.override.yml` | Volumen del instalador |
| `/opt/sgl-web/.env` | `MESH_API_URL`/`MESH_API_TOKEN` |
| `/opt/sgl-web/scripts/meshcentral-bridge.js` | Fuente del bridge en el repo |
| `/opt/sgl-web/docs/agent-windows.md` | Instalación del agente en Windows |

---

## 8. Seguridad

- No exponer `4433` ni `4444` a la LAN; solo Nginx/bridge local.
- `SessionKey`, contraseña de `sgladmin`, contraseña del bridge y
  `MESH_API_TOKEN` deben ser secretos y cambiarse en producción.
- `.env` y `/etc/sgl-mesh-bridge.env` deben quedar en modo `600`.
- El certificado de Nginx es autofirmado; para producción usar un certificado
  válido y actualizar `certhash` si cambia.
- El agente se instala como servicio `LocalSystem`; limita quién puede
  administrar MeshCentral.
- Revocar el token de GitHub expuesto durante la subida del repositorio.
