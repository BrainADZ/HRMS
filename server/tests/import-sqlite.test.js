import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTestClient } from './postgres-client.js';
import { openDb } from '../db.js';
import { importSqlite } from '../database/import-sqlite.js';

test('SQLite import rolls back invalid data, preserves admin/IDs/hashes, generates usernames and advances identities', async () => {
  const db = await openDb({ queryClient: await createTestClient() });
  const source = new DatabaseSync(':memory:');
  try {
    await db.insert('users', { email: 'owner@example.test', role: 'admin', password_hash: 'configured-hash' });
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', 'companyName', '"Before import"');
    source.exec(`
      CREATE TABLE employees (id INTEGER PRIMARY KEY, code TEXT, first_name TEXT, email TEXT, join_date TEXT);
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, role TEXT, employee_id INTEGER, password_hash TEXT);
      CREATE TABLE sessions (token_hash TEXT, user_id INTEGER, expires_at TEXT);
      CREATE TABLE settings (key TEXT, value TEXT);
      INSERT INTO employees VALUES (10, 'BZ010', 'Aarav', 'aarav@example.test', '2026-01-01');
      INSERT INTO users VALUES (20, 'aarav@example.test', 'employee', 999, 'old-employee-hash');
      INSERT INTO sessions VALUES ('expired-cookie', 20, '2099-01-01');
      INSERT INTO settings VALUES ('companyName', '"Imported company"');
    `);
    await assert.rejects(importSqlite(source, db), /Non-administrator logins must be linked/);
    assert.equal(await db.value('SELECT COUNT(*) FROM employees'), 0);
    assert.equal(await db.value('SELECT password_hash FROM users'), 'configured-hash');
    assert.equal(await db.value("SELECT value FROM settings WHERE key = 'companyName'"), '"Before import"');
    source.exec('UPDATE users SET employee_id = 10');
    const report = await importSqlite(source, db);
    assert.equal(report.employees, 1);
    assert.equal(report.usersAfterPreservingAdmin, 2);
    assert.equal(await db.value('SELECT COUNT(*) FROM sessions'), 0);
    assert.deepEqual(await db.get('SELECT id, username, password_hash FROM users WHERE employee_id = 10'), { id: 20, username: 'aaravbz010', password_hash: 'old-employee-hash' });
    assert.equal(await db.value("SELECT password_hash FROM users WHERE email = 'owner@example.test'"), 'configured-hash');
    const next = await db.insert('employees', { code: 'BZ011', first_name: 'Next', email: 'next@example.test', join_date: '2026-01-01' });
    assert.equal(next, 11);
    await assert.rejects(importSqlite(source, db), /target must be the initial empty company/);
    assert.equal(await db.value('SELECT COUNT(*) FROM employees'), 2);
  } finally { source.close(); await db.close(); }
});
