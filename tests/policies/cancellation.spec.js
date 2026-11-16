const { test, expect, expectApiError } = require('../fixtures');
const { buildCancellation, CANCELLATION_REASONS } = require('../../data');
const { expectedRefund } = require('../../utils/premiumCalculator');
const { daysBetween } = require('../../utils/dateUtils');

test.describe('Policy cancellation & refunds', () => {
  test('same-day cancellation refunds the full premium', { tag: ['@smoke', '@db'] },
    async ({ agent, workflow, db }) => {
      const { policy } = await workflow.activePolicy();

      const response = await agent.policies.cancel(policy.id, buildCancellation('CUSTOMER_REQUEST'));

      expect(response).toHaveStatus(200);
      expect(response).toMatchSchema('policy');
      expect(response.body.status).toBe('CANCELLED');
      expect(response.body.cancellation).toMatchObject({
        reason: 'CUSTOMER_REQUEST',
        refund: { type: 'REFUND', amount: policy.premium, status: 'SUCCEEDED' },
      });

      expect(db.getPolicy(policy.id)).toMatchObject({
        status: 'CANCELLED', cancellation_reason: 'CUSTOMER_REQUEST', refund_amount: policy.premium,
      });
      const refunds = db.getPaymentsForQuote(policy.quoteId).filter((p) => p.type === 'REFUND');
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ amount: policy.premium, policy_id: policy.id });
    });

  test('mid-term cancellation refunds unused days pro-rata', { tag: ['@db', '@pricing'] },
    async ({ agent, workflow, db }) => {
      const { policy } = await workflow.activePolicy({ quote: { termMonths: 12 } });
      db.backdatePolicy(policy.id, 100); // test setup: policy started 100 days ago

      const row = db.getPolicy(policy.id);
      const totalDays = daysBetween(row.effective_date, row.expiry_date);
      const expected = expectedRefund({ premium: policy.premium, totalDays, usedDays: 100 });

      const response = await agent.policies.cancel(policy.id, buildCancellation('OTHER'));

      expect(response).toHaveStatus(200);
      expect(response.body.cancellation.refund.amount).toBe(expected);
      expect(expected).toBeLessThan(policy.premium);
      expect(db.getPolicy(policy.id).refund_amount).toBe(expected);
    });

  for (const reason of CANCELLATION_REASONS) {
    test(`accepts cancellation reason ${reason}`, { tag: ['@regression'] }, async ({ agent, workflow }) => {
      const { policy } = await workflow.activePolicy();
      const response = await agent.policies.cancel(policy.id, buildCancellation(reason));
      expect(response).toHaveStatus(200);
      expect(response.body.cancellation.reason).toBe(reason);
    });
  }

  test('cancelling twice returns 409 and refunds only once', { tag: ['@negative', '@db'] },
    async ({ agent, workflow, db }) => {
      const { policy } = await workflow.activePolicy();
      expect(await agent.policies.cancel(policy.id, buildCancellation())).toHaveStatus(200);

      const second = await agent.policies.cancel(policy.id, buildCancellation());

      expectApiError(second, { status: 409, code: 'POLICY_ALREADY_CANCELLED' });
      expect(db.getPaymentsForQuote(policy.quoteId).filter((p) => p.type === 'REFUND')).toHaveLength(1);
    });

  for (const body of [{}, { reason: 'CHANGED_MIND' }, { reason: 'customer_request' }]) {
    test(`invalid cancellation body ${JSON.stringify(body)} returns 400`, { tag: ['@negative'] },
      async ({ agent, workflow, db }) => {
        const { policy } = await workflow.activePolicy();
        const response = await agent.policies.cancel(policy.id, body);
        expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'reason' });
        expect(db.getPolicy(policy.id).status).toBe('ACTIVE');
      });
  }

  test('cancelling an unknown policy returns 404', { tag: ['@negative'] }, async ({ agent }) => {
    const response = await agent.policies.cancel('pol_00000000000000000000', buildCancellation());
    expectApiError(response, { status: 404, code: 'POLICY_NOT_FOUND' });
  });

  test('VIEWER cannot cancel a policy', { tag: ['@negative', '@auth'] }, async ({ viewer, workflow, db }) => {
    const { policy } = await workflow.activePolicy();
    const response = await viewer.policies.cancel(policy.id, buildCancellation());
    expectApiError(response, { status: 403, code: 'FORBIDDEN' });
    expect(db.getPolicy(policy.id).status).toBe('ACTIVE');
  });
});
