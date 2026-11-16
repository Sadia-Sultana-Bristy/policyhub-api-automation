const { BaseApiClient } = require('./BaseApiClient');
const { newIdempotencyKey } = require('../../utils/idempotency');

class PolicyClient extends BaseApiClient {
  /**
   * POST /policies — bind a quote and charge the customer.
   * A fresh Idempotency-Key is generated unless one is supplied (pass null to omit the header).
   */
  purchase(payload, { idempotencyKey = newIdempotencyKey(), headers = {} } = {}) {
    const extra = { ...headers };
    if (idempotencyKey !== null) extra['Idempotency-Key'] = idempotencyKey;
    return this.post('/policies', payload, { headers: extra });
  }

  /** GET /policies/:id */
  getById(policyId, options) {
    return this.get(`/policies/${policyId}`, options);
  }

  /** POST /policies/:id/cancel */
  cancel(policyId, payload, options) {
    return this.post(`/policies/${policyId}/cancel`, payload, options);
  }
}

module.exports = { PolicyClient };
