const path = require('path');
const { createMocker } = require('./mock');

const AUTH_SERVICE = path.join(__dirname, '../../src/modules/auth/auth.service.js');

const UUID_USER = '11111111-1111-4111-8111-111111111111';

const ENV = {
  nodeEnv: 'test',
  jwtSecret: 'test-secret-sgl',
  jwtExpires: '30m',
  jwtExpiresMs: 30 * 60 * 1000,
  sessionIdleMinutes: 30,
  authMaxAttempts: 5,
  authLockMinutes: 15,
  ldapUrl: 'ldaps://dc.clockwork.local:636',
  ldapTlsRejectUnauthorized: true,
  ldapBindDn: 'CN=Administrator,CN=Users,DC=clockwork,DC=local',
  ldapBindPassword: 'test-bind',
  ldapSearchBase: 'DC=clockwork,DC=local',
  ldapUsersDn: 'CN=Users,DC=clockwork,DC=local',
  ldapCaCert: '',
  ldapTlsServername: 'dc.clockwork.local',
  meshApiUrl: 'http://172.18.0.1:4444',
  meshApiToken: 'test-mesh-token',
  corsOrigin: '*',
};

function makeUser(overrides = {}) {
  return {
    id: UUID_USER,
    uid: 'jperez',
    email: 'jperez@clockwork.local',
    nombre_completo: 'Juan Perez',
    rol: 'DOCENTE',
    activo: true,
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    samba_dn: 'CN=Juan Perez,CN=Users,DC=clockwork,DC=local',
    samba_sid: 'S-1-5-21-1-2-3-1001',
    lastUpdate: null,
    async update(changes) {
      Object.assign(this, changes);
      this.lastUpdate = changes;
      return this;
    },
    ...overrides,
  };
}

function setupAuth(options = {}) {
  const mocker = createMocker(AUTH_SERVICE);
  const audit = [];
  let ldapCalls = 0;
  let sessionCreates = 0;

  const user = options.user === undefined ? makeUser() : options.user;

  const ldap = {
    async authenticate(...args) {
      ldapCalls += 1;
      if (options.ldapAuth) return options.ldapAuth(...args);
      return {
        dn: user ? user.samba_dn : 'CN=Juan,CN=Users,DC=clockwork,DC=local',
        uid: user ? user.uid : 'jperez',
        nombre: user ? user.nombre_completo : 'Juan Perez',
        email: user ? user.email : 'jperez@clockwork.local',
        sid: user ? user.samba_sid : 'S-1-5-21-1-2-3-1001',
      };
    },
    findUserByUid: async () => options.adUser || null,
    findUserByEmail: async () => options.adEmailUser || null,
    createUser: async () => options.ldapCreate || {
      dn: 'CN=Nuevo,CN=Users,DC=clockwork,DC=local',
      sid: 'S-1-5-21-1-2-3-2002',
    },
    updateUser: async () => ({}),
    deleteUser: async () => true,
  };

  const Usuario = {
    findOne: async () => (options.userLookup ? options.userLookup() : user),
    findByPk: async () => user,
    create: async (data) => (options.userCreate
      ? options.userCreate(data)
      : { id: UUID_USER, ...data, toJSON() { return this; } }),
  };

  const SesionWeb = {
    create: async (data) => {
      sessionCreates += 1;
      return options.sessionCreate ? options.sessionCreate(data) : { id: 'session-1', ...data };
    },
    update: async () => [1],
    findOne: async () => null,
  };

  const recordAuthEvent = async (req, event) => {
    audit.push({ ...event });
  };

  mocker.mock('../../config/env', ENV);
  mocker.mock('../../models', { Usuario, SesionWeb });
  mocker.mock('../audit/audit.service', { recordAuthEvent });
  mocker.mock('./ldap.service', ldap);

  const service = mocker.load();

  return {
    service,
    mocker,
    user,
    ldap,
    Usuario,
    SesionWeb,
    audit,
    env: ENV,
    ldapCalls: () => ldapCalls,
    sessionCreates: () => sessionCreates,
    restore: () => mocker.restore(),
  };
}

module.exports = {
  ENV,
  AUTH_SERVICE,
  UUID_USER,
  makeUser,
  setupAuth,
};
