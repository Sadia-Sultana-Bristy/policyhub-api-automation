const crypto = require('crypto');
const { dobForAge } = require('../../utils/dateUtils');

const FIRST_NAMES = ['Somchai', 'Ayesha', 'Daniel', 'Malee', 'Rafiq', 'Emma', 'Kenji', 'Nadia'];
const LAST_NAMES = ['Srisuk', 'Rahman', 'Carter', 'Wongsa', 'Hossain', 'Nguyen', 'Tanaka', 'Silva'];
const COUNTRIES = ['TH', 'US', 'SG', 'BD', 'GB'];

const pick = (list) => list[crypto.randomInt(list.length)];
const uniqueSuffix = () => `${Date.now()}${crypto.randomBytes(3).toString('hex')}`;

/** Unique, valid customer payload. Override any field for a specific scenario. */
function buildCustomer(overrides = {}) {
  const { age = 35, ...rest } = overrides;
  return {
    firstName: pick(FIRST_NAMES),
    lastName: pick(LAST_NAMES),
    email: `qa.customer.${uniqueSuffix()}@policyhub.test`,
    dateOfBirth: dobForAge(age),
    phone: `+66${crypto.randomInt(100000000, 999999999)}`,
    country: pick(COUNTRIES),
    ...rest,
  };
}

/** Copy of the payload with a field removed (for "required field" tests). */
function without(payload, field) {
  const copy = { ...payload };
  delete copy[field];
  return copy;
}

module.exports = { buildCustomer, without };
