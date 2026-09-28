const ERROR_CODES = new Set([
  'INVALID_UUID',
  'INVALID_STATUS',
  'INVALID_DATE',
  'INVALID_PAGINATION',
  'INVALID_SORT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'USER_NOT_FOUND',
  'INTERNAL_ERROR'
]);

class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const isKnownAppError = err instanceof AppError && ERROR_CODES.has(err.code);
  const statusCode = isKnownAppError ? err.statusCode : 500;
  const code = isKnownAppError ? err.code : 'INTERNAL_ERROR';
  const message = isKnownAppError ? err.message : 'An unexpected error occurred';

  res.status(statusCode).json({
    error: {
      code,
      message,
      traceId: req.traceId || null
    }
  });
}

module.exports = { AppError, errorHandler };