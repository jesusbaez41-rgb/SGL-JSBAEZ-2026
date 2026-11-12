/**
 * Rutas de almacenamiento de instaladores (HU-COM-07).
 *
 * Se leen en cada llamada para respetar la configuracion vigente sin
 * depender del ciclo de carga de los modulos.
 */
const env = require('../../config/env');

/**
 * Directorio base donde se guardan y se resuelven los instaladores.
 */
function installersDir() {
  return process.env.APPS_INSTALLERS_DIR || env.appsInstallersDir;
}

module.exports = { installersDir };
