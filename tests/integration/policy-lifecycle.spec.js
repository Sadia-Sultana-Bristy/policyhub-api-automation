/**
 * End-to-end integration test of the core business process:
 *   Authenticate → Create customer → Generate quote → Purchase policy → Retrieve → Cancel → Verify DB
 * Each step uses the output of the previous one (request chaining).
 */
const jwt = require('jsonwebtoken');
const { test, expect, config } = require('../fixtures');
const { buildCustomer, buildQuote, buildPurchase, buildCancellation, PAYMENT_TOKENS } = require('../../data');
const { createApiClients } = require('../../api');
const { expectedPremium } = require('../../utils/premiumCalculator');

test.describe('Policy lifecycle — end-to-end integration', () => {
  test('customer onboarding → quote → purchase → cancellation, verified across all tables',
    { tag: ['@smoke', '@e2e', '@db'] }, async ({ apiContext, anonymous, db }) => {
      const agentUser = config.users.agent.username;
      let api;
      let customer;
      let quote;
      let policy;

      await test.step('1. Authenticate as an insurance agent', async () => {
        const response = await anonymous.auth.requestToken({
          username: config.users.agent.username, password: config.users.agent.password,
        });
        expect(response).toHaveStatus(200);
        expect(jwt.decode(response.body.accessToken).role).toBe('AGENT');
        api = createApiClients(apiContext, response.body.accessToken);
      });

      await test.step('2. Create customer', async () => {
        const response = await api.customers.create(buildCustomer({ age: 30, country: 'TH' }));
        expect(response).toHaveStatus(201);
        customer = response.body;
      });

      await test.step('3. Generate HOME insurance quote', async () => {
        const payload = buildQuote(customer.id, { productCode: 'HOME', coverageAmount: 750000, termMonths: 24 });
        const response = await api.quotes.create(payload);
        expect(response).toHaveStatus(201);
        expect(response.body.premium).toEqual(expectedPremium({ ...payload, age: 30 }));
        quote = response.body;
      });

      await test.step('4. Purchase policy with card payment', async () => {
        const response = await api.policies.purchase(buildPurchase(quote.id, PAYMENT_TOKENS.visa));
        expect(response).toHaveStatus(201);
        expect(response.body.premium).toBe(quote.premium.totalPremium);
        policy = response.body;
      });

      await test.step('5. Retrieve policy and customer portfolio', async () => {
        const policyView = await api.policies.getById(policy.id);
        expect(policyView).toHaveStatus(200);
        expect(policyView.body).toEqual(policy);

        const portfolio = await api.customers.listPolicies(customer.id);
        expect(portfolio).toHaveStatus(200);
        expect(portfolio).toMatchSchema('policy-list');
        expect(portfolio.body.total).toBe(1);
        expect(portfolio.body.data[0].policyNumber).toBe(policy.policyNumber);

        const quoteView = await api.quotes.getById(quote.id);
        expect(quoteView.body.status).toBe('BOUND');
      });

      await test.step('6. Cancel policy at customer request', async () => {
        const response = await api.policies.cancel(policy.id, buildCancellation('CUSTOMER_REQUEST'));
        expect(response).toHaveStatus(200);
        expect(response.body.status).toBe('CANCELLED');
        policy = response.body;
      });

      await test.step('7. Verify database state across customers, quotes, policies and payments', async () => {
        expect(db.getPolicyLifecycle(policy.id)).toEqual({
          customer_email: customer.email,
          quote_status: 'BOUND',
          quoted_premium: quote.premium.totalPremium,
          policy_number: policy.policyNumber,
          policy_status: 'CANCELLED',
          policy_premium: quote.premium.totalPremium,
          refund_amount: quote.premium.totalPremium,
          total_charged: quote.premium.totalPremium,
          total_refunded: quote.premium.totalPremium,
          payment_count: 2,
        });
      });

      await test.step('8. Verify audit trail records every business event in order', async () => {
        const trail = db.getAuditTrail(customer.id, quote.id, policy.id, policy.payment.id, policy.cancellation.refund.id);
        expect(trail.map((e) => e.action)).toEqual([
          'CUSTOMER_CREATED', 'QUOTE_CREATED', 'PAYMENT_CAPTURED', 'POLICY_ISSUED', 'POLICY_CANCELLED', 'REFUND_ISSUED',
        ]);
        expect(new Set(trail.map((e) => e.actor))).toEqual(new Set([agentUser]));
      });
    });

  test('customer with AUTO and HOME policies — portfolio and totals are consistent', { tag: ['@e2e', '@db'] },
    async ({ agent, workflow, db }) => {
      const customer = await workflow.createCustomer({ age: 45 });
      const autoQuote = await workflow.createQuote(customer.id, { productCode: 'AUTO', coverageAmount: 80000, termMonths: 6 });
      const homeQuote = await workflow.createQuote(customer.id, { productCode: 'HOME', coverageAmount: 500000, termMonths: 12 });
      await workflow.purchasePolicy(autoQuote.id, PAYMENT_TOKENS.visa);
      await workflow.purchasePolicy(homeQuote.id, PAYMENT_TOKENS.mastercard);

      const portfolio = await agent.customers.listPolicies(customer.id);

      expect(portfolio).toHaveStatus(200);
      expect(portfolio).toMatchSchema('policy-list');
      expect(portfolio.body.data.map((p) => p.productCode).sort()).toEqual(['AUTO', 'HOME']);

      const apiTotal = portfolio.body.data.reduce((sum, p) => sum + p.premium, 0);
      const dbTotal = db.getPoliciesForCustomer(customer.id).reduce((sum, p) => sum + p.premium, 0);
      expect(dbTotal).toBeCloseTo(apiTotal, 2);
      expect(apiTotal).toBeCloseTo(autoQuote.premium.totalPremium + homeQuote.premium.totalPremium, 2);
    });

  test('database integrity: no quote has multiple policies and every policy has exactly one charge',
    { tag: ['@db', '@integrity'] }, async ({ workflow, db }) => {
      await workflow.activePolicy(); // ensure at least one policy exists
      expect(db.findQuotesWithMultiplePolicies()).toEqual([]);
      expect(db.findPoliciesWithoutExactlyOneCharge()).toEqual([]);
    });
});
