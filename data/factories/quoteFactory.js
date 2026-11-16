/** Valid quote request payload with sensible defaults. */
function buildQuote(customerId, overrides = {}) {
  return {
    customerId,
    productCode: 'AUTO',
    coverageAmount: 250000,
    termMonths: 12,
    ...overrides,
  };
}

module.exports = { buildQuote };
