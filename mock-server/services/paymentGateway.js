/**
 * Simulated card payment gateway. Test tokens behave like a real sandbox:
 * some succeed, some are declined with a specific reason.
 */
const TOKENS = {
  tok_test_visa: { approved: true, method: 'VISA' },
  tok_test_mastercard: { approved: true, method: 'MASTERCARD' },
  tok_test_declined: { approved: false, method: 'VISA', failureCode: 'card_declined' },
  tok_test_insufficient_funds: { approved: false, method: 'VISA', failureCode: 'insufficient_funds' },
};

const lookupToken = (token) => TOKENS[token];

module.exports = { lookupToken };
