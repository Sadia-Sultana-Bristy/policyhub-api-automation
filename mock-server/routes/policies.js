const express = require('express');
const { requireRole } = require('../middleware/auth');
const { ApiError, validationError } = require('../utils/errors');
const {
  newId, nowIso, round2, sha256, toDateOnly, addMonths, daysBetween, audit,
} = require('../utils/helpers');
const { lookupToken } = require('../services/paymentGateway');
const { toPolicy } = require('../services/mappers');

const CANCELLATION_REASONS = ['CUSTOMER_REQUEST', 'NON_PAYMENT', 'UNDERWRITING', 'OTHER'];

module.exports = function policyRoutes(db) {
  const router = express.Router();

  const getPolicy = (id) => db.prepare('SELECT * FROM policies WHERE id = ?').get(id);
  const getPayments = (policyId) => db.prepare('SELECT * FROM payments WHERE policy_id = ?').all(policyId);

  function saveIdempotentResponse(key, requestHash, status, body) {
    db.prepare(
      'INSERT INTO idempotency_keys (key, request_hash, status_code, response_body, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(key, requestHash, status, JSON.stringify(body), nowIso());
  }

  /** Purchase a policy from a quote (bind + charge). Requires an Idempotency-Key header. */
  router.post('/policies', requireRole('AGENT'), (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!key) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    if (key.length < 8 || key.length > 64) {
      throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-64 characters');
    }

    const body = req.body ?? {};
    const details = [];
    if (typeof body.quoteId !== 'string' || !body.quoteId) details.push({ field: 'quoteId', issue: 'is required' });
    if (typeof body.payment?.token !== 'string' || !body.payment.token) {
      details.push({ field: 'payment.token', issue: 'is required' });
    }
    if (details.length) throw validationError(details);

    // Idempotency: replay the original response for a retried request.
    const requestHash = sha256(JSON.stringify({ quoteId: body.quoteId, token: body.payment.token }));
    const previous = db.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get(key);
    if (previous) {
      if (previous.request_hash !== requestHash) {
        throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different request');
      }
      res.set('Idempotent-Replayed', 'true');
      return res.status(previous.status_code).json(JSON.parse(previous.response_body));
    }

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(body.quoteId);
    if (!quote) throw new ApiError(404, 'QUOTE_NOT_FOUND', `Quote ${body.quoteId} not found`);
    if (quote.status === 'BOUND') throw new ApiError(409, 'QUOTE_ALREADY_BOUND', 'A policy has already been issued for this quote');
    if (quote.status === 'EXPIRED' || Date.parse(quote.expires_at) <= Date.now()) {
      db.prepare("UPDATE quotes SET status = 'EXPIRED' WHERE id = ?").run(quote.id);
      throw new ApiError(422, 'QUOTE_EXPIRED', 'Quote has expired; request a new quote');
    }

    const card = lookupToken(body.payment.token);
    if (!card) {
      throw new ApiError(400, 'INVALID_PAYMENT_TOKEN', 'Payment token is not recognised', [
        { field: 'payment.token', issue: 'is not a valid payment token' },
      ]);
    }

    const actor = req.user.sub;
    const paymentId = newId('pay');

    // Declined payment: record the failed attempt, issue nothing.
    if (!card.approved) {
      const errorResponse = {
        error: {
          code: 'PAYMENT_DECLINED',
          message: 'Payment was declined by the card issuer',
          details: [{ field: 'payment.token', issue: card.failureCode }],
        },
        requestId: req.id,
      };
      db.transaction(() => {
        db.prepare(
          `INSERT INTO payments (id, quote_id, policy_id, type, amount, currency, status, payment_method, failure_code, created_at)
           VALUES (?, ?, NULL, 'CHARGE', ?, ?, 'FAILED', ?, ?, ?)`,
        ).run(paymentId, quote.id, quote.total_premium, quote.currency, card.method, card.failureCode, nowIso());
        audit(db, 'PAYMENT', paymentId, 'PAYMENT_FAILED', actor);
        saveIdempotentResponse(key, requestHash, 402, errorResponse);
      })();
      return res.status(402).json(errorResponse);
    }

    // Approved: charge + issue policy + bind quote atomically.
    const policyId = newId('pol');
    const issued = db.transaction(() => {
      const seq = db.prepare('SELECT COUNT(*) AS n FROM policies').get().n + 1;
      const policyNumber = `PH-${new Date().getUTCFullYear()}-${String(seq).padStart(6, '0')}`;
      const effectiveDate = toDateOnly(new Date());
      const createdAt = nowIso();

      db.prepare(
        `INSERT INTO policies (id, policy_number, quote_id, customer_id, product_code, coverage_amount, premium,
           currency, status, effective_date, expiry_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      ).run(policyId, policyNumber, quote.id, quote.customer_id, quote.product_code, quote.coverage_amount,
        quote.total_premium, quote.currency, effectiveDate, addMonths(effectiveDate, quote.term_months), createdAt);

      db.prepare(
        `INSERT INTO payments (id, quote_id, policy_id, type, amount, currency, status, payment_method, created_at)
         VALUES (?, ?, ?, 'CHARGE', ?, ?, 'SUCCEEDED', ?, ?)`,
      ).run(paymentId, quote.id, policyId, quote.total_premium, quote.currency, card.method, createdAt);

      db.prepare("UPDATE quotes SET status = 'BOUND' WHERE id = ?").run(quote.id);
      audit(db, 'PAYMENT', paymentId, 'PAYMENT_CAPTURED', actor);
      audit(db, 'POLICY', policyId, 'POLICY_ISSUED', actor);

      const response = toPolicy(getPolicy(policyId), getPayments(policyId));
      saveIdempotentResponse(key, requestHash, 201, response);
      return response;
    })();

    res.status(201).location(`${req.baseUrl}/policies/${policyId}`).json(issued);
  });

  router.get('/policies/:id', (req, res) => {
    const row = getPolicy(req.params.id);
    if (!row) throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${req.params.id} not found`);
    res.json(toPolicy(row, getPayments(row.id)));
  });

  /** Cancel a policy with a pro-rata refund of unused days. */
  router.post('/policies/:id/cancel', requireRole('AGENT'), (req, res) => {
    const { reason } = req.body ?? {};
    if (!CANCELLATION_REASONS.includes(reason)) {
      throw validationError([{ field: 'reason', issue: `must be one of ${CANCELLATION_REASONS.join(', ')}` }]);
    }

    const policy = getPolicy(req.params.id);
    if (!policy) throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${req.params.id} not found`);
    if (policy.status === 'CANCELLED') {
      throw new ApiError(409, 'POLICY_ALREADY_CANCELLED', 'Policy is already cancelled');
    }

    const today = toDateOnly(new Date());
    const totalDays = daysBetween(policy.effective_date, policy.expiry_date);
    const usedDays = Math.min(Math.max(daysBetween(policy.effective_date, today), 0), totalDays);
    const refundAmount = round2((policy.premium * (totalDays - usedDays)) / totalDays);
    const refundId = newId('pay');

    db.transaction(() => {
      db.prepare(
        `UPDATE policies SET status = 'CANCELLED', cancelled_at = ?, cancellation_reason = ?, refund_amount = ?
         WHERE id = ?`,
      ).run(nowIso(), reason, refundAmount, policy.id);
      db.prepare(
        `INSERT INTO payments (id, quote_id, policy_id, type, amount, currency, status, payment_method, created_at)
         VALUES (?, ?, ?, 'REFUND', ?, ?, 'SUCCEEDED', 'ORIGINAL_METHOD', ?)`,
      ).run(refundId, policy.quote_id, policy.id, refundAmount, policy.currency, nowIso());
      audit(db, 'POLICY', policy.id, 'POLICY_CANCELLED', req.user.sub);
      audit(db, 'PAYMENT', refundId, 'REFUND_ISSUED', req.user.sub);
    })();

    res.json(toPolicy(getPolicy(policy.id), getPayments(policy.id)));
  });

  return router;
};
