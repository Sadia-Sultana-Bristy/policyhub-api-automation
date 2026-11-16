/**
 * Test oracle for premium calculation.
 *
 * Implemented independently from the API, using the business rules in data/pricing-rules.json.
 * Tests compare the API's premium with this expected value, so a pricing defect in the
 * backend shows up as a test failure instead of being copied into the expected results.
 */
const rules = require('../data/pricing-rules.json');

const round2 = (n) => Math.round(n * 100) / 100;

function ageFactorFor(age) {
  const band = rules.ageBands.find((b) => age >= b.minAge && age <= b.maxAge);
  if (!band) throw new Error(`No age band for age ${age}`);
  return band.factor;
}

function expectedPremium({ productCode, coverageAmount, termMonths, age }) {
  const baseRate = rules.products[productCode].baseRate;
  const ageFactor = ageFactorFor(age);
  const termFactor = rules.termFactors[String(termMonths)];
  const annualPremium = round2(coverageAmount * baseRate * ageFactor);
  const totalPremium = round2(annualPremium * termFactor);
  return { baseRate, ageFactor, termFactor, annualPremium, totalPremium, currency: rules.currency };
}

/** Pro-rata refund of the unused days of a policy term. */
function expectedRefund({ premium, totalDays, usedDays }) {
  const used = Math.min(Math.max(usedDays, 0), totalDays);
  return round2((premium * (totalDays - used)) / totalDays);
}

module.exports = { expectedPremium, expectedRefund, ageFactorFor, round2 };
