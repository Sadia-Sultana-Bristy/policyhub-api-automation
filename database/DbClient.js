const { SqliteDatabase } = require('./sqlite');
const config = require('../config/env');

/**
 * Generic SQL client used by tests for backend validation.
 * Uses parameterised queries only, never string-built SQL.
 *
 * To target PostgreSQL/MySQL in a real environment, swap this class for a `pg` / `mysql2`
 * implementation with the same query/one/execute interface. Repositories stay unchanged.
 */
class DbClient {
  constructor(dbPath = config.db.path) {
    this.db = new SqliteDatabase(dbPath, { mustExist: true });
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  /** All rows. */
  query(sql, params = []) {
    return this.db.prepare(sql).all(...[].concat(params));
  }

  /** First row or undefined. */
  one(sql, params = []) {
    return this.db.prepare(sql).get(...[].concat(params));
  }

  /** Single scalar value (first column of first row). */
  scalar(sql, params = []) {
    const row = this.one(sql, params);
    return row ? Object.values(row)[0] : undefined;
  }

  /** INSERT/UPDATE/DELETE, used only for test-data setup. */
  execute(sql, params = []) {
    return this.db.prepare(sql).run(...[].concat(params));
  }

  close() {
    this.db.close();
  }
}

module.exports = { DbClient };
