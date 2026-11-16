const { PAYMENT_TOKENS } = require('../test-data');

/** Purchase (bind) request payload. */
function buildPurchase(quoteId, token = PAYMENT_TOKENS.visa) {
  return { quoteId, payment: { token } };
}

const buildCancellation = (reason = 'CUSTOMER_REQUEST') => ({ reason });

module.exports = { buildPurchase, buildCancellation };
