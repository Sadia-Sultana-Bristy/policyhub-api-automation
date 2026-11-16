const express = require('express');
const { requireRole } = require('../middleware/auth');
const { ApiError, validationError } = require('../utils/errors');
const { newId, nowIso, isValidDate, ageInYears, audit } = require('../utils/helpers');
const { AGE } = require('../services/pricing');
const { toCustomer, toPolicy } = require('../services/mappers');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9]{8,15}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

function validateCustomer(body) {
  const details = [];
  for (const field of ['firstName', 'lastName']) {
    const v = body[field];
    if (typeof v !== 'string' || !v.trim()) details.push({ field, issue: 'is required' });
    else if (v.trim().length > 50) details.push({ field, issue: 'must be at most 50 characters' });
  }

  if (typeof body.email !== 'string' || !body.email.trim()) details.push({ field: 'email', issue: 'is required' });
  else if (!EMAIL_RE.test(body.email.trim())) details.push({ field: 'email', issue: 'must be a valid email address' });

  if (body.dateOfBirth === undefined) details.push({ field: 'dateOfBirth', issue: 'is required' });
  else if (!isValidDate(body.dateOfBirth)) details.push({ field: 'dateOfBirth', issue: 'must be a valid date (YYYY-MM-DD)' });
  else {
    const age = ageInYears(body.dateOfBirth);
    if (age < AGE.min || age > AGE.max) {
      details.push({ field: 'dateOfBirth', issue: `customer age must be between ${AGE.min} and ${AGE.max}` });
    }
  }

  if (body.phone !== undefined && (typeof body.phone !== 'string' || !PHONE_RE.test(body.phone))) {
    details.push({ field: 'phone', issue: 'must be 8-15 digits with optional leading +' });
  }

  if (body.country === undefined) details.push({ field: 'country', issue: 'is required' });
  else if (typeof body.country !== 'string' || !COUNTRY_RE.test(body.country)) {
    details.push({ field: 'country', issue: 'must be an ISO 3166-1 alpha-2 code' });
  }
  return details;
}

module.exports = function customerRoutes(db) {
  const router = express.Router();

  router.post('/customers', requireRole('AGENT'), (req, res) => {
    const body = req.body ?? {};
    const details = validateCustomer(body);
    if (details.length) throw validationError(details);

    const email = body.email.trim().toLowerCase();
    if (db.prepare('SELECT 1 FROM customers WHERE email = ?').get(email)) {
      throw new ApiError(409, 'CUSTOMER_EMAIL_EXISTS', 'A customer with this email already exists');
    }

    const id = newId('cus');
    db.transaction(() => {
      db.prepare(
        `INSERT INTO customers (id, first_name, last_name, email, date_of_birth, phone, country, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, body.firstName.trim(), body.lastName.trim(), email, body.dateOfBirth, body.phone ?? null,
        body.country, req.user.sub, nowIso());
      audit(db, 'CUSTOMER', id, 'CUSTOMER_CREATED', req.user.sub);
    })();

    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.status(201).location(`${req.baseUrl}/customers/${id}`).json(toCustomer(row));
  });

  router.get('/customers/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!row) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', `Customer ${req.params.id} not found`);
    res.json(toCustomer(row));
  });

  router.get('/customers/:id/policies', (req, res) => {
    const customer = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', `Customer ${req.params.id} not found`);
    const rows = db.prepare('SELECT * FROM policies WHERE customer_id = ? ORDER BY created_at').all(req.params.id);
    const paymentsStmt = db.prepare('SELECT * FROM payments WHERE policy_id = ?');
    const data = rows.map((r) => toPolicy(r, paymentsStmt.all(r.id)));
    res.json({ data, total: data.length });
  });

  return router;
};
