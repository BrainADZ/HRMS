import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient } from './postgres-client.js';
import { openDb, prepareQuery, postgresConfig } from '../server/db.js';
import fs from 'node:fs/promises';

test('PostgreSQL parameters preserve literals, comments, JSON and dollar strings', () => {
  const result = prepareQuery("SELECT ?, '?', $$?$$, $tag$?$tag$, \"?\" /* ? */ -- ?\n, ?", ['hello', { value: true }]);
  assert.equal(result.text, "SELECT $1, '?', $$?$$, $tag$?$tag$, \"?\" /* ? */ -- ?\n, $2");
  assert.deepEqual(result.values, ['hello', '{"value":true}']);
  assert.throws(() => prepareQuery('SELECT ?', []), /parameter count/);
});

test('PostgreSQL configuration supports raw passwords and validates pool/TLS options', () => {
  const config = postgresConfig({ PGDATABASE: 'hrms', PGUSER: 'postgres', PGPASSWORD: 'a@b#c%d', PGSSLMODE: 'require' });
  assert.equal(decodeURIComponent(new URL(config.connectionString).password), 'a@b#c%d');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.max, 10);
  assert.throws(() => postgresConfig({}), /Set DATABASE_URL/);
  assert.throws(() => postgresConfig({ DATABASE_URL: 'sqlite://local/hrms' }), /postgresql/);
  assert.throws(() => postgresConfig({ PGDATABASE: 'hrms', PGPOOL_MAX: '0' }), /PGPOOL_MAX/);
});

test('PostgreSQL schema, identities, case-insensitive uniqueness, rollback and foreign keys', async () => {
  const db = await openDb({ queryClient: await createTestClient() });
  try {
    assert.equal(await db.value('SELECT MAX(version) FROM schema_migrations'), 4);
    const employee = await db.insert('employees', { code: 'TEST001', first_name: 'Test', email: 'Mixed@Example.com', join_date: '2026-01-01' });
    assert.equal(typeof employee, 'number');
    await db.insert('work_sessions', { employee_id: employee, date: '2026-01-01', start_at: '2026-01-01T09:00:00Z' });
    await assert.rejects(db.insert('work_sessions', { employee_id: employee, date: '2026-01-01', start_at: '2026-01-01T09:01:00Z' }), { code: '23505' });
    await assert.rejects(db.insert('employees', { code: 'TEST002', first_name: 'Duplicate', email: 'mixed@example.com', join_date: '2026-01-01' }), { code: '23505' });
    const uid = await db.insert('users', { email: 'test@example.com', password_hash: 'test', role: 'employee', employee_id: employee });
    assert.equal(await db.value('SELECT username FROM users WHERE id = ?', uid), 'testtest001');
    await db.update('employees', employee, { first_name: 'New Name' });
    assert.equal(await db.value('SELECT username FROM users WHERE id = ?', uid), 'newnametest001');
    await db.update('employees', employee, { first_name: 'Test' });
    await db.update('users', uid, { role: 'admin' });
    assert.equal(await db.value('SELECT username FROM users WHERE id = ?', uid), null);
    await db.update('users', uid, { role: 'employee' });
    assert.equal(await db.value('SELECT username FROM users WHERE id = ?', uid), 'testtest001');
    await db.insert('sessions', { token_hash: 'session', user_id: uid, expires_at: '2099-01-01' });
    await assert.rejects(db.tx(async () => {
      await db.update('employees', employee, { first_name: 'Changed' });
      await db.tx(async () => db.insert('departments', { name: 'Must roll back' }));
      throw new Error('abort transaction');
    }), /abort transaction/);
    assert.equal(await db.value('SELECT first_name FROM employees WHERE id = ?', employee), 'Test');
    assert.equal(await db.value('SELECT COUNT(*) FROM departments'), 0);
    await assert.rejects(db.insert('documents', { employee_id: -1, name: 'Invalid', file: 'invalid.txt' }), { code: '23503' });
    await db.run('DELETE FROM users WHERE id = ?', uid);
    assert.equal(await db.value('SELECT COUNT(*) FROM sessions'), 0);
    await assert.rejects(db.insert('bad;table', {}), /identifier/);
  } finally { await db.close(); }
});

test('concurrent transactions stay on separate pool clients; nested operations join their own transaction', async () => {
  const events = [];
  let next = 0;
  const pool = {
    query: async (sql) => { events.push(['pool', sql]); return { rows: [{ value: 1 }] }; },
    connect: async () => {
      const id = ++next;
      return { query: async (sql) => { events.push([id, sql]); return { rows: [{ value: id }] }; }, release: () => events.push([id, 'RELEASE']) };
    },
    end: async () => {},
  };
  const db = await openDb({ pool, migrate: false });
  try {
    const result = await Promise.all([1, 2].map(() => db.tx(async () => {
      const first = await db.value('SELECT 2');
      await new Promise((resolve) => setTimeout(resolve, 5));
      const nested = await db.tx(() => db.value('SELECT 3'));
      assert.equal(first, nested);
      return first;
    })));
    assert.deepEqual(result, [1, 2]);
    assert.equal(events.filter(([id, sql]) => id === 'pool' && sql !== 'SELECT 1').length, 0);
    for (const id of [1, 2]) assert.deepEqual(events.filter(([key]) => key === id).map(([, sql]) => sql), ['BEGIN', 'SELECT 2', 'SELECT 3', 'COMMIT', 'RELEASE']);
  } finally { await db.close(); }
});

test('username migration backfills existing accounts, preserves passwords and is repeatable', async () => {
  const engine = await createTestClient();
  let db = await openDb({ queryClient: engine, migrate: false });
  try {
    await db.exec(await fs.readFile(new URL('../server/database/schema.sql', import.meta.url), 'utf8'));
    await db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    await db.run('INSERT INTO schema_migrations (version) VALUES (?)', 1);
    const employee = await db.insert('employees', { code: 'BZ777', first_name: 'Aarav', email: 'aarav@test.example', join_date: '2026-01-01' });
    const user = await db.insert('users', { email: 'aarav@test.example', password_hash: 'preserved-hash', role: 'employee', employee_id: employee });
    await db.insert('users', { email: 'admin@test.example', password_hash: 'admin-hash', role: 'admin' });
    db = await openDb({ queryClient: engine });
    assert.deepEqual(await db.get('SELECT username, password_hash FROM users WHERE id = ?', user), { username: 'aaravbz777', password_hash: 'preserved-hash' });
    assert.equal(await db.value("SELECT username FROM users WHERE role = 'admin'"), null);
    db = await openDb({ queryClient: engine });
    assert.equal(await db.value('SELECT COUNT(*) FROM schema_migrations'), 4);
  } finally { await db.close(); }
});

test('detached background work uses the pool after its originating transaction commits', async () => {
  const calls = [];
  const pool = {
    query: async (sql) => { calls.push(['pool', sql]); return { rows: [{ value: 1 }] }; },
    connect: async () => ({ query: async (sql) => { calls.push(['client', sql]); return { rows: [] }; }, release() { calls.push(['client', 'released']); } }),
    end: async () => {},
  };
  const db = await openDb({ pool, migrate: false });
  try {
    let resume, pending;
    const signal = new Promise((resolve) => { resume = resolve; });
    await db.tx(async () => { pending = signal.then(() => db.value('SELECT 2')); });
    resume(); await pending;
    assert.deepEqual(calls.at(-1), ['pool', 'SELECT 2']);
  } finally { await db.close(); }
});

test('background tasks are dispatched only after commit and discarded on rollback', async () => {
  const calls = [];
  const pool = {
    query: async () => ({ rows: [{ value: 1 }] }),
    connect: async () => ({ query: async () => ({ rows: [] }), release() { calls.push('release'); } }),
    end: async () => {},
  };
  const db = await openDb({ pool, migrate: false });
  try {
    let completed;
    const done = new Promise((resolve) => { completed = resolve; });
    await db.tx(async () => { db.afterCommit(() => { calls.push('task'); completed(); }); });
    await done;
    assert.deepEqual(calls, ['release', 'task']);
    await assert.rejects(db.tx(async () => { db.afterCommit(() => calls.push('rolled back task')); throw Error('abort'); }), /abort/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ['release', 'task', 'release']);
  } finally { await db.close(); }
});

test('PostgreSQL worker leases prevent duplicate screening across connections and release after errors', { skip: process.env.HRMS_TEST_POSTGRES !== '1' }, async () => {
  const db = await openDb({ migrate: false });
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const key = Math.floor(Math.random() * 1000000000);
  try {
    const first = db.exclusive(key, async () => { entered(); await hold; });
    await ready;
    assert.equal(await db.exclusive(key, () => assert.fail('duplicate worker acquired lease')), false);
    release(); await first;
    await assert.rejects(db.exclusive(key, async () => { throw Error('worker failed'); }), /worker failed/);
    assert.equal(await db.exclusive(key, async () => 'recovered'), 'recovered');
  } finally { release(); await db.close(); }
});
