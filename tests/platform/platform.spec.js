const { test, expect, expectApiError } = require('../fixtures');

test.describe('Platform / cross-cutting behaviour', () => {
  test('health endpoint reports UP', { tag: ['@smoke'] }, async ({ apiContext }) => {
    const response = await apiContext.get('/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'UP', service: 'policyhub-api' });
  });

  test('every response carries a correlation id and echoes a caller-supplied one', { tag: ['@regression'] },
    async ({ agent }) => {
      const generated = await agent.customers.getById('cus_missing');
      expect(generated.header('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);

      const supplied = await agent.customers.getById('cus_missing', { headers: { 'X-Request-Id': 'trace-qa-12345' } });
      expect(supplied.header('x-request-id')).toBe('trace-qa-12345');
      expect(supplied.body.requestId).toBe('trace-qa-12345');
    });

  test('unknown route returns 404 in the standard error format', { tag: ['@negative'] }, async ({ agent }) => {
    const response = await agent.customers.get('/does-not-exist');
    expectApiError(response, { status: 404, code: 'NOT_FOUND' });
  });

  test('responses do not leak server technology headers', { tag: ['@security'] }, async ({ agent }) => {
    const response = await agent.customers.getById('cus_missing');
    expect(response.header('x-powered-by')).toBeUndefined();
    expect(response.header('content-type')).toContain('application/json');
  });
});
