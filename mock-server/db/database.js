const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SqliteDatabase } = require('../../database/sqlite');
const config = require('../../config/env');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function removeDatabaseFiles(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
}

function seedUsers(db) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
  );
  for (const user of Object.values(config.users)) {
    insert.run(user.username, hashPassword(user.password), user.role);
  }
}

function openDatabase({ reset = false } = {}) {
  if (reset) removeDatabaseFiles(config.db.path);
  fs.mkdirSync(path.dirname(config.db.path), { recursive: true });

  const db = new SqliteDatabase(config.db.path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  seedUsers(db);
  return db;
}

module.exports = { openDatabase, verifyPassword, removeDatabaseFiles };
