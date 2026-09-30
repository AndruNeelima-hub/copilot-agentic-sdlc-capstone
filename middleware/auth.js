const jwt = require('jsonwebtoken');
const { z } = require('zod');
const config = require('../config');
const { createAppError } = require('./errorHandler');

const subjectSchema = z.string().uuid();

function auth(req, res, next) {
  const authorization = req.get('Authorization');
  const bearerMatch = authorization && authorization.match(/^Bearer\s+(\S+)$/i);

  if (!bearerMatch) {
    next(createAppError(401, 'UNAUTHORIZED', 'Authentication is required'));
    return;
  }

  try {
    const claims = jwt.verify(bearerMatch[1], config.jwtSecret, {
      algorithms: ['HS256']
    });

    if (
      !claims ||
      typeof claims !== 'object' ||
      !subjectSchema.safeParse(claims.sub).success ||
      typeof claims.exp !== 'number' ||
      !Number.isFinite(claims.exp)
    ) {
      throw new Error('Required JWT claims are missing');
    }

    req.userId = claims.sub;
    next();
  } catch (_error) {
    next(createAppError(401, 'UNAUTHORIZED', 'Authentication is required'));
  }
}

module.exports = auth;