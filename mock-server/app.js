const express = require('express');
const crypto = require('crypto');
const config = require('../config/env');
const { authenticate } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./utils/errors');

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');

  // Correlation id on every response (echoes the caller's X-Request-Id if provided).
  app.use((req, res, next) => {
    req.id = req.get('X-Request-Id') || crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => res.json({ status: 'UP', service: 'policyhub-api' }));

  const api = express.Router();
  api.use('/auth', require('./routes/auth')(db));
  api.use(authenticate);
  api.use(require('./routes/customers')(db));
  api.use(require('./routes/quotes')(db));
  api.use(require('./routes/policies')(db));

  app.use(config.apiPrefix, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
