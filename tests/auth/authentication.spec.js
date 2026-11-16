const jwt = require('jsonwebtoken');
const { test, expect, expectApiError, config } = require('../fixtures');
const { buildCustomer } = require('../../data');

test.describe('Authentication & Authorization', () => {
  test.describe('POST /auth/token', () => {
    test('agent receives a valid JWT access token', { tag: ['@smoke', '@auth'] }, async ({ anonymous }) => {
      const { username, password } = config.users.agent;
      const response = await anonymous.auth.requestToken({ username, password });

      expect(response).toHaveStatus(200);
      expect(response).toMatchSchema('token');
      expect(response.body).toMatchObject({ tokenType: 'Bearer', role: 'AGENT', expiresIn: config.auth.tokenTtlSeconds });

      const claims = jwt.decode(response.body.accessToken);
      expect(claims).toMatchObject({ sub: username, role: 'AGENT', iss: 'policyhub' });
      expect(claims.exp - claims.iat).toBe(config.auth.tokenTtlSeconds);
    });

    test('wrong password is rejected with 401', { tag: ['@negative', '@auth'] }, async ({ anonymous }) => {
      const response = await anonymous.auth.requestToken({ username: config.users.agent.username, password: 'wrong-password' });
      expectApiError(response, { status: 401, code: 'INVALID_CREDENTIALS' });
    });

    test('unknown user gets the same error as a wrong password (no user enumeration)',
      { tag: ['@negative', '@auth', '@security'] }, async ({ anonymous }) => {
        const wrongPassword = await anonymous.auth.requestToken({ username: config.users.agent.username, password: 'nope' });
        const unknownUser = await anonymous.auth.requestToken({ username: 'ghost.user', password: 'nope' });

        expectApiError(unknownUser, { status: 401, code: 'INVALID_CREDENTIALS' });
        expect(unknownUser.body.error.message).toBe(wrongPassword.body.error.message);
      });

    for (const missing of ['username', 'password']) {
      test(`missing ${missing} returns 400 validation error`, { tag: ['@negative', '@auth'] }, async ({ anonymous }) => {
        const credentials = { ...config.users.agent };
        delete credentials[missing];
        delete credentials.role;
        const response = await anonymous.auth.requestToken(credentials);
        expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: missing, issue: 'is required' });
      });
    }
  });

  test.describe('Protected endpoints', () => {
    test('request without a token returns 401 with WWW-Authenticate header',
      { tag: ['@negative', '@auth'] }, async ({ anonymous }) => {
        const response = await anonymous.customers.create(buildCustomer());
        expectApiError(response, { status: 401, code: 'UNAUTHORIZED' });
        expect(response.header('www-authenticate')).toContain('Bearer');
      });

    const invalidAuthHeaders = [
      { name: 'non-Bearer scheme', header: () => 'Basic YWdlbnQ6cGFzcw==' },
      { name: 'Bearer without a token', header: () => 'Bearer' },
      { name: 'garbage token', header: () => 'Bearer not.a.jwt' },
      {
        name: 'token signed with the wrong secret',
        header: () => `Bearer ${jwt.sign({ sub: 'agent.alice', role: 'AGENT' }, 'attacker-secret', { issuer: 'policyhub' })}`,
      },
      {
        name: 'token with a tampered payload (role escalation)',
        header: async (tokenManager) => {
          const [h, , s] = (await tokenManager.getToken('viewer')).split('.');
          const forged = Buffer.from(JSON.stringify({ sub: 'viewer.victor', role: 'AGENT', iss: 'policyhub' })).toString('base64url');
          return `Bearer ${h}.${forged}.${s}`;
        },
      },
    ];

    for (const { name, header } of invalidAuthHeaders) {
      test(`rejects ${name} with 401 INVALID_TOKEN`, { tag: ['@negative', '@auth', '@security'] },
        async ({ anonymous, tokenManager }) => {
          const response = await anonymous.customers.getById('cus_any', {
            headers: { Authorization: await header(tokenManager) },
          });
          expectApiError(response, { status: 401, code: 'INVALID_TOKEN' });
        });
    }

    test('expired token returns 401 TOKEN_EXPIRED', { tag: ['@negative', '@auth'] }, async ({ anonymous }) => {
      test.skip(config.testEnv !== 'local', 'Requires the signing secret, only available locally');
      const expired = jwt.sign(
        { sub: 'agent.alice', role: 'AGENT', exp: Math.floor(Date.now() / 1000) - 60 },
        config.auth.jwtSecret,
        { issuer: 'policyhub' },
      );
      const response = await anonymous.customers.getById('cus_any', { headers: { Authorization: `Bearer ${expired}` } });
      expectApiError(response, { status: 401, code: 'TOKEN_EXPIRED' });
    });
  });

  test.describe('Role-based access control', () => {
    test('VIEWER can read a customer', { tag: ['@auth'] }, async ({ viewer, workflow }) => {
      const customer = await workflow.createCustomer();
      const response = await viewer.customers.getById(customer.id);
      expect(response).toHaveStatus(200);
      expect(response.body.id).toBe(customer.id);
    });

    test('VIEWER cannot create customers, quotes or policies (403)', { tag: ['@negative', '@auth', '@security'] },
      async ({ viewer, workflow, db }) => {
        const { customer, quote } = await workflow.customerWithQuote();
        const payload = buildCustomer();

        const createCustomer = await viewer.customers.create(payload);
        const createQuote = await viewer.quotes.create({ customerId: customer.id, productCode: 'HOME', coverageAmount: 50000, termMonths: 12 });
        const purchase = await viewer.policies.purchase({ quoteId: quote.id, payment: { token: 'tok_test_visa' } });

        for (const response of [createCustomer, createQuote, purchase]) {
          expectApiError(response, { status: 403, code: 'FORBIDDEN' });
        }
        // Nothing was written
        expect(db.countCustomersByEmail(payload.email)).toBe(0);
        expect(db.getPoliciesForQuote(quote.id)).toHaveLength(0);
      });
  });
});
