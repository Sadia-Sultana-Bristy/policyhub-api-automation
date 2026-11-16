const { BaseApiClient } = require('./BaseApiClient');

class QuoteClient extends BaseApiClient {
  /** POST /quotes — rate a product for a customer. */
  create(payload, options) {
    return this.post('/quotes', payload, options);
  }

  /** GET /quotes/:id */
  getById(quoteId, options) {
    return this.get(`/quotes/${quoteId}`, options);
  }
}

module.exports = { QuoteClient };
