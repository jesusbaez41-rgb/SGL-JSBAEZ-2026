/* Logger minimalista; se puede sustituir por pino/winston sin tocar el resto. */
function info(message, meta) {
  console.log(`[sgl][info] ${message}`, meta || '');
}

function warn(message, meta) {
  console.warn(`[sgl][warn] ${message}`, meta || '');
}

function error(message, meta) {
  console.error(`[sgl][error] ${message}`, meta || '');
}

module.exports = { info, warn, error };
