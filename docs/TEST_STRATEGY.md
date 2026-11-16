# API Test Strategy: PolicyHub

| | |
|---|---|
| **System** | PolicyHub REST API v1 (insurance policy administration) |
| **Scope** | Authentication, Customers, Quotes, Policies (purchase, cancellation), Payments, Audit |
| **Test levels** | API functional, contract, integration (API ↔ DB), end-to-end business flow |
| **Tooling** | Playwright Test (`APIRequestContext`), AJV, node:sqlite (built-in), GitHub Actions |
| **Owner** | Sadia Sultana Bristy |

---

## 1. Objectives

1. Make sure the **policy sale process** (onboard → quote → bind → pay → cancel) is correct, because errors here cost money and trust.
2. Make sure **premiums and refunds** follow the rating rules exactly.
3. Make sure that **no customer is charged twice** and **no quote produces two policies**, even with retries and concurrent requests.
4. Make sure the API **rejects invalid input** with consistent, documented errors.
5. Make sure the **database matches what the API reports**. A 201 response is not enough on its own.
6. Give fast feedback in CI on every change.

## 2. In scope / out of scope

| In scope | Out of scope (and why) |
|---|---|
| Functional behaviour of all v1 endpoints | UI testing (covered by the separate InsureFlow Playwright UI project) |
| Response contracts (JSON Schema) | Load and stress testing (would use k6/JMeter, separate pipeline) |
| AuthN/AuthZ, JWT handling, RBAC | Penetration testing |
| Business rules (pricing, eligibility, quote expiry, refunds) | Real payment-gateway behaviour (sandbox tokens simulate it) |
| Data persistence and integrity (SQL) | Database migrations |
| Idempotency and concurrency of purchase | |

## 3. Risk-based prioritisation

| Risk | Impact | Likelihood | Priority | Mitigating tests |
|---|---|---|---|---|
| Customer charged twice / duplicate policy | Very high | Medium | **P1** | Idempotency replay, already-bound 409, 5× concurrent purchase, DB integrity queries |
| Wrong premium calculated | Very high | Medium | **P1** | Pricing matrix vs independent oracle, term factors, age-band edges |
| Policy issued without successful payment | Very high | Low | **P1** | Declined / insufficient funds → no policy, quote stays QUOTED |
| Unauthorised data change | High | Medium | **P1** | Missing / invalid / tampered / expired token, VIEWER write attempts |
| Wrong refund on cancellation | High | Medium | **P2** | Same-day full refund, pro-rata refund after backdating, no double refund |
| Ineligible customer insured (age) | High | Low | **P2** | Age boundaries 17 / 18 / 75 / 76 |
| Expired quote purchased at old price | Medium | Medium | **P2** | Expired-quote 422 + status transition |
| Inconsistent error responses | Medium | High | **P3** | `expectApiError` checks schema, code, field and requestId on every negative test |

P1 tests are tagged `@smoke` where they are on the critical path and run on every push.

## 4. Test design techniques

| Technique | Applied to | Example |
|---|---|---|
| **Equivalence partitioning** | Products, payment tokens, cancellation reasons, invalid email classes | valid card / declined / insufficient funds / unknown token |
| **Boundary value analysis** | Age (18–75), coverage (10k–1M), name length (≤50), idempotency key length (8–64) | 9,999 ✗ · 10,000 ✓ · 1,000,000 ✓ · 1,000,001 ✗ |
| **Decision table** | Premium = product × age band × term | 2 products × 6 age edges, 3 terms |
| **State transition** | Quote: `QUOTED → BOUND`, `QUOTED → EXPIRED`; Policy: `ACTIVE → CANCELLED` | BOUND quote can't be re-purchased; CANCELLED can't be re-cancelled |
| **Error guessing** | Malformed JSON, type confusion (`"12"` vs `12`), lowercase enums, whitespace-only names | `termMonths: "12"` → 400 |
| **Negative security tests** | JWT tampering, wrong secret, scheme confusion, user enumeration | Role escalation via edited JWT payload → 401 |
| **Concurrency** | Double-submit of purchase | `Promise.all` of 5 requests → exactly one 201 |

## 5. Validation layers per test

Each important test validates several layers:

1. **Transport:** status code, `Location`, `Content-Type`, `X-Request-Id`, `WWW-Authenticate`
2. **Contract:** response matches the JSON Schema in `api/schemas/` (`additionalProperties: false` catches unexpected fields)
3. **Business:** values are correct (premium from the oracle, dates, statuses)
4. **Persistence:** SQL confirms the database row(s), status transitions and links between tables
5. **Side effects:** audit-log entries, payment records, and that *nothing* was written on failure
6. **Performance:** critical endpoints respond within `RESPONSE_TIME_SLA_MS`

## 6. Test data management

- **Factories** (`data/factories/`) generate a unique customer email per call. Tests never depend on shared or seeded business data, so they run in parallel (4 workers) and in any order.
- **Boundary tables** (`data/test-data.js`) keep BVA values in one place for review.
- **Business-rule spec** (`data/pricing-rules.json`) feeds an independent oracle (`utils/premiumCalculator.js`). The expected premium is not copied from the API's own code.
- **DB-driven setup** for time-based states. `expireQuote()` and `backdatePolicy()` use SQL to create states that would otherwise need days of waiting. This is the only place tests write to the DB.
- **Clean environment per run:** the mock API recreates the database on start (`RESET_DB_ON_START=true`).

## 7. Suite effectiveness: fault injection

To show that the assertions catch real defects, two bugs were planted in the backend:

| Injected defect | Tests that failed |
|---|---|
| Age band boundary moved from `< 25` to `< 24` | `premium for AUTO, age 24`, `premium for HOME, age 24` |
| Quote not set to `BOUND` after purchase | purchase happy path (DB), already-bound 409, concurrency, E2E lifecycle |

The suite went from 114/114 to 108/114. The failures pointed directly at the defect, and the suite returned to 114/114 after the revert.

## 8. Environments

| Env | How | Notes |
|---|---|---|
| Local | `npm test` (mock API auto-starts) | Full suite incl. expired-token test |
| CI | GitHub Actions, Node 22 + 24 | Secrets from repo settings, artifacts kept 14 days |
| Staging (real backend) | `START_LOCAL_SERVER=false BASE_URL=… DB_PATH/driver swap` | `DbClient` is the only class to change for PostgreSQL/MySQL |

## 9. Entry and exit criteria

**Entry:** API deployed and `/health` returns `UP`; test users exist; DB reachable.
**Exit (release gate):** 100% of `@smoke` passing; no open P1 failures; overall pass rate ≥ 98%, with any failure triaged and linked to a Jira ticket; no test marked flaky for two consecutive nightly runs.

## 10. Defect reporting

Failures include the full request and response (custom matchers), the `requestId` for log correlation, and the test step that failed. These are attached to the Jira ticket together with the HTML report artifact from the CI run.

## 11. Traceability

| Requirement | Spec file |
|---|---|
| REQ-AUTH-01..05 Login, token validity, RBAC | `tests/auth/authentication.spec.js` |
| REQ-CUS-01..04 Onboarding, validation, eligibility, uniqueness | `tests/customers/customers.spec.js` |
| REQ-QUO-01..04 Rating, coverage limits, terms, validity | `tests/quotes/quotes.spec.js` |
| REQ-POL-01..06 Bind, payment, idempotency, expiry | `tests/policies/purchase.spec.js` |
| REQ-POL-07..09 Cancellation, refund, single refund | `tests/policies/cancellation.spec.js` |
| REQ-E2E-01 Full lifecycle + audit trail | `tests/integration/policy-lifecycle.spec.js` |
