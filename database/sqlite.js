/**
 * Small adapter over Node's built-in SQLite driver (`node:sqlite`, Node 22.13+).
 * Using the built-in driver means no native module and no C++ build tools for anyone cloning the repo.
 * Used by both the mock API and the test-side DbClient.
 */
const fs = require('fs');

// node:sqlite still emits a one-time ExperimentalWarning; hide only that warning.
const originalEmitWarning = process.emitWarning;
process.emitWarning = function emitWarning(warning, ...args) {
  const text = typeof warning === 'string' ? warning : warning?.message;
  if (text && text.includes('SQLite is an experimental feature')) return;
  return originalEmitWarning.call(process, warning, ...args);
};
const { DatabaseSync } = require('node:sqlite');

/** Convert null-prototype rows into plain objects (cleaner assertion diffs). */
const plain = (row) => (row ? { ...row } : row);

class SqliteDatabase {
  constructor(path, { mustExist = false } = {}) {
    if (mustExist && !fs.existsSync(path)) {
      throw new Error(`Database not found at ${path}. Is the API running?`);
    }
    this.db = new DatabaseSync(path);
  }

  exec(sql) {
    this.db.exec(sql);
  }

  /** Returns a statement-like object with plain-object rows. */
  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => plain(stmt.get(...params)),
      all: (...params) => stmt.all(...params).map(plain),
    };
  }

  /** Wrap fn in BEGIN/COMMIT, rolling back on error. Returns a callable (same style as better-sqlite3). */
  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    };
  }

  close() {
    this.db.close();
  }
}

module.exports = { SqliteDatabase };
