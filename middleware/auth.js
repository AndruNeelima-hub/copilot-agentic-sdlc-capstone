const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./errorHandler');

function auth(req, res, next) {
  const authorization = req.get('Authorization');
  const bearerMatch = authorization && authorization.match(/^Bearer\s+(\S+)$/i);

  if (!bearerMatch) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required'));
    return;
  }

  try {
    const claims = jwt.verify(bearerMatch[1], config.jwtSecret, {
      algorithms: ['HS256']
    });

    if (
      !claims ||
      typeof claims !== 'object' ||
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0 ||
      typeof claims.exp !== 'number' ||
      !Number.isFinite(claims.exp)
    ) {
      throw new Error('Required JWT claims are missing');
    }

    req.userId = claims.sub;
    next();
  } catch (_error) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required'));
  }
}

module.exports = auth;