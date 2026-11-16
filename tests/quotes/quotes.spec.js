const { test, expect, expectApiError, config } = require('../fixtures');
const { buildQuote, PRODUCTS, TERMS, BOUNDARIES } = require('../../data');
const { expectedPremium } = require('../../utils/premiumCalculator');
const rules = require('../../data/pricing-rules.json');

test.describe('Quotes API', () => {
  test.describe('POST /quotes — positive', () => {
    test('generates a quote with correct premium and persists it', { tag: ['@smoke', '@db'] },
      async ({ agent, workflow, db }) => {
        const customer = await workflow.createCustomer({ age: 40 });
        const payload = buildQuote(customer.id, { productCode: 'AUTO', coverageAmount: 300000, termMonths: 12 });

        const before = Date.now();
        const response = await agent.quotes.create(payload);

        expect(response).toHaveStatus(201);
        expect(response).toMatchSchema('quote');
        expect(response).toRespondWithin(config.responseTimeSlaMs);
        expect(response.body).toMatchObject({ customerId: customer.id, productCode: 'AUTO', status: 'QUOTED' });

        // Business rule: premium matches the rating oracle
        const expected = expectedPremium({ ...payload, age: 40 });
        expect(response.body.premium).toEqual(expected);

        // Business rule: quote is valid for N days
        const validityMs = Date.parse(response.body.expiresAt) - Date.parse(response.body.createdAt);
        expect(validityMs).toBe(rules.quoteValidityDays * 24 * 60 * 60 * 1000);
        expect(Date.parse(response.body.createdAt)).toBeGreaterThanOrEqual(before - 1000);

        // Database validation
        expect(db.getQuote(response.body.id)).toMatchObject({
          customer_id: customer.id,
          product_code: 'AUTO',
          coverage_amount: 300000,
          term_months: 12,
          total_premium: expected.totalPremium,
          status: 'QUOTED',
          expires_at: response.body.expiresAt,
        });
      });

    // Pricing matrix: products × age bands (both edges of each band)
    const ages = [18, 24, 25, 64, 65, 75];
    for (const productCode of PRODUCTS) {
      for (const age of ages) {
        test(`premium for ${productCode}, age ${age} matches rating rules`, { tag: ['@pricing'] },
          async ({ agent, workflow }) => {
            const customer = await workflow.createCustomer({ age });
            const payload = buildQuote(customer.id, { productCode, coverageAmount: 125000 });
            const response = await agent.quotes.create(payload);

            expect(response).toHaveStatus(201);
            expect(response.body.premium).toEqual(expectedPremium({ ...payload, age }));
          });
      }
    }

    for (const termMonths of TERMS) {
      test(`term of ${termMonths} months applies factor ${rules.termFactors[termMonths]}`, { tag: ['@pricing'] },
        async ({ agent, workflow }) => {
          const customer = await workflow.createCustomer();
          const payload = buildQuote(customer.id, { productCode: 'HOME', coverageAmount: 400000, termMonths });
          const response = await agent.quotes.create(payload);

          expect(response).toHaveStatus(201);
          expect(response.body.premium.termFactor).toBe(rules.termFactors[termMonths]);
          expect(response.body.premium.totalPremium).toBe(expectedPremium({ ...payload, age: 35 }).totalPremium);
        });
    }

    test('GET /quotes/:id returns the same quote', { tag: ['@regression'] }, async ({ agent, workflow }) => {
      const { quote } = await workflow.customerWithQuote();
      const response = await agent.quotes.getById(quote.id);
      expect(response).toHaveStatus(200);
      expect(response.body).toEqual(quote);
    });
  });

  test.describe('POST /quotes — boundary values', () => {
    for (const { value, valid } of BOUNDARIES.coverageAmount) {
      test(`coverageAmount ${value} → ${valid ? 'accepted' : 'rejected'}`, { tag: ['@boundary'] },
        async ({ agent, workflow }) => {
          const customer = await workflow.createCustomer();
          const response = await agent.quotes.create(buildQuote(customer.id, { coverageAmount: value }));
          if (valid) {
            expect(response).toHaveStatus(201);
            expect(response.body.coverageAmount).toBe(value);
          } else {
            expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'coverageAmount', issue: /between 10000 and 1000000/ });
          }
        });
    }
  });

  test.describe('POST /quotes — negative', () => {
    const invalidPayloads = [
      { name: 'unsupported product', patch: { productCode: 'PET' }, field: 'productCode' },
      { name: 'lowercase product code', patch: { productCode: 'auto' }, field: 'productCode' },
      { name: 'coverage as string', patch: { coverageAmount: '250000' }, field: 'coverageAmount' },
      { name: 'negative coverage', patch: { coverageAmount: -1 }, field: 'coverageAmount' },
      { name: 'unsupported term (3 months)', patch: { termMonths: 3 }, field: 'termMonths' },
      { name: 'unsupported term (36 months)', patch: { termMonths: 36 }, field: 'termMonths' },
      { name: 'term as string', patch: { termMonths: '12' }, field: 'termMonths' },
      { name: 'missing customerId', patch: { customerId: undefined }, field: 'customerId' },
    ];

    for (const { name, patch, field } of invalidPayloads) {
      test(`${name} returns 400`, { tag: ['@negative'] }, async ({ agent }) => {
        const response = await agent.quotes.create(buildQuote('cus_00000000000000000000', patch));
        expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field });
      });
    }

    test('unknown customer returns 404 and no quote is created', { tag: ['@negative'] }, async ({ agent }) => {
      const response = await agent.quotes.create(buildQuote('cus_00000000000000000000'));
      expectApiError(response, { status: 404, code: 'CUSTOMER_NOT_FOUND' });
    });

    test('GET unknown quote returns 404', { tag: ['@negative'] }, async ({ agent }) => {
      const response = await agent.quotes.getById('quo_00000000000000000000');
      expectApiError(response, { status: 404, code: 'QUOTE_NOT_FOUND' });
    });
  });
});
