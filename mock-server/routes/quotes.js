const express = require('express');
const config = require('../../config/env');
const { requireRole } = require('../middleware/auth');
const { ApiError, validationError } = require('../utils/errors');
const { newId, ageInYears, audit } = require('../utils/helpers');
const { PRODUCTS, COVERAGE, TERM_FACTORS, calculatePremium } = require('../services/pricing');
const { toQuote } = require('../services/mappers');

function validateQuote(body) {
  const details = [];
  if (typeof body.customerId !== 'string' || !body.customerId) details.push({ field: 'customerId', issue: 'is required' });

  if (!Object.keys(PRODUCTS).includes(body.productCode)) {
    details.push({ field: 'productCode', issue: `must be one of ${Object.keys(PRODUCTS).join(', ')}` });
  }

  const cov = body.coverageAmount;
  if (typeof cov !== 'number' || !Number.isFinite(cov)) details.push({ field: 'coverageAmount', issue: 'must be a number' });
  else if (cov < COVERAGE.min || cov > COVERAGE.max) {
    details.push({ field: 'coverageAmount', issue: `must be between ${COVERAGE.min} and ${COVERAGE.max}` });
  }

  if (!Object.keys(TERM_FACTORS).map(Number).includes(body.termMonths)) {
    details.push({ field: 'termMonths', issue: `must be one of ${Object.keys(TERM_FACTORS).join(', ')}` });
  }
  return details;
}

module.exports = function quoteRoutes(db) {
  const router = express.Router();

  router.post('/quotes', requireRole('AGENT'), (req, res) => {
    const body = req.body ?? {};
    const details = validateQuote(body);
    if (details.length) throw validationError(details);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(body.customerId);
    if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', `Customer ${body.customerId} not found`);

    const premium = calculatePremium({
      productCode: body.productCode,
      coverageAmount: body.coverageAmount,
      termMonths: body.termMonths,
      age: ageInYears(customer.date_of_birth),
    });

    const id = newId('quo');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + config.business.quoteValidityDays * 86400000);

    db.transaction(() => {
      db.prepare(
        `INSERT INTO quotes (id, customer_id, product_code, coverage_amount, term_months, base_rate, age_factor,
           term_factor, annual_premium, total_premium, currency, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'QUOTED', ?, ?)`,
      ).run(id, customer.id, body.productCode, body.coverageAmount, body.termMonths, premium.baseRate,
        premium.ageFactor, premium.termFactor, premium.annualPremium, premium.totalPremium,
        expiresAt.toISOString(), createdAt.toISOString());
      audit(db, 'QUOTE', id, 'QUOTE_CREATED', req.user.sub);
    })();

    const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    res.status(201).location(`${req.baseUrl}/quotes/${id}`).json(toQuote(row));
  });

  router.get('/quotes/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
    if (!row) throw new ApiError(404, 'QUOTE_NOT_FOUND', `Quote ${req.params.id} not found`);
    res.json(toQuote(row));
  });

  return router;
};
