const { expect } = require('../../utils/assertions');
const { buildCustomer, buildQuote, buildPurchase } = require('../../data');

/**
 * Business-flow helper for request chaining.
 * Each step feeds the next (customer.id → quote.id → policy.id), so tests that only need
 * a precondition (for example "an active policy") can set it up in one line.
 */
class PolicyWorkflow {
  /** @param {ReturnType<import('../index').createApiClients>} api */
  constructor(api) {
    this.api = api;
  }

  async createCustomer(overrides = {}) {
    const response = await this.api.customers.create(buildCustomer(overrides));
    expect(response, 'precondition: create customer').toHaveStatus(201);
    return response.body;
  }

  async createQuote(customerId, overrides = {}) {
    const response = await this.api.quotes.create(buildQuote(customerId, overrides));
    expect(response, 'precondition: create quote').toHaveStatus(201);
    return response.body;
  }

  async purchasePolicy(quoteId, token) {
    const response = await this.api.policies.purchase(buildPurchase(quoteId, token));
    expect(response, 'precondition: purchase policy').toHaveStatus(201);
    return response.body;
  }

  /** Customer → Quote (ready to purchase). */
  async customerWithQuote({ customer = {}, quote = {} } = {}) {
    const c = await this.createCustomer(customer);
    const q = await this.createQuote(c.id, quote);
    return { customer: c, quote: q };
  }

  /** Customer → Quote → Policy (active). */
  async activePolicy(options = {}) {
    const { customer, quote } = await this.customerWithQuote(options);
    const policy = await this.purchasePolicy(quote.id, options.paymentToken);
    return { customer, quote, policy };
  }
}

module.exports = { PolicyWorkflow };
