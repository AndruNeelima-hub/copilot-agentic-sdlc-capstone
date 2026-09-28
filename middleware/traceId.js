const { randomUUID } = require('node:crypto');

const TRACE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function traceId(req, res, next) {
  const providedTraceId = req.get('X-Trace-Id');
  const requestTraceId = providedTraceId && TRACE_ID_PATTERN.test(providedTraceId)
    ? providedTraceId
    : randomUUID();

  req.traceId = requestTraceId;
  res.set('X-Trace-Id', requestTraceId);
  next();
}

module.exports = traceId;