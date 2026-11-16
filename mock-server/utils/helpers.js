const crypto = require('crypto');

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
const nowIso = () => new Date().toISOString();
const round2 = (n) => Math.round(n * 100) / 100;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function ageInYears(dob, now = new Date()) {
  const [y, m, d] = dob.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  const month = now.getUTCMonth() + 1;
  if (month < m || (month === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

const toDateOnly = (date) => date.toISOString().slice(0, 10);

function addMonths(dateOnly, months) {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toDateOnly(d);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (fromDateOnly, toDateOnlyValue) =>
  Math.round((Date.parse(`${toDateOnlyValue}T00:00:00Z`) - Date.parse(`${fromDateOnly}T00:00:00Z`)) / DAY_MS);

function audit(db, entityType, entityId, action, actor) {
  db.prepare(
    'INSERT INTO audit_logs (entity_type, entity_id, action, actor, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(entityType, entityId, action, actor, nowIso());
}

module.exports = {
  newId, nowIso, round2, sha256, isValidDate, ageInYears, toDateOnly, addMonths, daysBetween, audit,
};
