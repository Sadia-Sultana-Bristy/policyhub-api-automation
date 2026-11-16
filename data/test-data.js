/** Static test data: payment tokens, enums, and boundary-value tables. */

const PAYMENT_TOKENS = {
  visa: 'tok_test_visa',
  mastercard: 'tok_test_mastercard',
  declined: 'tok_test_declined',
  insufficientFunds: 'tok_test_insufficient_funds',
  invalid: 'tok_does_not_exist',
};

const PRODUCTS = ['AUTO', 'HOME'];
const TERMS = [6, 12, 24];
const CANCELLATION_REASONS = ['CUSTOMER_REQUEST', 'NON_PAYMENT', 'UNDERWRITING', 'OTHER'];

/** Boundary value analysis: values on and either side of each limit. */
const BOUNDARIES = {
  // [age, dayOffset, expectedValid]. dayOffset +1 = birthday is tomorrow, so the customer is one year younger
  customerAge: [
    { label: '17 (one day before 18th birthday)', age: 18, dayOffset: 1, valid: false },
    { label: '18 (exactly, birthday today)', age: 18, dayOffset: 0, valid: true },
    { label: '75 (day before 76th birthday)', age: 76, dayOffset: 1, valid: true },
    { label: '76 (exactly, birthday today)', age: 76, dayOffset: 0, valid: false },
  ],
  coverageAmount: [
    { value: 9999, valid: false },
    { value: 10000, valid: true },
    { value: 1000000, valid: true },
    { value: 1000001, valid: false },
  ],
  nameLength: [
    { length: 1, valid: true },
    { length: 50, valid: true },
    { length: 51, valid: false },
  ],
};

module.exports = { PAYMENT_TOKENS, PRODUCTS, TERMS, CANCELLATION_REASONS, BOUNDARIES };
