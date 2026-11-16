const { BaseApiClient } = require('./BaseApiClient');

class AuthClient extends BaseApiClient {
  /** POST /auth/token — exchange credentials for a JWT access token. */
  requestToken(credentials, options) {
    return this.post('/auth/token', credentials, options);
  }
}

module.exports = { AuthClient };
