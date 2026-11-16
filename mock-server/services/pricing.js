/**
 * Underwriting / rating rules for PolicyHub.
 *   annualPremium = round2(coverage x baseRate x ageFactor)
 *   totalPremium  = round2(annualPremium x termFactor)
 */
const { round2 } = require('../utils/helpers');

const PRODUCTS = {
  AUTO: { baseRate: 0.035 },
  HOME: { baseRate: 0.012 },
};

const COVERAGE = { min: 10000, max: 1000000 };
const TERM_FACTORS = { 6: 0.55, 12: 1.0, 24: 1.9 };
const AGE = { min: 18, max: 75 };

function ageFactor(age) {
  if (age < 25) return 1.6;
  if (age < 65) return 1.0;
  return 1.3;
}

function calculatePremium({ productCode, coverageAmount, termMonths, age }) {
  const { baseRate } = PRODUCTS[productCode];
  const aFactor = ageFactor(age);
  const tFactor = TERM_FACTORS[termMonths];
  const annualPremium = round2(coverageAmount * baseRate * aFactor);
  const totalPremium = round2(annualPremium * tFactor);
  return { baseRate, ageFactor: aFactor, termFactor: tFactor, annualPremium, totalPremium };
}

module.exports = { PRODUCTS, COVERAGE, TERM_FACTORS, AGE, calculatePremium };
