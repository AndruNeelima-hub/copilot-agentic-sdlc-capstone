function audit(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
    const routePath = req.route ? `${req.baseUrl}${req.route.path}` : req.path;
    const auditRecord = {
      timestamp: new Date().toISOString(),
      traceId: req.traceId || null,
      method: req.method,
      route: routePath,
      statusCode: res.statusCode,
      durationMs: Number(elapsedNanoseconds) / 1e6,
      userId: req.userId || null
    };

    req.app.emit('audit', auditRecord);

    if (process.env.NODE_ENV !== 'test' && process.env.AUDIT_LOGS !== 'false') {
      console.log(JSON.stringify(auditRecord));
    }
  });

  next();
}

module.exports = audit;