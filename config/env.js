/**
 * Central configuration — the single source of truth for every environment value.
 * Values come from environment variables (or a local .env file) with safe local defaults,
 * so the suite runs out-of-the-box locally and is fully configurable in CI.
 */
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

const num = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));
const bool = (value, fallback) => (value === undefined || value === '' ? fallback : value === 'true');

const config = {
  rootDir: ROOT_DIR,
  testEnv: process.env.TEST_ENV || 'local',

  // API under test
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  responseTimeSlaMs: num(process.env.RESPONSE_TIME_SLA_MS, 1000),

  // Mock server (system under test for local + CI runs)
  server: {
    port: num(process.env.PORT, 3000),
    resetDbOnStart: bool(process.env.RESET_DB_ON_START, true),
    startLocalServer: bool(process.env.START_LOCAL_SERVER, true),
  },

  // Authentication
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'local-dev-secret-change-me',
    tokenTtlSeconds: num(process.env.TOKEN_TTL_SECONDS, 900),
    issuer: 'policyhub',
  },

  users: {
    agent: {
      username: process.env.AGENT_USERNAME || 'agent.alice',
      password: process.env.AGENT_PASSWORD || 'Agent@12345',
      role: 'AGENT',
    },
    viewer: {
      username: process.env.VIEWER_USERNAME || 'viewer.victor',
      password: process.env.VIEWER_PASSWORD || 'Viewer@12345',
      role: 'VIEWER',
    },
  },

  // Database used for backend validation
  db: {
    path: path.resolve(ROOT_DIR, process.env.DB_PATH || 'database/policyhub.db'),
  },

  business: {
    quoteValidityDays: num(process.env.QUOTE_VALIDITY_DAYS, 30),
  },
};

module.exports = config;
