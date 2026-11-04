# Instalación de MeshCentral en el Ubuntu y publicación en `/mesh`

**Servidor:** `dc.clockwork.local` · `192.168.100.58` (red interna `sgl`)  
**Fecha:** 2026-11-05  
**Alcance:** MeshCentral nativo en el host Ubuntu, systemd, reverse proxy en el
contenedor `sgl-frontend` y bridge de estado para SGL.

## 1. Arquitectura

```text
Win10 / navegador
   │  http(s)://192.168.100.58:8080/mesh/
   ▼
Nginx (contenedor sgl-frontend)
   │  proxy_pass http://host.docker.internal:4433
   ▼
MeshCentral (systemd, host, puerto 4433)
   ▲
   │  meshctrl ListDevices
Bridge SGL (systemd, host, 172.18.0.1:4444)
   ▲
   │  GET /devices (x-api-key)
Backend SGL (contenedor sgl-backend)
```

- MeshCentral **no** es un cuarto contenedor de SGL: corre como servicio del
  host, fuera del `docker compose` de SGL.
- MeshCentral usa NeDB (base embebida) para este laboratorio.
- El puerto 4433 no se publica a la LAN; solo lo consume Nginx desde la red
  Docker y el bridge local.

## 2. Requisitos

- Ubuntu con acceso a internet para `apt`/`npm`.
- Node.js 20+ y npm.
- Docker Compose de SGL operativo.
- Puertos internos: `4433` (MeshCentral) y `4444` (bridge).

## 3. Instalar Node.js y MeshCentral

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm
node -v
npm -v

sudo useradd --system --home /opt/meshcentral --shell /usr/sbin/nologin meshcentral 2>/dev/null || true
sudo mkdir -p /opt/meshcentral
sudo chown sgl:sgl /opt/meshcentral

cd /opt/meshcentral
npm init -y
npm install meshcentral
node -e "console.log(require('/opt/meshcentral/node_modules/meshcentral/package.json').version)"
```

## 4. Configurar MeshCentral

El archivo de configuración vive en
`/opt/meshcentral/meshcentral-data/config.json`. Se usa un dominio `mesh`
para publicar la UI bajo `/mesh/`.

```json
{
  "settings": {
    "Cert": "192.168.100.58",
    "Port": 4433,
    "AliasPort": 443,
    "RedirPort": 0,
    "TlsOffload": true,
    "SessionKey": "CAMBIAR_POR_CLAVE_LARGA_ALEATORIA",
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
      "NewAccounts": true
    }
  }
}
```

Notas:

- `TlsOffload: true` indica que Nginx termina TLS y MeshCentral escucha HTTP en
  `4433`.
- El dominio `mesh` es lo que permite servir la UI en `/mesh` sin romper las
  rutas absolutas de MeshCentral.
- `NewAccounts: true` solo se deja durante la creación del primer
  administrador; después se pasa a `false` y se reinicia el servicio.

Permisos:

```bash
sudo mkdir -p /opt/meshcentral/meshcentral-data
sudo chown -R meshcentral:meshcentral /opt/meshcentral/meshcentral-data
sudo chmod 700 /opt/meshcentral/meshcentral-data
```

## 5. Servicio systemd

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
ExecStart=/usr/bin/node /opt/meshcentral/node_modules/meshcentral --host 172.18.0.1
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
ss -tulpn | grep ':4433'
```

> `--host 172.18.0.1` hace que MeshCentral escuche solo en la puerta de enlace
> de la red Docker de SGL. Si cambia la red, ajustar la IP.

## 6. Publicar `/mesh` desde SGL

El frontend Nginx (`frontend/nginx-locations.conf`) tiene:

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

`docker-compose.yml` agrega en `frontend` y `backend`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Luego:

```bash
cd /opt/sgl-web
docker compose build frontend
docker compose up -d frontend
```

Acceso:

- Desde el host: `http://192.168.0.50:8080/mesh/`
- Desde el Win10 en `sgl`: `http://192.168.100.58:8080/mesh/`
- Si se usa HTTPS: `https://192.168.100.58/mesh/` (certificado autofirmado).

## 7. Crear la cuenta de administración

1. Abrir `/mesh/` desde el navegador.
2. MeshCentral mostrará la creación de la primera cuenta (por `NewAccounts`).
3. Crear el administrador, por ejemplo `sgladmin`.
4. Crear un usuario técnico para el bridge, por ejemplo `sglbridge`.
5. Poner `"NewAccounts": false` en el dominio `mesh` y reiniciar:

```bash
sudo systemctl restart meshcentral
```

## 8. Bridge de estado para SGL

El bridge ejecuta `meshctrl ListDevices` y publica JSON en
`172.18.0.1:4444/devices`.

Archivo: `/opt/meshcentral/meshcentral-bridge.js` (copiado desde
`scripts/meshcentral-bridge.js`).

Variables en `/etc/sgl-mesh-bridge.env` (modo 600):

```ini
BRIDGE_HOST=172.18.0.1
BRIDGE_PORT=4444
BRIDGE_TOKEN=CAMBIAR_POR_TOKEN
MESHCTRL_PATH=/opt/meshcentral/node_modules/meshcentral/meshctrl.js
MESH_URL=ws://127.0.0.1:4433/mesh
MESH_USER=sglbridge
MESH_PASS=CAMBIAR_POR_PASSWORD
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
ExecStart=/usr/bin/node /opt/meshcentral/meshcentral-bridge.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sgl-mesh-bridge
curl -H "x-api-key: TOKEN" http://172.18.0.1:4444/health
curl -H "x-api-key: TOKEN" http://172.18.0.1:4444/devices
```

En el `.env` de SGL:

```ini
MESH_API_URL=http://host.docker.internal:4444
MESH_API_TOKEN=EL_MISMO_TOKEN
```

```bash
cd /opt/sgl-web
docker compose up -d backend
```

## 9. Descargar el agente en el Win10

1. El Win10 debe estar en la red interna `sgl` y tener IP `192.168.100.x`.
2. Abrir `http://192.168.100.58:8080/mesh/`.
3. Iniciar sesión con el administrador de MeshCentral.
4. Ir a **Add Agent** / **Agregar agente**, crear un grupo de equipos
   (`SGL-Lab`) y descargar el instalador para Windows.
5. Ejecutar el instalador en el Win10.
6. El equipo aparece en MeshCentral y en SGL al sincronizar
   (`Equipos → Sincronizar estado`).

## 10. Verificación

```bash
# Servicios
systemctl is-active meshcentral sgl-mesh-bridge
ss -tulpn | grep -E ':(4433|4444)'

# Bridge
curl -H "x-api-key: TOKEN" http://172.18.0.1:4444/devices

# Nginx /mesh
curl -sk -o /dev/null -w "%{http_code}\n" https://192.168.100.58/mesh/
```

En SGL: **Equipos → Sincronizar estado** debe actualizar `estado`, `IP` y
`último reporte`.

## 11. Seguridad

- Cambiar `SessionKey`, `BRIDGE_TOKEN` y las contraseñas de MeshCentral.
- `/etc/sgl-mesh-bridge.env` debe ser `600` y no versionarse.
- No publicar `4433` ni `4444` a la LAN; solo Nginx/bridge local.
- Para producción, usar certificados válidos y Ethernet (RN-019).
- El token de GitHub usado para subir el repo debe revocarse.

## 12. Troubleshooting

| Síntoma | Revisar |
|---|---|
| `/mesh/` 502 | `systemctl status meshcentral`, `ss -tulpn \| grep 4433`, `--host 172.18.0.1` |
| Agente no conecta | URL del agente, subpath `/mesh`, WebSocket en Nginx, TLS offload |
| Bridge 502 | `MESH_URL` correcto (`ws://.../mesh`), credenciales `MESH_USER/MESH_PASS` |
| `meshctrl` falla | Probar `node meshctrl.js ListDevices --help`, verificar `--url` y `--ignorecert` |
| SGL no actualiza estado | `MESH_API_URL`/`MESH_API_TOKEN` en `.env`, reiniciar backend |
