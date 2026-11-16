-- PolicyHub database schema (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('AGENT', 'VIEWER'))
);

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  date_of_birth TEXT NOT NULL,
  phone         TEXT,
  country       TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id              TEXT PRIMARY KEY,
  customer_id     TEXT    NOT NULL REFERENCES customers(id),
  product_code    TEXT    NOT NULL CHECK (product_code IN ('AUTO', 'HOME')),
  coverage_amount REAL    NOT NULL,
  term_months     INTEGER NOT NULL,
  base_rate       REAL    NOT NULL,
  age_factor      REAL    NOT NULL,
  term_factor     REAL    NOT NULL,
  annual_premium  REAL    NOT NULL,
  total_premium   REAL    NOT NULL,
  currency        TEXT    NOT NULL DEFAULT 'USD',
  status          TEXT    NOT NULL CHECK (status IN ('QUOTED', 'BOUND', 'EXPIRED')),
  expires_at      TEXT    NOT NULL,
  created_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
  id                  TEXT PRIMARY KEY,
  policy_number       TEXT NOT NULL UNIQUE,
  quote_id            TEXT NOT NULL UNIQUE REFERENCES quotes(id),
  customer_id         TEXT NOT NULL REFERENCES customers(id),
  product_code        TEXT NOT NULL,
  coverage_amount     REAL NOT NULL,
  premium             REAL NOT NULL,
  currency            TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CANCELLED')),
  effective_date      TEXT NOT NULL,
  expiry_date         TEXT NOT NULL,
  cancelled_at        TEXT,
  cancellation_reason TEXT,
  refund_amount       REAL,
  created_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id             TEXT PRIMARY KEY,
  quote_id       TEXT NOT NULL REFERENCES quotes(id),
  policy_id      TEXT REFERENCES policies(id),
  type           TEXT NOT NULL CHECK (type IN ('CHARGE', 'REFUND')),
  amount         REAL NOT NULL,
  currency       TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED')),
  payment_method TEXT,
  failure_code   TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT PRIMARY KEY,
  request_hash  TEXT    NOT NULL,
  status_code   INTEGER NOT NULL,
  response_body TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  actor       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quotes_customer   ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_policies_customer ON policies(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_quote    ON payments(quote_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON audit_logs(entity_id);
