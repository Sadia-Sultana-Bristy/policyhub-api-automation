const config = require('../config/env');
const { AuthClient } = require('../api/clients/AuthClient');

/**
 * Fetches and caches access tokens per role (one login per worker, not per test).
 * Refreshes a token automatically 30 seconds before it expires.
 */
class TokenManager {
  /** @param {import('@playwright/test').APIRequestContext} request */
  constructor(request) {
    this.auth = new AuthClient(request);
    this.cache = new Map();
  }

  async getToken(role = 'agent') {
    const cached = this.cache.get(role);
    if (cached && cached.expiresAt - 30_000 > Date.now()) return cached.token;

    const user = config.users[role];
    if (!user) throw new Error(`No credentials configured for role "${role}"`);

    const response = await this.auth.requestToken({ username: user.username, password: user.password });
    if (response.status !== 200) {
      throw new Error(`Authentication failed for role "${role}":\n${response.describe()}`);
    }
    const { accessToken, expiresIn } = response.body;
    this.cache.set(role, { token: accessToken, expiresAt: Date.now() + expiresIn * 1000 });
    return accessToken;
  }
}

module.exports = { TokenManager };
