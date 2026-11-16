const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { verifyPassword } = require('../db/database');
const { ApiError, validationError } = require('../utils/errors');

module.exports = function authRoutes(db) {
  const router = express.Router();

  router.post('/token', (req, res) => {
    const { username, password } = req.body ?? {};
    const details = [];
    if (typeof username !== 'string' || !username.trim()) details.push({ field: 'username', issue: 'is required' });
    if (typeof password !== 'string' || !password) details.push({ field: 'password', issue: 'is required' });
    if (details.length) throw validationError(details);

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    // Same error for unknown user and wrong password: prevents user enumeration.
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect');
    }

    const expiresIn = config.auth.tokenTtlSeconds;
    const accessToken = jwt.sign({ sub: user.username, role: user.role }, config.auth.jwtSecret, {
      expiresIn,
      issuer: config.auth.issuer,
    });
    res.json({ accessToken, tokenType: 'Bearer', expiresIn, role: user.role });
  });

  return router;
};
