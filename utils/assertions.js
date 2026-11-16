const { expect: baseExpect } = require('@playwright/test');
const { validateSchema } = require('./schemaValidator');

/**
 * Custom Playwright matchers for ApiResponse objects.
 * When an assertion fails, the message includes the full request and response,
 * so a CI failure can be debugged from the report alone.
 */
const expect = baseExpect.extend({
  toHaveStatus(response, expected) {
    const pass = response.status === expected;
    return {
      pass,
      message: () => `Expected HTTP ${expected} but got ${response.status}\n${response.describe()}`,
    };
  },

  toMatchSchema(received, schemaName) {
    const payload = received && received.body !== undefined && received.raw ? received.body : received;
    const { valid, errors } = validateSchema(schemaName, payload);
    return {
      pass: valid,
      message: () => `Payload does not match schema "${schemaName}":\n  - ${errors.join('\n  - ')}\n` +
        `Payload: ${JSON.stringify(payload, null, 2)}`,
    };
  },

  toRespondWithin(response, maxMs) {
    return {
      pass: response.durationMs <= maxMs,
      message: () => `Expected response within ${maxMs} ms but took ${response.durationMs} ms\n${response.describe()}`,
    };
  },
});

/**
 * Assert a standard error envelope: status, error code, schema and (optionally) the failing field.
 * @param {import('../api/ApiResponse').ApiResponse} response
 * @param {{ status: number, code: string, field?: string, issue?: string|RegExp }} expected
 */
function expectApiError(response, { status, code, field, issue }) {
  expect(response).toHaveStatus(status);
  expect(response).toMatchSchema('error');
  expect(response.body.error.code, response.describe()).toBe(code);
  expect(response.body.requestId).toBe(response.header('x-request-id'));

  if (field) {
    const detail = (response.body.error.details || []).find((d) => d.field === field);
    expect(detail, `Expected a validation detail for "${field}"\n${response.describe()}`).toBeTruthy();
    if (issue) expect(detail.issue).toMatch(issue);
  }
}

module.exports = { expect, expectApiError };
