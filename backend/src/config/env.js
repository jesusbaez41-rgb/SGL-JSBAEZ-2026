require('dotenv').config();

/**
 * Convierte "30m", "8h", "2d" a milisegundos.
 * No se usa una librería externa para mantener mínima la superficie.
 */
function parseDuration(value, fallbackMs) {
  if (!value) return fallbackMs;
  const match = String(value).trim().match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factor = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  return amount * factor;
}

const jwtExpires = process.env.JWT_EXPIRES || '8h';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,

  // HU-COM-14 / CA-03: expiración absoluta configurable del JWT
  jwtSecret: process.env.JWT_SECRET || 'change_me',
  jwtExpires,
  jwtExpiresMs: parseDuration(jwtExpires, 8 * 60 * 60 * 1000),

  // HU-COM-14 / CA-11: expiración por inactividad
  sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES || 30),

  // HU-COM-14 / CA-09: bloqueo tras N intentos fallidos
  authMaxAttempts: Number(process.env.AUTH_MAX_ATTEMPTS || 5),
  authLockMinutes: Number(process.env.AUTH_LOCK_MINUTES || 15),

  // HU-COM-14 / CA-02: autenticación contra Samba AD por LDAPS
  ldapUrl: process.env.LDAP_URL || 'ldaps://dc.clockwork.local:636',
  ldapBindDn: process.env.LDAP_BIND_DN || 'CN=Administrator,CN=Users,DC=clockwork,DC=local',
  ldapBindPassword: process.env.LDAP_BIND_PASSWORD || '',
  ldapSearchBase: process.env.LDAP_SEARCH_BASE || 'DC=clockwork,DC=local',
  // HU-COM-02: contenedor donde se crean las cuentas nuevas
  ldapUsersDn: process.env.LDAP_USERS_DN || 'CN=Users,DC=clockwork,DC=local',
  // HU-COM-05: contenedor donde se crean los grupos
  ldapGroupsDn:
    process.env.LDAP_GROUPS_DN ||
    process.env.LDAP_USERS_DN ||
    'CN=Users,DC=clockwork,DC=local',
  ldapCaCert: process.env.LDAP_CA_CERT || '',
  ldapTlsServername: process.env.LDAP_TLS_SERVERNAME || 'dc.clockwork.local',
  ldapTlsRejectUnauthorized: String(process.env.LDAP_TLS_REJECT_UNAUTHORIZED || 'true') !== 'false',

  // HU-COM-03 / HU-COM-04: bridge local que consulta MeshCentral
  meshApiUrl: process.env.MESH_API_URL || '',
  meshApiToken: process.env.MESH_API_TOKEN || '',
  // HU-COM-04 / CA-08: sincronización periódica (0 desactiva el job).
  meshSyncMinutes: Number(process.env.MESH_SYNC_MINUTES || 5),
  meshApiTimeoutMs: Number(process.env.MESH_API_TIMEOUT_MS || 8000),

  // HU-COM-07: directorio base para rutas relativas de instaladores.
  appsInstallersDir: process.env.APPS_INSTALLERS_DIR || '/opt/sgl-instaladores',

  corsOrigin: process.env.CORS_ORIGIN || '*',
};

env.parseDuration = parseDuration;

module.exports = env;
