const { listAuthEvents, listAuditLogs } = require('./audit.service');
const { validateList, parseList } = require('./audit.validators');

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function logs(req, res, next) {
  try {
    const errors = validateList(req.query);
    if (errors.length) {
      throw httpError(400, errors.join(' '), 'AUDIT_FILTRO_INVALIDO');
    }
    res.json(await listAuditLogs(parseList(req.query)));
  } catch (err) {
    next(err);
  }
}

async function events(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const data = await listAuthEvents({ limit, offset });
    res.json({ data, limit, offset });
  } catch (err) {
    next(err);
  }
}

module.exports = { logs, events };
