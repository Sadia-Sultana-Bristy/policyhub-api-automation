const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { ApiError } = require('../utils/errors');

function authenticate(req, res, next) {
  const header = req.get('Authorization');
  if (!header) throw new ApiError(401, 'UNAUTHORIZED', 'Missing Authorization header');

  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'INVALID_TOKEN', 'Authorization header must use the Bearer scheme');
  }

  try {
    req.user = jwt.verify(token, config.auth.jwtSecret, { issuer: config.auth.issuer });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new ApiError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    throw new ApiError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new ApiError(403, 'FORBIDDEN', `Role ${req.user.role} is not allowed to perform this action`);
  }
  next();
};

module.exports = { authenticate, requireRole };
