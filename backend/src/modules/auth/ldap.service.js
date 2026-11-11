const fs = require('fs');
const { Client, Change, Attribute } = require('ldapts');
const env = require('../../config/env');
const logger = require('../../utils/logger');

const CONNECT_TIMEOUT = 10000;
const SEARCH_ATTRIBUTES = [
  'dn',
  'sAMAccountName',
  'displayName',
  'cn',
  'givenName',
  'sn',
  'mail',
  'objectSid',
  'userAccountControl',
];

function buildTlsOptions() {
  const options = {
    servername: env.ldapTlsServername,
    rejectUnauthorized: env.ldapTlsRejectUnauthorized,
  };

  if (env.ldapCaCert) {
    try {
      options.ca = [fs.readFileSync(env.ldapCaCert)];
    } catch (err) {
      logger.error('No se pudo leer el certificado CA de Samba AD', {
        path: env.ldapCaCert,
        error: err.message,
      });
    }
  }

  return options;
}

function createClient() {
  return new Client({
    url: env.ldapUrl,
    timeout: CONNECT_TIMEOUT,
    connectTimeout: CONNECT_TIMEOUT,
    tlsOptions: buildTlsOptions(),
  });
}

async function safeUnbind(client) {
  try {
    await client.unbind();
  } catch {
    /* ignorar */
  }
}

/**
 * Escapa el valor para un filtro LDAP (RFC 4515).
 */
function escapeFilter(value) {
  return String(value).replace(/[\0()*\\]/g, (char) => {
    return `\\${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
}

/**
 * Escapa un valor para usarlo como RDN de un DN (RFC 4514).
 */
function escapeDnValue(value) {
  return String(value)
    .replace(/([\\,+"<>;=])/g, '\\$1')
    .replace(/^ /, '\\ ')
    .replace(/ $/, '\\ ');
}

/**
 * Convierte el objectSid binario de AD a notación S-1-5-...
 */
function bufferToSid(value) {
  // ldapts puede devolver objectSid como Buffer o como string binario.
  let buffer = value;
  if (typeof value === 'string') buffer = Buffer.from(value, 'latin1');
  else if (Array.isArray(value)) buffer = Buffer.from(value);

  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  const revision = buffer[0];
  const count = buffer[1];
  let sid = `S-${revision}-${buffer.readUIntBE(2, 6)}`;
  for (let i = 0; i < count; i += 1) {
    sid += `-${buffer.readUInt32LE(8 + i * 4)}`;
  }
  return sid;
}

function ldapError(code, message, cause) {
  const err = new Error(message);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

/**
 * Traduce los códigos LDAP de ldapts (numéricos) a códigos de dominio.
 */
function mapLdapFailure(err, fallbackMessage) {
  const code = Number(err && err.code);
  const map = {
    19: ['LDAP_CONSTRAINT', 'Samba AD rechazó los datos (restricción de política).'],
    21: ['LDAP_CONSTRAINT', 'Samba AD rechazó los datos (sintaxis inválida).'],
    32: ['NOT_FOUND', 'La cuenta no existe en Samba AD.'],
    49: ['INVALID_CREDENTIALS', 'Credenciales inválidas.'],
    50: ['INSUFFICIENT_ACCESS', 'Samba AD rechazó la operación por permisos insuficientes.'],
    53: ['LDAP_UNWILLING', 'Samba AD no está dispuesto a realizar la operación.'],
    65: ['LDAP_CONSTRAINT', 'Samba AD rechazó los datos (clase de objeto).'],
    68: ['ENTRY_ALREADY_EXISTS', 'La cuenta ya existe en Samba AD.'],
  };

  const found = map[code];
  if (found) return ldapError(found[0], found[1], err);
  return ldapError('LDAP_ERROR', fallbackMessage, err);
}

/**
 * Abre un cliente, hace bind de servicio y garantiza el unbind.
 */
async function withServiceClient(fn) {
  const client = createClient();

  try {
    await client.bind(env.ldapBindDn, env.ldapBindPassword);
  } catch (err) {
    await safeUnbind(client);
    logger.error('LDAP: fallo el bind de servicio', { error: err.message });
    throw ldapError(
      'LDAP_SERVICE_UNAVAILABLE',
      'Servicio de autenticación no disponible',
      err,
    );
  }

  try {
    return await fn(client);
  } finally {
    await safeUnbind(client);
  }
}

function mapEntry(entry) {
  const uac = Number(entry.userAccountControl || 0);
  return {
    dn: String(entry.dn),
    uid: String(entry.sAMAccountName || ''),
    nombre: String(entry.displayName || entry.cn || ''),
    email: entry.mail ? String(entry.mail) : null,
    sid: bufferToSid(entry.objectSid),
    enabled: (uac & 2) === 0,
    userAccountControl: uac,
  };
}

function replaceAttr(type, values) {
  return new Change({
    operation: 'replace',
    modification: new Attribute({ type, values }),
  });
}

function encodePassword(password) {
  return Buffer.from(`"${password}"`, 'utf16le');
}

function splitName(nombre) {
  const parts = String(nombre).trim().split(/\s+/).filter(Boolean);
  const givenName = parts.shift() || String(nombre).trim();
  const sn = parts.join(' ') || givenName;
  return { givenName, sn };
}

async function findUserByUid(uid) {
  return withServiceClient(async (client) => {
    const { searchEntries } = await client.search(env.ldapSearchBase, {
      scope: 'sub',
      filter: `(&(objectClass=user)(sAMAccountName=${escapeFilter(uid)}))`,
      attributes: SEARCH_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
      sizeLimit: 2,
    });
    return searchEntries && searchEntries.length > 0 ? mapEntry(searchEntries[0]) : null;
  });
}

async function findUserByEmail(email) {
  return withServiceClient(async (client) => {
    const { searchEntries } = await client.search(env.ldapSearchBase, {
      scope: 'sub',
      filter: `(&(objectClass=user)(mail=${escapeFilter(email)}))`,
      attributes: SEARCH_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
      sizeLimit: 2,
    });
    return searchEntries && searchEntries.length > 0 ? mapEntry(searchEntries[0]) : null;
  });
}

async function findUserByDn(dn) {
  return withServiceClient(async (client) => {
    try {
      const { searchEntries } = await client.search(dn, {
        scope: 'base',
        filter: '(objectClass=user)',
        attributes: SEARCH_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
      });
      return searchEntries && searchEntries.length > 0 ? mapEntry(searchEntries[0]) : null;
    } catch (err) {
      if (Number(err.code) === 32) return null;
      throw mapLdapFailure(err, 'No se pudo consultar la cuenta en Samba AD.');
    }
  });
}

/**
 * Crea una cuenta en Samba AD (CA-01/CA-04):
 *  1. add deshabilitada (UAC 514) con los metadatos.
 *  2. unicodePwd por LDAPS.
 *  3. habilitar (UAC 512).
 * Si algo falla después del add, se elimina la cuenta para no dejar residuos.
 */
async function createUser({ uid, nombre, email, password }) {
  return withServiceClient(async (client) => {
    const baseName = String(nombre).trim();
    const candidates = [
      `CN=${escapeDnValue(baseName)},${env.ldapUsersDn}`,
      `CN=${escapeDnValue(`${baseName} (${uid})`)},${env.ldapUsersDn}`,
    ];
    const { givenName, sn } = splitName(baseName);

    let dn = null;
    let lastError = null;

    for (const candidate of candidates) {
      try {
        await client.add(candidate, {
          objectClass: ['top', 'person', 'organizationalPerson', 'user'],
          cn: baseName,
          sAMAccountName: uid,
          displayName: baseName,
          givenName,
          sn,
          mail: email,
          userAccountControl: '514',
        });
        dn = candidate;
        break;
      } catch (err) {
        lastError = err;
        if (Number(err.code) !== 68) break;
      }
    }

    if (!dn) {
      throw mapLdapFailure(lastError, 'No se pudo crear la cuenta en Samba AD.');
    }

    try {
      await client.modify(dn, replaceAttr('unicodePwd', [encodePassword(password)]));
      await client.modify(dn, replaceAttr('userAccountControl', ['512']));
    } catch (err) {
      try {
        await client.del(dn);
      } catch (cleanupError) {
        logger.error('LDAP: no se pudo revertir la creación de la cuenta', {
          dn,
          error: cleanupError.message,
        });
      }
      throw mapLdapFailure(
        err,
        'Samba AD rechazó la contraseña o no se pudo habilitar la cuenta.',
      );
    }

    const { searchEntries } = await client.search(dn, {
      scope: 'base',
      filter: '(objectClass=user)',
      attributes: SEARCH_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
    });

    return mapEntry(searchEntries[0]);
  });
}

/**
 * Actualiza metadatos y estado de una cuenta en Samba AD.
 * El uid y el DN se mantienen estables; el nombre se refleja en displayName.
 */
async function updateUser(dn, { nombre, email, password, enabled } = {}) {
  return withServiceClient(async (client) => {
    try {
      if (password) {
        await client.modify(dn, replaceAttr('unicodePwd', [encodePassword(password)]));
      }

      const changes = [];
      if (nombre) {
        const { givenName, sn } = splitName(nombre);
        changes.push(replaceAttr('displayName', [String(nombre).trim()]));
        changes.push(replaceAttr('givenName', [givenName]));
        changes.push(replaceAttr('sn', [sn]));
      }
      if (email) {
        changes.push(replaceAttr('mail', [email]));
      }
      if (enabled !== undefined) {
        changes.push(replaceAttr('userAccountControl', [enabled ? '512' : '514']));
      }
      if (changes.length > 0) {
        await client.modify(dn, changes);
      }

      const { searchEntries } = await client.search(dn, {
        scope: 'base',
        filter: '(objectClass=user)',
        attributes: SEARCH_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
      });
      return mapEntry(searchEntries[0]);
    } catch (err) {
      throw mapLdapFailure(err, 'No se pudo actualizar la cuenta en Samba AD.');
    }
  });
}

async function setUserEnabled(dn, enabled) {
  return updateUser(dn, { enabled: Boolean(enabled) });
}

/**
 * Elimina una cuenta de Samba AD. Se usa solo como compensación si la
 * escritura en PostgreSQL falla después de crear la cuenta en el directorio.
 */
async function deleteUser(dn) {
  return withServiceClient(async (client) => {
    try {
      await client.del(dn);
    } catch (err) {
      if (Number(err.code) === 32) return false;
      throw mapLdapFailure(err, 'No se pudo eliminar la cuenta en Samba AD.');
    }
    return true;
  });
}

/**
 * Autentica contra Samba AD:
 *  1. bind de servicio para localizar el DN por sAMAccountName
 *  2. bind con el DN + contraseña del usuario (LDAPS)
 *
 * La contraseña nunca se almacena ni se loguea.
 */
async function authenticate(uid, password) {
  const entry = await withServiceClient(async (client) => {
    const { searchEntries } = await client.search(env.ldapSearchBase, {
      scope: 'sub',
      filter: `(&(objectClass=user)(sAMAccountName=${escapeFilter(uid)}))`,
      attributes: SEARCH_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
      sizeLimit: 2,
    });

    if (!searchEntries || searchEntries.length === 0) {
      throw ldapError('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    return searchEntries[0];
  });

  const userAccountControl = Number(entry.userAccountControl || 0);
  if ((userAccountControl & 2) !== 0) {
    throw ldapError('ACCOUNT_DISABLED', 'Cuenta deshabilitada en Samba AD');
  }

  const userClient = createClient();
  try {
    await userClient.bind(entry.dn, password);
  } catch (err) {
    throw ldapError('INVALID_CREDENTIALS', 'Credenciales inválidas', err);
  } finally {
    await safeUnbind(userClient);
  }

  return {
    dn: String(entry.dn),
    uid: String(entry.sAMAccountName || uid),
    nombre: String(entry.displayName || entry.cn || uid),
    email: entry.mail ? String(entry.mail) : null,
    sid: bufferToSid(entry.objectSid),
  };
}

// ---------------------------------------------------------------------------
// HU-COM-05: operaciones sobre grupos de Samba AD
// ---------------------------------------------------------------------------

const GROUP_ATTRIBUTES = [
  'dn',
  'sAMAccountName',
  'description',
  'objectSid',
  'member',
  'groupType',
];

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function mapGroupEntry(entry) {
  return {
    dn: String(entry.dn),
    codigo: String(entry.sAMAccountName || ''),
    descripcion: entry.description ? String(entry.description) : null,
    sid: bufferToSid(entry.objectSid),
    members: toArray(entry.member),
    groupType: entry.groupType !== undefined ? String(entry.groupType) : null,
  };
}

async function findGroupByCode(codigo) {
  return withServiceClient(async (client) => {
    const { searchEntries } = await client.search(env.ldapSearchBase, {
      scope: 'sub',
      filter: `(&(objectClass=group)(sAMAccountName=${escapeFilter(codigo)}))`,
      attributes: GROUP_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
      sizeLimit: 2,
    });
    return searchEntries && searchEntries.length > 0 ? mapGroupEntry(searchEntries[0]) : null;
  });
}

async function findGroupByDn(dn) {
  return withServiceClient(async (client) => {
    try {
      const { searchEntries } = await client.search(dn, {
        scope: 'base',
        filter: '(objectClass=group)',
        attributes: GROUP_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
      });
      return searchEntries && searchEntries.length > 0 ? mapGroupEntry(searchEntries[0]) : null;
    } catch (err) {
      if (Number(err.code) === 32) return null;
      throw mapLdapFailure(err, 'No se pudo consultar el grupo en Samba AD.');
    }
  });
}

async function createGroup({ codigo, descripcion }) {
  return withServiceClient(async (client) => {
    const baseName = String(codigo).trim();
    const dn = `CN=${escapeDnValue(baseName)},${env.ldapGroupsDn}`;
    const attributes = {
      objectClass: ['top', 'group'],
      cn: baseName,
      sAMAccountName: baseName,
      // Grupo global de seguridad (AD groupType).
      groupType: '-2147483646',
    };
    if (descripcion) attributes.description = String(descripcion);

    try {
      await client.add(dn, attributes);
    } catch (err) {
      throw mapLdapFailure(err, 'No se pudo crear el grupo en Samba AD.');
    }

    const { searchEntries } = await client.search(dn, {
      scope: 'base',
      filter: '(objectClass=group)',
      attributes: GROUP_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
    });
    return mapGroupEntry(searchEntries[0]);
  });
}

async function updateGroup(dn, { descripcion } = {}) {
  return withServiceClient(async (client) => {
    try {
      if (descripcion !== undefined) {
        await client.modify(dn, replaceAttr('description', [String(descripcion || '')]));
      }

      const { searchEntries } = await client.search(dn, {
        scope: 'base',
        filter: '(objectClass=group)',
        attributes: GROUP_ATTRIBUTES,
      explicitBufferAttributes: ['objectSid'],
      });
      return mapGroupEntry(searchEntries[0]);
    } catch (err) {
      throw mapLdapFailure(err, 'No se pudo actualizar el grupo en Samba AD.');
    }
  });
}

async function deleteGroup(dn) {
  return withServiceClient(async (client) => {
    try {
      await client.del(dn);
    } catch (err) {
      if (Number(err.code) === 32) return false;
      throw mapLdapFailure(err, 'No se pudo eliminar el grupo en Samba AD.');
    }
    return true;
  });
}

async function addGroupMember(groupDn, userDn) {
  return withServiceClient(async (client) => {
    try {
      await client.modify(groupDn, [
        new Change({
          operation: 'add',
          modification: new Attribute({ type: 'member', values: [userDn] }),
        }),
      ]);
    } catch (err) {
      // 20 = attribute or value already exists; la operación es idempotente.
      if (Number(err.code) === 20) return true;
      throw mapLdapFailure(err, 'No se pudo agregar el estudiante al grupo.');
    }
    return true;
  });
}

async function removeGroupMember(groupDn, userDn) {
  return withServiceClient(async (client) => {
    try {
      await client.modify(groupDn, [
        new Change({
          operation: 'delete',
          modification: new Attribute({ type: 'member', values: [userDn] }),
        }),
      ]);
    } catch (err) {
      // 16 = no such attribute/value; 32 = no such object.
      if (Number(err.code) === 16 || Number(err.code) === 32) return true;
      throw mapLdapFailure(err, 'No se pudo remover el estudiante del grupo.');
    }
    return true;
  });
}

module.exports = {
  authenticate,
  findUserByUid,
  findUserByEmail,
  findUserByDn,
  createUser,
  updateUser,
  setUserEnabled,
  deleteUser,
  findGroupByCode,
  findGroupByDn,
  createGroup,
  updateGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  mapLdapFailure,
};
