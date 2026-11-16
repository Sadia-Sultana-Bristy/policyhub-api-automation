const { test, expect, expectApiError, config } = require('../fixtures');
const { buildCustomer, without, BOUNDARIES } = require('../../data');
const { dobForAge } = require('../../utils/dateUtils');

test.describe('Customers API', () => {
  test.describe('POST /customers — positive', () => {
    test('creates a customer and persists it to the database', { tag: ['@smoke', '@db'] }, async ({ agent, db }) => {
      const payload = buildCustomer({ email: `Mixed.Case.${Date.now()}@PolicyHub.test` });

      const response = await agent.customers.create(payload);

      // API contract
      expect(response).toHaveStatus(201);
      expect(response).toMatchSchema('customer');
      expect(response).toRespondWithin(config.responseTimeSlaMs);
      expect(response.header('location')).toBe(`${config.apiPrefix}/customers/${response.body.id}`);
      expect(response.body).toMatchObject({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email.toLowerCase(), // emails are normalised
        dateOfBirth: payload.dateOfBirth,
        country: payload.country,
      });

      // Database validation
      const row = db.getCustomer(response.body.id);
      expect(row).toMatchObject({
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email.toLowerCase(),
        date_of_birth: payload.dateOfBirth,
        phone: payload.phone,
        country: payload.country,
        created_by: config.users.agent.username,
      });
      expect(db.getAuditTrail(response.body.id)).toEqual([
        { entity_type: 'CUSTOMER', entity_id: response.body.id, action: 'CUSTOMER_CREATED', actor: config.users.agent.username },
      ]);
    });

    test('phone is optional', { tag: ['@regression'] }, async ({ agent, db }) => {
      const response = await agent.customers.create(without(buildCustomer(), 'phone'));
      expect(response).toHaveStatus(201);
      expect(response.body.phone).toBeNull();
      expect(db.getCustomer(response.body.id).phone).toBeNull();
    });

    test('GET /customers/:id returns the created customer', { tag: ['@smoke'] }, async ({ agent, workflow }) => {
      const created = await workflow.createCustomer();
      const response = await agent.customers.getById(created.id);
      expect(response).toHaveStatus(200);
      expect(response).toMatchSchema('customer');
      expect(response.body).toEqual(created);
    });
  });

  test.describe('POST /customers — negative', () => {
    test('duplicate email (case-insensitive) is rejected with 409 and not persisted',
      { tag: ['@negative', '@db'] }, async ({ agent, workflow, db }) => {
        const existing = await workflow.createCustomer();
        const response = await agent.customers.create(buildCustomer({ email: existing.email.toUpperCase() }));

        expectApiError(response, { status: 409, code: 'CUSTOMER_EMAIL_EXISTS' });
        expect(db.countCustomersByEmail(existing.email)).toBe(1);
      });

    for (const field of ['firstName', 'lastName', 'email', 'dateOfBirth', 'country']) {
      test(`missing required field "${field}" returns 400`, { tag: ['@negative'] }, async ({ agent }) => {
        const response = await agent.customers.create(without(buildCustomer(), field));
        expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field, issue: 'is required' });
      });
    }

    test('reports every invalid field in one response', { tag: ['@negative'] }, async ({ agent }) => {
      const response = await agent.customers.create({ email: 'bad', country: 'Thailand' });
      expectApiError(response, { status: 400, code: 'VALIDATION_ERROR' });
      const fields = response.body.error.details.map((d) => d.field).sort();
      expect(fields).toEqual(['country', 'dateOfBirth', 'email', 'firstName', 'lastName']);
    });

    for (const email of ['plainaddress', 'missing-at.example.com', 'user@', 'user@domain', 'user @x.com']) {
      // "@" is escaped in the title because Playwright treats "@word" in titles as a tag
      test(`invalid email "${email.replace('@', '[at]')}" returns 400`, { tag: ['@negative'] }, async ({ agent }) => {
        const response = await agent.customers.create(buildCustomer({ email }));
        expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'email', issue: /valid email/ });
      });
    }

    for (const dateOfBirth of ['15-01-1990', '1990/01/15', '1990-02-30', '1990-13-01', 19900115]) {
      test(`invalid dateOfBirth ${JSON.stringify(dateOfBirth)} returns 400`, { tag: ['@negative'] }, async ({ agent }) => {
        const response = await agent.customers.create(buildCustomer({ dateOfBirth }));
        expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'dateOfBirth', issue: /valid date/ });
      });
    }

    for (const country of ['th', 'THA', 'T1']) {
      test(`invalid country code "${country}" returns 400`, { tag: ['@negative'] }, async ({ agent }) => {
        const response = await agent.customers.create(buildCustomer({ country }));
        expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'country' });
      });
    }

    test('malformed JSON body returns 400 MALFORMED_JSON', { tag: ['@negative'] }, async ({ agent }) => {
      const response = await agent.customers.create('{"firstName": "Broken",', {
        headers: { 'Content-Type': 'application/json' },
      });
      expectApiError(response, { status: 400, code: 'MALFORMED_JSON' });
    });

    test('GET unknown customer returns 404', { tag: ['@negative'] }, async ({ agent }) => {
      const response = await agent.customers.getById('cus_00000000000000000000');
      expectApiError(response, { status: 404, code: 'CUSTOMER_NOT_FOUND' });
    });
  });

  test.describe('POST /customers — boundary values', () => {
    for (const { label, age, dayOffset, valid } of BOUNDARIES.customerAge) {
      test(`customer age ${label} → ${valid ? 'accepted' : 'rejected'}`, { tag: ['@boundary'] }, async ({ agent }) => {
        const response = await agent.customers.create(buildCustomer({ dateOfBirth: dobForAge(age, dayOffset) }));
        if (valid) expect(response).toHaveStatus(201);
        else expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'dateOfBirth', issue: /between 18 and 75/ });
      });
    }

    for (const { length, valid } of BOUNDARIES.nameLength) {
      test(`firstName length ${length} → ${valid ? 'accepted' : 'rejected'}`, { tag: ['@boundary'] }, async ({ agent }) => {
        const response = await agent.customers.create(buildCustomer({ firstName: 'A'.repeat(length) }));
        if (valid) expect(response).toHaveStatus(201);
        else expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'firstName', issue: /at most 50/ });
      });
    }

    test('whitespace-only firstName is treated as empty', { tag: ['@boundary', '@negative'] }, async ({ agent }) => {
      const response = await agent.customers.create(buildCustomer({ firstName: '   ' }));
      expectApiError(response, { status: 400, code: 'VALIDATION_ERROR', field: 'firstName', issue: 'is required' });
    });
  });
});
