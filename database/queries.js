/** Named SQL queries used for database validation. Kept in one place for review and reuse. */
module.exports = {
  customerById: 'SELECT * FROM customers WHERE id = ?',
  customerCountByEmail: 'SELECT COUNT(*) AS count FROM customers WHERE lower(email) = lower(?)',

  quoteById: 'SELECT * FROM quotes WHERE id = ?',

  policyById: 'SELECT * FROM policies WHERE id = ?',
  policiesByQuote: 'SELECT * FROM policies WHERE quote_id = ?',
  policiesByCustomer: 'SELECT * FROM policies WHERE customer_id = ? ORDER BY created_at',

  paymentsByQuote: 'SELECT * FROM payments WHERE quote_id = ? ORDER BY created_at, rowid',

  auditTrailForEntities: (count) =>
    `SELECT entity_type, entity_id, action, actor FROM audit_logs
     WHERE entity_id IN (${Array(count).fill('?').join(', ')}) ORDER BY id`,

  /** One row describing the full lifecycle of a policy across all tables. */
  policyLifecycle: `
    SELECT c.email              AS customer_email,
           q.status             AS quote_status,
           q.total_premium      AS quoted_premium,
           p.policy_number      AS policy_number,
           p.status             AS policy_status,
           p.premium            AS policy_premium,
           p.refund_amount      AS refund_amount,
           SUM(CASE WHEN pay.type = 'CHARGE' AND pay.status = 'SUCCEEDED' THEN pay.amount ELSE 0 END) AS total_charged,
           SUM(CASE WHEN pay.type = 'REFUND' THEN pay.amount ELSE 0 END)                               AS total_refunded,
           COUNT(pay.id)        AS payment_count
    FROM policies p
    JOIN quotes q    ON q.id = p.quote_id
    JOIN customers c ON c.id = p.customer_id
    LEFT JOIN payments pay ON pay.policy_id = p.id
    WHERE p.id = ?
    GROUP BY p.id`,

  /** Data-integrity check: a quote can never be bound to more than one policy. */
  quotesWithMultiplePolicies: `
    SELECT quote_id, COUNT(*) AS policies FROM policies GROUP BY quote_id HAVING COUNT(*) > 1`,

  /** Data-integrity check: every ACTIVE/CANCELLED policy has exactly one successful charge. */
  policiesWithoutExactlyOneCharge: `
    SELECT p.id, COUNT(pay.id) AS charges FROM policies p
    LEFT JOIN payments pay ON pay.policy_id = p.id AND pay.type = 'CHARGE' AND pay.status = 'SUCCEEDED'
    GROUP BY p.id HAVING COUNT(pay.id) <> 1`,

  // ---- test-data setup (state that can't be reached quickly through the API) ----
  expireQuote: "UPDATE quotes SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute') WHERE id = ?",
  backdatePolicy: `UPDATE policies
                   SET effective_date = date(effective_date, ?), expiry_date = date(expiry_date, ?)
                   WHERE id = ?`,
};
