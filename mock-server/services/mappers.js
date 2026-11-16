/** Map database rows (snake_case) to API resources (camelCase). */

const toCustomer = (r) => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  email: r.email,
  dateOfBirth: r.date_of_birth,
  phone: r.phone,
  country: r.country,
  createdAt: r.created_at,
});

const toQuote = (r) => ({
  id: r.id,
  customerId: r.customer_id,
  productCode: r.product_code,
  coverageAmount: r.coverage_amount,
  termMonths: r.term_months,
  premium: {
    baseRate: r.base_rate,
    ageFactor: r.age_factor,
    termFactor: r.term_factor,
    annualPremium: r.annual_premium,
    totalPremium: r.total_premium,
    currency: r.currency,
  },
  status: r.status,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
});

const toPayment = (p) =>
  p && { id: p.id, type: p.type, amount: p.amount, currency: p.currency, status: p.status, method: p.payment_method };

function toPolicy(r, payments = []) {
  const charge = payments.find((p) => p.type === 'CHARGE' && p.status === 'SUCCEEDED');
  const refund = payments.find((p) => p.type === 'REFUND');
  const policy = {
    id: r.id,
    policyNumber: r.policy_number,
    quoteId: r.quote_id,
    customerId: r.customer_id,
    productCode: r.product_code,
    coverageAmount: r.coverage_amount,
    premium: r.premium,
    currency: r.currency,
    status: r.status,
    effectiveDate: r.effective_date,
    expiryDate: r.expiry_date,
    payment: toPayment(charge),
    createdAt: r.created_at,
  };
  if (r.status === 'CANCELLED') {
    policy.cancellation = {
      cancelledAt: r.cancelled_at,
      reason: r.cancellation_reason,
      refund: toPayment(refund),
    };
  }
  return policy;
}

module.exports = { toCustomer, toQuote, toPolicy };
