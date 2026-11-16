/** Date helpers. All calculations are in UTC so tests behave the same in every timezone. */

const DAY_MS = 24 * 60 * 60 * 1000;

const toDateOnly = (date) => date.toISOString().slice(0, 10);
const todayUtc = () => toDateOnly(new Date());

/**
 * Date of birth for someone who is exactly `age` years old today.
 * `dayOffset` shifts it: +1 day = the birthday is tomorrow, so the person is still `age - 1`.
 */
function dobForAge(age, dayOffset = 0) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return toDateOnly(d);
}

function addDays(dateOnly, days) {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

function addMonths(dateOnly, months) {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toDateOnly(d);
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

module.exports = { DAY_MS, toDateOnly, todayUtc, dobForAge, addDays, addMonths, daysBetween };
