/**
 * PolicyHub mock backend — the system under test.
 * A realistic insurance REST API backed by SQLite, so the framework can run
 * end-to-end (API + database validation) locally and in CI with zero external dependencies.
 */
const config = require('../config/env');
const { openDatabase } = require('./db/database');
const { createApp } = require('./app');

const db = openDatabase({ reset: config.server.resetDbOnStart });
const app = createApp(db);

const server = app.listen(config.server.port, () => {
  console.log(`PolicyHub API listening on http://localhost:${config.server.port}${config.apiPrefix}`);
  console.log(`Database: ${config.db.path}`);
});

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
