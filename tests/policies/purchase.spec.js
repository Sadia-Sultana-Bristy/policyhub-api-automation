const { test, expect, expectApiError, config } = require('../fixtures');
const { buildPurchase, PAYMENT_TOKENS } = require('../../data');
const { todayUtc, addMonths } = require('../../utils/dateUtils');
const { newIdempotencyKey } = require('../../utils/idempotency');

test.describe('Policy purchase (bind + payment)', () => {
  test('purchasing a valid quote issues an ACTIVE policy, captures payment and binds the quote',
    { tag: ['@smoke', '@db'] }, async ({ agent, workflow, db }) => {
      const { customer, quote } = await workflow.customerWithQuote({ quote: { termMonths: 12 } });

      const response = await agent.policies.purchase(buildPurchase(quote.id, PAYMENT_TOKENS.visa));

      // API contract
      expect(response).toHaveStatus(201);
      expect(response).toMatchSchema('policy');
      expect(response).toRespondWithin(config.responseTimeSlaMs);
      const policy = response.body;
      expect(policy).toMatchObject({
        quoteId: quote.id,
        customerId: customer.id,
        productCode: quote.productCode,
        coverageAmount: quote.coverageAmount,
        premium: quote.premium.totalPremium,
        status: 'ACTIVE',
        effectiveDate: todayUtc(),
        expiryDate: addMonths(todayUtc(), quote.termMonths),
        payment: { type: 'CHARGE', amount: quote.premium.totalPremium, status: 'SUCCEEDED', method: 'VISA' },
      });

      // Database: policy row
      expect(db.getPolicy(policy.id)).toMatchObject({
        policy_number: policy.policyNumber,
        quote_id: quote.id,
        customer_id: customer.id,
        premium: quote.premium.totalPremium,
        status: 'ACTIVE',
      });
      // Database: quote moved to BOUND
      expect(db.getQuote(quote.id).status).toBe('BOUND');
      // Database: exactly one successful charge, linked to the policy
      const payments = db.getPaymentsForQuote(quote.id);
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        id: policy.payment.id, policy_id: policy.id, type: 'CHARGE', status: 'SUCCEEDED', amount: quote.premium.totalPremium,
      });
    });

  test('MASTERCARD token is accepted and recorded as the payment method', { tag: ['@regression'] },
    async ({ agent, workflow }) => {
      const { quote } = await workflow.customerWithQuote();
      const response = await agent.policies.purchase(buildPurchase(quote.id, PAYMENT_TOKENS.mastercard));
      expect(response).toHaveStatus(201);
      expect(response.body.payment.method).toBe('MASTERCARD');
    });

  test.describe('Payment failures', () => {
    for (const [tokenName, reason] of [['declined', 'card_declined'], ['insufficientFunds', 'insufficient_funds']]) {
      test(`${reason}: returns 402, records FAILED payment, issues no policy`, { tag: ['@negative', '@db'] },
        async ({ agent, workflow, db }) => {
          const { quote } = await workflow.customerWithQuote();

          const response = await agent.policies.purchase(buildPurchase(quote.id, PAYMENT_TOKENS[tokenName]));

          expectApiError(response, { status: 402, code: 'PAYMENT_DECLINED', field: 'payment.token', issue: reason });
          expect(db.getPoliciesForQuote(quote.id)).toHaveLength(0);
          expect(db.getQuote(quote.id).status).toBe('QUOTED'); // still purchasable
          expect(db.getPaymentsForQuote(quote.id)).toEqual([
            expect.objectContaining({ type: 'CHARGE', status: 'FAILED', failure_code: reason, policy_id: null }),
          ]);
        });
    }

    test('customer can retry with a different card after a decline', { tag: ['@regression', '@db'] },
      async ({ agent, workflow, db }) => {
        const { quote } = await workflow.customerWithQuote();

        const declined = await agent.policies.purchase(buildPurchase(quote.id, PAYMENT_TOKENS.declined));
        expect(declined).toHaveStatus(402);

        const retry = await agent.policies.purchase(buildPurchase(quote.id, PAYMENT_TOKENS.visa));
        expect(retry).toHaveStatus(201);

        const payments = db.getPaymentsForQuote(quote.id);
        expect(payments.map((p) => p.status)).toEqual(['FAILED', 'SUCCEEDED']);
        expect(db.getPoliciesForQuote(quote.id)).toHaveLength(1);
      });

    test('unknown payment token returns 400 and nothing is charged', { tag: ['@negative', '@db'] },
      async ({ agent, workflow, db }) => {
        const { quote } = await workflow.customerWithQuote();
        const response = await agent.policies.purchase(buildPurchase(quote.id, PAYMENT_TOKENS.invalid));
        expectApiError(response, { status: 400, code: 'INVALID_PAYMENT_TOKEN', field: 'payment.token' });
        expect(db.getPaymentsForQuote(quote.id)).toHaveLength(0);
      });
  });

  test.describe('Idempotency & double-purchase protection', () => {
    test('retrying with the same Idempotency-Key replays the original response (no double charge)',
      { tag: ['@smoke', '@db', '@idempotency'] }, async ({ agent, workflow, db }) => {
        const { quote } = await workflow.customerWithQuote();
        const key = newIdempotencyKey();
        const payload = buildPurchase(quote.id);

        const first = await agent.policies.purchase(payload, { idempotencyKey: key });
        const replay = await agent.policies.purchase(payload, { idempotencyKey: key });

        expect(first).toHaveStatus(201);
        expect(replay).toHaveStatus(201);
        expect(replay.header('idempotent-replayed')).toBe('true');
        expect(replay.body).toEqual(first.body);

        expect(db.getPoliciesForQuote(quote.id)).toHaveLength(1);
        expect(db.getPaymentsForQuote(quote.id)).toHaveLength(1);
      });

    test('reusing an Idempotency-Key for a different quote returns 422', { tag: ['@negative', '@idempotency'] },
      async ({ agent, workflow, db }) => {
        const first = await workflow.customerWithQuote();
        const second = await workflow.customerWithQuote();
        const key = newIdempotencyKey();

        expect(await agent.policies.purchase(buildPurchase(first.quote.id), { idempotencyKey: key })).toHaveStatus(201);
        const reused = await agent.policies.purchase(buildPurchase(second.quote.id), { idempotencyKey: key });

        expectApiError(reused, { status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
        expect(db.getPoliciesForQuote(second.quote.id)).toHaveLength(0);
      });

    test('purchasing an already-bound quote with a new key returns 409', { tag: ['@negative', '@db'] },
      async ({ agent, workflow, db }) => {
        const { quote } = await workflow.activePolicy();

        const response = await agent.policies.purchase(buildPurchase(quote.id));

        expectApiError(response, { status: 409, code: 'QUOTE_ALREADY_BOUND' });
        expect(db.getPoliciesForQuote(quote.id)).toHaveLength(1);
        expect(db.getPaymentsForQuote(quote.id).filter((p) => p.status === 'SUCCEEDED')).toHaveLength(1);
      });

    test('concurrent purchase requests for one quote issue exactly one policy', { tag: ['@concurrency', '@db'] },
      async ({ agent, workflow, db }) => {
        const { quote } = await workflow.customerWithQuote();

        const responses = await Promise.all(
          Array.from({ length: 5 }, () => agent.policies.purchase(buildPurchase(quote.id))),
        );

        const statuses = responses.map((r) => r.status).sort();
        expect(statuses).toEqual([201, 409, 409, 409, 409]);
        expect(db.getPoliciesForQuote(quote.id)).toHaveLength(1);
        expect(db.getPaymentsForQuote(quote.id)).toHaveLength(1);
      });

    test('missing Idempotency-Key header returns 400', { tag: ['@negative', '@idempotency'] },
      async ({ agent, workflow }) => {
        const { quote } = await workflow.customerWithQuote();
        const response = await agent.policies.purchase(buildPurchase(quote.id), { idempotencyKey: null });
        expectApiError(response, { status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
      });

    for (const key of ['short', 'k'.repeat(65)]) {
      test(`Idempotency-Key of length ${key.length} is rejected`, { tag: ['@boundary', '@idempotency'] },
        async ({ agent, workflow }) => {
          const { quote } = await workflow.customerWithQuote();
          const response = await agent.policies.purchase(buildPurchase(quote.id), { idempotencyKey: key });
          expectApiError(response, { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
        });
    }
  });

  test.describe('Quote state rules', () => {
    test('expired quote cannot be purchased (422) and is marked EXPIRED', { tag: ['@negative', '@db'] },
      async ({ agent, workflow, db }) => {
        const { quote } = await workflow.customerWithQuote();
        db.expireQuote(quote.id); // test setup: simulate 30 days passing

        const response = await agent.policies.purchase(buildPurchase(quote.id));

        expectApiError(response, { status: 422, code: 'QUOTE_EXPIRED' });
        expect(db.getQuote(quote.id).status).toBe('EXPIRED');
        expect(db.getPaymentsForQuote(quote.id)).toHaveLength(0);

        const quoteView = await agent.quotes.getById(quote.id);
        expect(quoteView.body.status).toBe('EXPIRED');
      });

    test('unknown quote returns 404', { tag: ['@negative'] }, async ({ agent }) => {
      const response = await agent.policies.purchase(buildPurchase('quo_00000000000000000000'));
      expectApiError(response, { status: 404, code: 'QUOTE_NOT_FOUND' });
    });

    test('missing payment details return 400', { tag: ['@negative'] }, async ({ agent, workflow }) => {
      const { quote } = await workflow.customerWithQuote();
      const response = await agent.policies.purchase({ quoteId: quote.id });
      expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'payment.token' });
    });

    test('GET unknown policy returns 404', { tag: ['@negative'] }, async ({ agent }) => {
      const response = await agent.policies.getById('pol_00000000000000000000');
      expectApiError(response, { status: 404, code: 'POLICY_NOT_FOUND' });
    });
  });
});
