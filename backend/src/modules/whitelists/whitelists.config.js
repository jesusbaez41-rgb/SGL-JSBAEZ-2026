const crypto = require('crypto');
const { normalizarDominio, esDominioValido, dominioSquid, nombreAcl } = require('./whitelists.domain');

/**
 * Constructores puros de la configuración de filtrado (CA-07).
 *
 * Todo lo que llega desde la base de datos se valida antes de escribirlo:
 * un dominio con un salto de línea podría inyectar directivas en Squid.
 */

const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

function hashCorto(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 6);
}

function normalizarProxy(proxy = {}) {
  const host = String(proxy.host || '').trim().toLowerCase();
  const puerto = Number(proxy.port);
  if (!HOST_PATTERN.test(host)) throw new Error('El host del proxy no es válido.');
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error('El puerto del proxy no es válido.');
  }
  return { host, port: puerto };
}

function aclDeGrupo(grupo) {
  return `${nombreAcl('sgl_g', grupo.codigo)}_${hashCorto(grupo.id)}`;
}

function aclDeDominios(grupo) {
  return `${nombreAcl('sgl_d', grupo.codigo)}_${hashCorto(grupo.id)}`;
}

/**
 * Dominios habilitados siempre para cualquier grupo (pedido del laboratorio).
 * No aplica a estudiantes sin grupo: RN-016 sigue siendo deny-by-default.
 */
const DOMINIOS_BASE = Object.freeze(['google.com']);

/**
 * Genera el squid.conf completo a partir de las listas y las sesiones activas.
 *
 * @param {object} datos
 * @param {{host:string,port:number}} datos.proxy
 * @param {Array<{id:string,codigo:string}>} datos.grupos
 * @param {Array<{grupo_id:string,url:string}>} datos.listas
 * @param {Array<{ip:string,grupo_ids:string[]}>} datos.sesiones
 * @param {string[]} [datos.redes_internas] redes consideradas recursos internos
 */
function construirSquidConfig(datos = {}) {
  const proxy = normalizarProxy(datos.proxy);
  const grupos = Array.isArray(datos.grupos) ? datos.grupos : [];
  const listas = Array.isArray(datos.listas) ? datos.listas : [];
  const sesiones = Array.isArray(datos.sesiones) ? datos.sesiones : [];
  const redesInternas =
    Array.isArray(datos.redes_internas) && datos.redes_internas.length
      ? datos.redes_internas.filter((red) => /^[0-9a-f.:/]+$/i.test(String(red)))
      : ['192.168.100.0/24'];

  const dominiosPorGrupo = new Map();
  for (const fila of listas) {
    const dominio = dominioSquid(fila.url);
    if (!dominio) continue;
    if (!dominiosPorGrupo.has(fila.grupo_id)) dominiosPorGrupo.set(fila.grupo_id, new Set());
    dominiosPorGrupo.get(fila.grupo_id).add(dominio);
  }

  const dominiosBase = DOMINIOS_BASE.map((dominio) => dominioSquid(dominio)).filter(Boolean);

  const ipsPorGrupo = new Map();
  for (const sesion of sesiones) {
    const ip = String(sesion.ip || '').trim();
    if (!/^[0-9a-f.:]+$/i.test(ip)) continue;
    for (const grupoId of sesion.grupo_ids || []) {
      if (!ipsPorGrupo.has(grupoId)) ipsPorGrupo.set(grupoId, new Set());
      ipsPorGrupo.get(grupoId).add(ip);
    }
  }

  const definiciones = [];
  const reglas = [];
  const resumen = { grupos: [], dominios: 0, sesiones: sesiones.length };

  for (const grupo of grupos) {
    const dominios = [
      ...new Set([...(dominiosPorGrupo.get(grupo.id) || []), ...dominiosBase]),
    ].sort();
    const ips = [...(ipsPorGrupo.get(grupo.id) || [])].sort();
    if (!dominios.length) continue;

    const aclGrupo = aclDeGrupo(grupo);
    const aclDominios = aclDeDominios(grupo);
    definiciones.push(`# Grupo ${grupo.codigo}`);
    definiciones.push(`acl ${aclDominios} dstdomain ${dominios.join(' ')}`);
    resumen.dominios += dominios.length;
    resumen.grupos.push({ codigo: grupo.codigo, dominios: dominios.length, equipos: ips.length });

    // Sin equipos conectados con este grupo no hace falta la ACL de origen,
    // pero se deja para documentar el grupo en el archivo.
    if (!ips.length) continue;
    definiciones.push(`acl ${aclGrupo} src ${ips.join(' ')}`);
    reglas.push(`http_access allow ${aclGrupo} ${aclDominios}`);
  }

  const lineas = [
    '# =====================================================================',
    '# SGL - Configuracion de filtrado de navegacion (HU-COM-09, RN-016)',
    '# Generado automaticamente. No editar a mano.',
    '#',
    '# Politica: deny-by-default. Solo se permite lo que aparece en la lista',
    '# blanca de algun grupo activo del estudiante en sesion.',
    '# =====================================================================',
    '',
    `http_port ${proxy.host}:${proxy.port}`,
    'visible_hostname sgl-proxy',
    'cache deny all',
    'forwarded_for delete',
    // El host no tiene ruta IPv6: si el dominio publica AAAA, Squid debe
    // intentar IPv4 en paralelo en lugar de esperar el timeout de IPv6.
    'happy_eyeballs_connect_timeout 250 milliseconds',
    'connect_timeout 10 seconds',
    '',
    'acl sgl_safe port 80 443 8080',
    'acl sgl_ssl port 443',
    'acl CONNECT method CONNECT',
    '# CA-03/CA-06: se rechaza el acceso directo por IP literal.',
    'acl sgl_numeric_host dstdom_regex -i ^[0-9]{1,3}(\\.[0-9]{1,3}){3}$',
    '# RN-016: los recursos internos siguen disponibles sin lista blanca.',
    // Squid 6+ rechaza dominios solapados (.clockwork.local ya está en .local).
    `acl sgl_intranet dstdomain .clockwork.local`,
    `acl sgl_interno dst ${redesInternas.join(' ')}`,
    '',
    ...definiciones,
    '',
    '# --- Reglas de acceso (el orden importa) ---',
    'http_access deny !sgl_safe',
    'http_access deny CONNECT !sgl_ssl',
    'http_access deny sgl_numeric_host',
    'http_access deny to_localhost',
    'http_access allow sgl_intranet',
    'http_access allow sgl_interno',
    ...reglas,
    '# CA-02/CA-05: todo lo demas se bloquea de inmediato.',
    'http_access deny all',
    '',
    'logformat sgl_nav %ts.%03tu %>a %un %rm %ru %Ss/%03>Hs %<st',
    'access_log /var/log/squid/access.log sgl_nav',
    'cache_log /var/log/squid/cache.log',
    '',
  ];

  return { texto: lineas.join('\n'), resumen };
}

/** Configuración estilo SquidGuard para el grupo (CA-07). */
function construirSquidGuard(grupo, dominios) {
  const lista = [...new Set((dominios || []).map(normalizarDominio).filter(esDominioValido))].sort();
  const destino = nombreAcl('sgl', grupo.codigo) + '_' + hashCorto(grupo.id);
  return [
    `# SGL - SquidGuard para el grupo ${grupo.codigo} (RN-016)`,
    `# Dominios permitidos: ${lista.length}`,
    `dest ${destino} {`,
    `    domainlist ${destino}/dominios`,
    '}',
    '',
    'acl {',
    `    ${destino} {`,
    `        pass ${destino} !sgl_default all`,
    '    }',
    '    default {',
    '        pass none',
    '    }',
    '}',
    '',
    '# dominios:',
    ...lista.map((dominio) => `#   ${dominio}`),
    '',
  ].join('\n');
}

/** PAC que manda todo lo externo al proxy (CA-07: configuración de navegador). */
function construirPac(proxyDatos) {
  const proxy = normalizarProxy(proxyDatos);
  return [
    '// SGL - Proxy Auto-Config (HU-COM-09, RN-016)',
    'function FindProxyForURL(url, host) {',
    '  host = host.toLowerCase();',
    '  if (isPlainHostName(host)) return "DIRECT";',
    '  if (shExpMatch(host, "*.clockwork.local")) return "DIRECT";',
    '  if (shExpMatch(host, "*.local")) return "DIRECT";',
    '  if (/^(10|127)\\./.test(host)) return "DIRECT";',
    `  return "PROXY ${proxy.host}:${proxy.port}; DIRECT";`,
    '}',
    '',
  ].join('\n');
}

function psQuote(value) {
  return `'${String(value == null ? '' : value).replace(/'/g, "''")}'`;
}

/**
 * Script de la PC (CA-01/CA-04/CA-06).
 *
 * -Modo Firewall (SYSTEM): bloquea a los estudiantes SGL (por su SID de
 * usuario, que Windows Firewall exige en formato SDDL) la salida directa a
 * Internet por 80/443/8080/8443, QUIC, DNS externo y puertos de VPN. El
 * proxy queda dentro de la subred local, por lo que sigue accesible.
 *
 * -Modo Sesion (usuario): informa la sesión al backend y configura el proxy
 * del navegador. El administrador local queda exento.
 */
function construirScriptPc({ usuarios, proxy, agentKey, apiBase, exencionAdmin = true }) {
  const proxyOk = normalizarProxy(proxy);
  const sids = (usuarios || [])
    .map((usuario) => String(usuario.samba_sid || '').trim())
    .filter((sid) => /^S-1-5-[\d-]+$/.test(sid));
  const listaSids = [...new Set(sids)].map((sid) => `'${sid}'`).join(', ');
  const api = String(apiBase || '').replace(/\/$/, '');

  return [
    '# SGL - Agente de navegacion (HU-COM-09). Generado automaticamente.',
    'param([string]$Modo = "Sesion")',
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$log = 'C:\\ProgramData\\SGL\\navegacion.log'",
    "New-Item -ItemType Directory -Force -Path 'C:\\ProgramData\\SGL' | Out-Null",
    "function Log($m) { Add-Content -Path $log -Value ((Get-Date -Format o) + ' ' + $m) }",
    `$usuariosSgl = @(${listaSids})`,
    `$proxyHost = ${psQuote(proxyOk.host)}`,
    `$proxyPort = ${proxyOk.port}`,
    `$apiUrl = ${psQuote(`${api}/navigation/session`)}`,
    `$agentKey = ${psQuote(agentKey || '')}`,
    `$exencionAdmin = $${exencionAdmin ? 'true' : 'false'}`,
    '',
    'function ModoFirewall {',
    "  Get-NetFirewallRule -DisplayName 'SGL-Nav-*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue",
    '  $web = @(80, 443, 8080, 8443)',
    '  $ok = 0',
    '  foreach ($sid in $usuariosSgl) {',
    '    $sufijo = $sid.Replace(" ", "")',
    '    # Windows Firewall exige el SID del usuario como SDDL en -LocalUser.',
    '    $sddl = "D:(A;;CC;;;" + $sid + ")"',
    '    try {',
    '      New-NetFirewallRule -DisplayName ("SGL-Nav-Web-" + $sufijo) -Direction Outbound -Action Block -Profile Any -Protocol TCP -RemotePort $web -RemoteAddress Internet -LocalUser $sddl -ErrorAction Stop | Out-Null',
    '      New-NetFirewallRule -DisplayName ("SGL-Nav-Quic-" + $sufijo) -Direction Outbound -Action Block -Profile Any -Protocol UDP -RemotePort 443 -RemoteAddress Internet -LocalUser $sddl -ErrorAction Stop | Out-Null',
    '      New-NetFirewallRule -DisplayName ("SGL-Nav-DnsUdp-" + $sufijo) -Direction Outbound -Action Block -Profile Any -Protocol UDP -RemotePort 53 -RemoteAddress Internet -LocalUser $sddl -ErrorAction Stop | Out-Null',
    '      New-NetFirewallRule -DisplayName ("SGL-Nav-DnsTcp-" + $sufijo) -Direction Outbound -Action Block -Profile Any -Protocol TCP -RemotePort 53 -RemoteAddress Internet -LocalUser $sddl -ErrorAction Stop | Out-Null',
    '      New-NetFirewallRule -DisplayName ("SGL-Nav-VpnUdp-" + $sufijo) -Direction Outbound -Action Block -Profile Any -Protocol UDP -RemotePort 500,4500,1194,51820 -RemoteAddress Internet -LocalUser $sddl -ErrorAction Stop | Out-Null',
    '      New-NetFirewallRule -DisplayName ("SGL-Nav-VpnTcp-" + $sufijo) -Direction Outbound -Action Block -Profile Any -Protocol TCP -RemotePort 1723 -RemoteAddress Internet -LocalUser $sddl -ErrorAction Stop | Out-Null',
    '      New-NetFirewallRule -DisplayName ("SGL-Nav-Proxy-" + $sufijo) -Direction Outbound -Action Allow -Profile Any -Protocol TCP -RemotePort $proxyPort -RemoteAddress $proxyHost -LocalUser $sddl -ErrorAction Stop | Out-Null',
    '      $ok++',
    '    } catch {',
    '      Log ("error al crear las reglas para " + $sid + ": " + $_.Exception.Message)',
    '    }',
    '  }',
    '  Log ("firewall de navegacion aplicado a " + $ok + " de " + $usuariosSgl.Count + " usuario(s)")',
    '}',
    '',
    'function ModoSesion {',
    '  $identidad = [System.Security.Principal.WindowsIdentity]::GetCurrent()',
    '  $misGrupos = @($identidad.Groups | ForEach-Object { $_.Value })',
    "  $internet = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
    '  if ($exencionAdmin -and ($misGrupos -contains "S-1-5-32-544")) {',
    "    Remove-ItemProperty -Path $internet -Name ProxyEnable -ErrorAction SilentlyContinue",
    "    Log 'admin: sin proxy ni filtrado'",
    '    exit 0',
    '  }',
    '  $esSgl = $usuariosSgl -contains $identidad.User.Value',
    "  if (-not $esSgl) { Log 'usuario fuera de los grupos SGL: sin proxy'; exit 0 }",
    '  $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.InterfaceAlias -notlike "*Loopback*" } | Select-Object -First 1).IPAddress',
    '  $cuerpo = @{ hostname = $env:COMPUTERNAME; sid = $identidad.User.Value; ip = $ip } | ConvertTo-Json',
    '  try {',
    '    $resp = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers @{ "x-agent-key" = $agentKey } -ContentType "application/json" -Body $cuerpo -TimeoutSec 10',
    '  } catch {',
    '    # Fail-closed: sin registro no se configura proxy y la navegacion queda bloqueada.',
    '    Log ("no se pudo registrar la sesion: " + $_.Exception.Message)',
    '    exit 1',
    '  }',
    '  Set-ItemProperty -Path $internet -Name ProxyEnable -Value 1 -Type DWord',
    '  Set-ItemProperty -Path $internet -Name ProxyServer -Value ($proxyHost + ":" + $proxyPort)',
    "  Set-ItemProperty -Path $internet -Name ProxyOverride -Value '<local>;*.clockwork.local;*.local;192.168.100.*'",
    '  Log ("sesion registrada: grupos=" + ($resp.grupos -join ",") + " dominios=" + $resp.dominios.Count)',
    '  exit 0',
    '}',
    '',
    'switch ($Modo) {',
    '  "Firewall" { ModoFirewall }',
    '  default { ModoSesion }',
    '}',
    'exit 0',
    '',
  ].join('\r\n');
}

module.exports = {
  DOMINIOS_BASE,
  construirSquidConfig,
  construirSquidGuard,
  construirPac,
  construirScriptPc,
  normalizarProxy,
};
