const { BaseApiClient } = require('./BaseApiClient');

class CustomerClient extends BaseApiClient {
  /** POST /customers */
  create(payload, options) {
    return this.post('/customers', payload, options);
  }

  /** GET /customers/:id */
  getById(customerId, options) {
    return this.get(`/customers/${customerId}`, options);
  }

  /** GET /customers/:id/policies */
  listPolicies(customerId, options) {
    return this.get(`/customers/${customerId}/policies`, options);
  }
}

module.exports = { CustomerClient };
