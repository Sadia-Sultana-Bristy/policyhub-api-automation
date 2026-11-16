# PolicyHub API v1: Reference

Base URL: `http://localhost:3000/api/v1`. All endpoints except `/auth/token` require `Authorization: Bearer <token>`.

## Authentication

### `POST /auth/token`
```json
{ "username": "agent.alice", "password": "Agent@12345" }
```
`200` →
```json
{ "accessToken": "eyJ...", "tokenType": "Bearer", "expiresIn": 900, "role": "AGENT" }
```
Roles: `AGENT` (read + write), `VIEWER` (read only).

## Customers

| Method | Path | Role | Success |
|---|---|---|---|
| POST | `/customers` | AGENT | 201 + `Location` |
| GET | `/customers/{id}` | any | 200 |
| GET | `/customers/{id}/policies` | any | 200 `{ data: Policy[], total }` |

```json
{
  "firstName": "Malee", "lastName": "Wongsa", "email": "malee@example.com",
  "dateOfBirth": "1990-04-12", "phone": "+66812345678", "country": "TH"
}
```
Rules: names 1–50 chars; valid email (stored lowercase, unique); age 18–75; phone optional (8–15 digits); country ISO-3166 alpha-2.

## Quotes

| Method | Path | Role | Success |
|---|---|---|---|
| POST | `/quotes` | AGENT | 201 |
| GET | `/quotes/{id}` | any | 200 |

```json
{ "customerId": "cus_…", "productCode": "AUTO", "coverageAmount": 250000, "termMonths": 12 }
```
Response includes `premium { baseRate, ageFactor, termFactor, annualPremium, totalPremium, currency }`, `status: QUOTED`, and `expiresAt` (+30 days).

## Policies

| Method | Path | Role | Headers | Success |
|---|---|---|---|---|
| POST | `/policies` | AGENT | `Idempotency-Key` (8–64 chars, required) | 201 |
| GET | `/policies/{id}` | any | | 200 |
| POST | `/policies/{id}/cancel` | AGENT | | 200 |

Purchase:
```json
{ "quoteId": "quo_…", "payment": { "token": "tok_test_visa" } }
```
Sandbox tokens: `tok_test_visa`, `tok_test_mastercard` (approved); `tok_test_declined`, `tok_test_insufficient_funds` (declined → 402).

Cancel:
```json
{ "reason": "CUSTOMER_REQUEST" }
```
Reasons: `CUSTOMER_REQUEST`, `NON_PAYMENT`, `UNDERWRITING`, `OTHER`. The refund is pro-rata on unused days.

## Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "coverageAmount", "issue": "must be between 10000 and 1000000" }]
  },
  "requestId": "6f1c…"
}
```

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Field validation failed (all fields reported) |
| 400 | `MALFORMED_JSON` | Body is not valid JSON |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` / `INVALID_IDEMPOTENCY_KEY` | Missing / wrong-length key |
| 400 | `INVALID_PAYMENT_TOKEN` | Unknown card token |
| 401 | `UNAUTHORIZED` | No `Authorization` header |
| 401 | `INVALID_TOKEN` | Bad scheme, bad signature, tampered token |
| 401 | `TOKEN_EXPIRED` | JWT past `exp` |
| 401 | `INVALID_CREDENTIALS` | Wrong username or password (same message for both) |
| 402 | `PAYMENT_DECLINED` | Issuer declined (`details[0].issue` = reason) |
| 403 | `FORBIDDEN` | Role not allowed |
| 404 | `CUSTOMER_NOT_FOUND` / `QUOTE_NOT_FOUND` / `POLICY_NOT_FOUND` / `NOT_FOUND` | Unknown resource / route |
| 409 | `CUSTOMER_EMAIL_EXISTS` | Duplicate email (case-insensitive) |
| 409 | `QUOTE_ALREADY_BOUND` | Quote already has a policy |
| 409 | `POLICY_ALREADY_CANCELLED` | Second cancellation |
| 422 | `QUOTE_EXPIRED` | Quote older than 30 days |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Same key, different request body |

## Database tables

`users`, `customers`, `quotes`, `policies`, `payments` (CHARGE / REFUND, SUCCEEDED / FAILED), `idempotency_keys`, `audit_logs`. See `mock-server/db/schema.sql`.
