const crypto = require('crypto');

/** Unique, readable idempotency key, e.g. "qa-1731772800000-3f9a1c2b". */
const newIdempotencyKey = () => `qa-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

module.exports = { newIdempotencyKey };
