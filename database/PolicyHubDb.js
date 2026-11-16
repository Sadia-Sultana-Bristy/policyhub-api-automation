const { DbClient } = require('./DbClient');
const Q = require('./queries');

/** Domain-level database access for tests (repository pattern over DbClient). */
class PolicyHubDb extends DbClient {
  getCustomer(id) { return this.one(Q.customerById, id); }

  countCustomersByEmail(email) { return this.scalar(Q.customerCountByEmail, email); }

  getQuote(id) { return this.one(Q.quoteById, id); }

  getPolicy(id) { return this.one(Q.policyById, id); }

  getPoliciesForQuote(quoteId) { return this.query(Q.policiesByQuote, quoteId); }

  getPoliciesForCustomer(customerId) { return this.query(Q.policiesByCustomer, customerId); }

  getPaymentsForQuote(quoteId) { return this.query(Q.paymentsByQuote, quoteId); }

  getAuditTrail(...entityIds) {
    return this.query(Q.auditTrailForEntities(entityIds.length), entityIds);
  }

  getPolicyLifecycle(policyId) { return this.one(Q.policyLifecycle, policyId); }

  findQuotesWithMultiplePolicies() { return this.query(Q.quotesWithMultiplePolicies); }

  findPoliciesWithoutExactlyOneCharge() { return this.query(Q.policiesWithoutExactlyOneCharge); }

  /** Test setup: move a quote's expiry into the past. */
  expireQuote(quoteId) { return this.execute(Q.expireQuote, quoteId); }

  /** Test setup: shift a policy's term back by N days (simulates time passing). */
  backdatePolicy(policyId, days) {
    const shift = `-${days} days`;
    return this.execute(Q.backdatePolicy, [shift, shift, policyId]);
  }
}

module.exports = { PolicyHubDb };
