# Instalar el agente MeshCentral en Windows para todos los usuarios

**Objetivo:** instalar el agente una sola vez en la PC, como **servicio de
Windows**, para que afecte a todos los usuarios y arranque con el equipo.

## Descarga directa desde SGL

El instalador ya está generado para el grupo `SGL-Lab`:

- Desde el Win10 en la red `sgl`: <http://192.168.100.58:8080/mesh/instalador>
- Desde el host: <http://192.168.0.50:8080/mesh/instalador>
- HTTPS: <https://192.168.100.58/mesh/instalador> (aceptar el certificado)
- Archivo: `meshagent64-SGL-Lab.exe` (3.4 MB)

Usar la URL sin barra final; si se agrega `/` al final, Nginx redirige al
archivo correcto. El instalador se sirve desde el volumen
`frontend/static` y sobrevive a los rebuild del frontend.

## 1. Descargar el agente correcto

En MeshCentral:

1. Abrir `http://192.168.100.58:8080/mesh/` (o `http://192.168.0.50:8080/mesh/`
   desde el host).
2. Entrar con la cuenta de administración.
3. Ir al grupo de equipos (`My Devices` o `SGL-Lab`).
4. Pulsar **Add Agent** / **Agregar agente**.
5. Elegir **Windows** y descargar el ejecutable, por ejemplo:
   `meshagent64-sgl-lab.exe`.

> No uses el **MeshCentral Assistant**: ese es por usuario. Para “todos los
> usuarios” se usa el instalador del **Mesh Agent**, que crea un servicio.

## 2. Instalarlo como servicio (todos los usuarios)

### Opción GUI

1. Copiar el `.exe` a la PC.
2. Ejecutarlo **como administrador**.
3. Pulsar **Install**.
4. El instalador crea:
   - Carpeta: `C:\Program Files\Mesh Agent`
   - Servicio: `mesh agent`
   - Inicio: automático, como `LocalSystem`.

### Opción silenciosa (GPO, script o consola)

En una consola **como administrador**:

```cmd
meshagent64-sgl-lab.exe -fullinstall
```

Ese modificador instala y registra el servicio sin abrir la ventana. En
Windows 11 24H2 es la opción recomendada si la ventana no aparece.

## 3. Verificar que quedó para todos los usuarios

```cmd
sc query "mesh agent"
sc qc "mesh agent"
```

Debe aparecer:

- Estado: `RUNNING`
- Inicio: `AUTO_START`
- Cuenta: `LocalSystem`

También puedes comprobar:

```cmd
Get-Service "mesh agent"
Get-Process meshagent
```

El servicio corre con la máquina encendida, **antes y después** de que cualquier
usuario inicie sesión. No hay que instalarlo por usuario.

## 4. Ver la PC en MeshCentral y en SGL

1. Esperar 1–2 minutos.
2. En MeshCentral, la PC aparece en el grupo de equipos.
3. En SGL, entrar como `atecnico` → **Equipos → Sincronizar estado**.
4. La PC debe aparecer con estado **Encendido**, IP y último reporte.

Si el hostname de la PC no coincide con el equipo registrado en SGL, edita el
equipo en **Equipos → Editar** o crea el equipo con el hostname real.

## 5. Desinstalar

```cmd
"C:\Program Files\Mesh Agent\MeshAgent.exe" -fulluninstall
```

o, si conservas el instalador:

```cmd
meshagent64-sgl-lab.exe -fulluninstall
```

## 6. Notas importantes

- El agente es **por máquina**, no por usuario. Todos los usuarios de la PC
  quedan cubiertos.
- El agente se ejecuta como `LocalSystem`; los comandos/scripts que lances desde
  MeshCentral afectan a la máquina completa.
- Si quieres políticas o aplicaciones **por usuario**, eso se hace con GPO
  (HU-COM-01) o con el mecanismo de despliegue de SGL, no instalando el agente
  otra vez.
- El instalador descargado ya viene configurado con la URL del servidor y el
  grupo de equipos. No uses un instalador genérico de otro servidor.
- La PC debe estar en la red interna `sgl` y poder abrir
  `http://192.168.100.58:8080/mesh/`.
- Para varias PCs del laboratorio, copia el mismo instalador y ejecútalo con
  `-fullinstall` por GPO, script de inicio o MeshCentral.

## 7. Troubleshooting

| Síntoma | Revisar |
|---|---|
| No aparece en MeshCentral | `sc query "mesh agent"`, `C:\Program Files\Mesh Agent\meshagent.log`, conectividad a `192.168.100.58:8080` |
| La ventana no abre en Win11 24H2 | Usar `-fullinstall` en consola elevada |
| El servicio no arranca | `services.msc`, cuenta `LocalSystem`, antivirus/firewall |
| Aparece pero sin IP/usuario | Esperar el primer reporte o pulsar **Sincronizar estado** en SGL |
| Se instaló solo para un usuario | Desinstalar y usar el instalador `Mesh Agent` con `-fullinstall`, no el Assistant |
| La PC figura APAGADA y el log del servidor dice `Agent bad web cert hash` | El agente fijó el hash de un certificado anterior: regenerar el instalador (sección 8) y reinstalar |

## 8. Regenerar el instalador (hash de certificado desactualizado)

El agente fija (pin) el hash de la clave publica del certificado web de
MeshCentral. Si los certificados del servidor se regeneran (por ejemplo al
reinstalar MeshCentral o al recrear su carpeta de datos), el agente deja de
validar el servidor: la sesion queda en `holding connection`, la PC nunca
reporta y figura **APAGADA** aunque este encendida y con un usuario
logueado.

Sintoma en el servidor:

```
journalctl -u meshcentral | grep "bad web cert hash"
Agent bad web cert hash (Agent:66d3e9f296 != Server:aed2a47e68 or 96692508c5),
holding connection (192.168.100.100:51412).
```

La solucion es regenerar el instalador (MeshCentral lo genera con el hash y
la URL actuales) y reinstalarlo en la PC:

```bash
# en el servidor Ubuntu
sudo bash /opt/sgl-web/scripts/mesh-agent-installer.sh
```

El script deja el instalador actualizado en
`frontend/static/meshagent64-SGL-Lab.exe`, que se sigue descargando desde
`http://<servidor>:8080/mesh/instalador`.

En la PC (consola **como administrador**):

```cmd
:: si el agente anterior quedo con una configuracion incompatible
"C:\Program Files\Mesh Agent\MeshAgent.exe" -fulluninstall
:: luego instalar el nuevo
meshagent64-SGL-Lab.exe -fullinstall
```

Comprobar que el servicio quedo bien:

```cmd
sc query "mesh agent"
```

Debe decir `RUNNING`, con inicio `AUTO_START` y cuenta `LocalSystem`. En
MeshCentral y en SGL la PC pasa a **Encendido** en el siguiente reporte.

## 9. SSH para administración desde el Ubuntu

La PC del laboratorio tiene **OpenSSH Server** habilitado para administrarla
desde el servidor Ubuntu sin depender del bridge de MeshCentral.

### Configuración aplicada en la PC

```powershell
# Servicio automatico
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd

# Clave publica del Ubuntu (usuario administrador)
# C:\ProgramData\ssh\administrators_authorized_keys
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant Administradores:F /grant SYSTEM:F
```

### Uso desde el Ubuntu

El alias está en `~/.ssh/config` del usuario `sgl`:

```text
Host sgl-win
  HostName 192.168.100.100
  User vboxuser
  IdentityFile ~/.ssh/sgl_win
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
```

```bash
ssh sgl-win "hostname && whoami"
scp archivo.exe sgl-win:C:/Windows/Temp/
scp sgl-win:C:/Windows/Temp/resultado.txt ./
```

El shell por defecto es `cmd.exe`: usar `&&` para encadenar comandos (no `;`).

### Notas

- La clave privada vive en el servidor (`/home/sgl/.ssh/sgl_win`, permisos 600).
- El puerto 22 queda accesible en la red del laboratorio (`192.168.100.0/24`).
- Para comandos de PowerShell: `ssh sgl-win "powershell -NoProfile -Command \"...\""`.
