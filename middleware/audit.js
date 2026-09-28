function audit(req, res, next) {
  const requestUrl = new URL(req.originalUrl, 'http://localhost');
  const requestPath = requestUrl.pathname;
  const requestedUserMatch = requestPath.match(/^\/api\/v1\/users\/([^/]+)(?:\/|$)/);

  if (
    requestPath === '/api-docs' ||
    requestPath.startsWith('/api-docs/') ||
    requestPath === '/api-docs.json' ||
    /(?:^|\/)favicon(?:\.[^/]*)?$/i.test(requestPath)
  ) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
    const routePath = req.route
      ? `${requestPath.startsWith('/api/v1/') ? '/api/v1' : req.baseUrl}${req.route.path}`
      : requestPath;
    let requestedUserId = null;
    if (requestedUserMatch) {
      try {
        requestedUserId = decodeURIComponent(requestedUserMatch[1]);
      } catch (_error) {
        requestedUserId = requestedUserMatch[1];
      }
    }
    const auditRecord = {
      timestamp: new Date().toISOString(),
      traceId: req.traceId || null,
      method: req.method,
      route: routePath,
      requestedUserId,
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