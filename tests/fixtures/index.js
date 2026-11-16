/**
 * Custom Playwright fixtures — the backbone of the framework.
 *
 *   apiContext   (worker) one APIRequestContext per worker
 *   tokenManager (worker) logs in once per role per worker, caches and refreshes tokens
 *   db           (worker) database connection for backend validation
 *   agent        (test)   API clients authenticated as an AGENT (read/write)
 *   viewer       (test)   API clients authenticated as a VIEWER (read-only)
 *   anonymous    (test)   API clients with no token
 *   workflow     (test)   business-flow helpers for request chaining
 */
const base = require('@playwright/test');
const config = require('../../config/env');
const { createApiClients } = require('../../api');
const { PolicyWorkflow } = require('../../api/workflows/PolicyWorkflow');
const { TokenManager } = require('../../utils/tokenManager');
const { PolicyHubDb } = require('../../database/PolicyHubDb');
const { expect, expectApiError } = require('../../utils/assertions');

const test = base.test.extend({
  apiContext: [
    async ({ playwright }, use) => {
      const context = await playwright.request.newContext({ baseURL: config.baseURL });
      await use(context);
      await context.dispose();
    },
    { scope: 'worker' },
  ],

  tokenManager: [async ({ apiContext }, use) => use(new TokenManager(apiContext)), { scope: 'worker' }],

  db: [
    async ({}, use) => {
      const db = new PolicyHubDb();
      await use(db);
      db.close();
    },
    { scope: 'worker' },
  ],

  agent: async ({ apiContext, tokenManager }, use) => {
    await use(createApiClients(apiContext, await tokenManager.getToken('agent')));
  },

  viewer: async ({ apiContext, tokenManager }, use) => {
    await use(createApiClients(apiContext, await tokenManager.getToken('viewer')));
  },

  anonymous: async ({ apiContext }, use) => {
    await use(createApiClients(apiContext, null));
  },

  workflow: async ({ agent }, use) => {
    await use(new PolicyWorkflow(agent));
  },
});

module.exports = { test, expect, expectApiError, config };
