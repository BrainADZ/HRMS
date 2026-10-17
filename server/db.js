import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import pg from 'pg';

import { identifier, prepareQuery } from './database/query.js';
export { prepareQuery } from './database/query.js';

const numberParser = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) throw new Error('Database number exceeds the supported numeric range');
  return number;
};
const types = { getTypeParser(oid, format) {
  return [20, 1700].includes(oid) && format !== 'binary' ? numberParser : pg.types.getTypeParser(oid, format);
} };
export function postgresConfig(env = process.env) {
  if (!env.DATABASE_URL && !env.PGDATABASE) throw new Error('Set DATABASE_URL, or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD in .env.');
  const url = new URL(env.DATABASE_URL || 'postgresql://localhost');
  if (!env.DATABASE_URL) {
    url.hostname = env.PGHOST || 'localhost';
    url.port = env.PGPORT || '5432';
    url.pathname = `/${env.PGDATABASE}`;
    url.username = encodeURIComponent(env.PGUSER || 'postgres');
    url.password = encodeURIComponent(env.PGPASSWORD || '');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use postgresql:// or postgres://');
  const sslMode = env.PGSSLMODE || url.searchParams.get('sslmode') || 'disable';
  if (!['disable', 'require', 'verify-ca', 'verify-full'].includes(sslMode)) throw new Error('Unsupported PGSSLMODE');
  url.searchParams.delete('sslmode');
  const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: true,
    ...(env.PGSSLROOTCERT ? { ca: env.PGSSLROOTCERT.replace(/\\n/g, '\n') } : {}) };
  const max = Number(env.PGPOOL_MAX || 10);
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error('PGPOOL_MAX must be an integer between 1 and 100');
  return { connectionString: url.toString(), ssl, max, types, connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000, statement_timeout: 30000, application_name: 'brainadz-hrms' };
}
// Test clients use the same PostgreSQL SQL and transactions as production.
export async function openDb({ connectionString, queryClient, pool: suppliedPool, migrate = true } = {}) {
  const pool = queryClient || suppliedPool || new pg.Pool(postgresConfig({ ...process.env, ...(connectionString ? { DATABASE_URL: connectionString } : {}) }));
  pool.on?.('error', (error) => console.error('PostgreSQL connection error:', error.code || error.name));
  const context = new AsyncLocalStorage();
  const afterCommit = (callback) => context.exit(() => queueMicrotask(() => {
    Promise.resolve().then(callback).catch((error) => console.error('Post-commit task failed:', error));
  }));
  let testTransactions = Promise.resolve();
  const onClient = (operation) => {
    const state = context.getStore();
    if (!state?.active) return operation(pool);
    const result = state.tail.then(() => operation(state.client));
    state.tail = result.then(() => {}, () => {});
    return result;
  };
  const query = (sql, ...params) => {
    const { text, values } = prepareQuery(sql, params);
    return onClient((client) => client.query(text, values));
  };
  const db = {
    dialect: 'postgres',
    async all(sql, ...params) { return (await query(sql, ...params)).rows; },
    async get(sql, ...params) { return (await db.all(sql, ...params))[0]; },
    async value(sql, ...params) { const row = await db.get(sql, ...params); return row ? Object.values(row)[0] : undefined; },
    async run(sql, ...params) { const result = await query(sql, ...params); return { changes: result.rowCount ?? result.affectedRows ?? 0 }; },
    async exec(sql) { return onClient((target) => queryClient && target.exec ? target.exec(sql) : target.query(sql)); },
    async insert(table, row) {
      const keys = Object.keys(row);
      const hasId = !['settings', 'sessions', 'attendance', 'policy_acks', 'posh_training'].includes(table);
      const result = await query(`INSERT INTO ${identifier(table)} (${keys.map(identifier).join(',')}) VALUES (${keys.map(() => '?').join(',')})${hasId ? ' RETURNING id' : ''}`, ...keys.map((key) => row[key]));
      return hasId ? result.rows[0].id : null;
    },
    async update(table, id, row) {
      const keys = Object.keys(row);
      if (!keys.length) return;
      await query(`UPDATE ${identifier(table)} SET ${keys.map((key) => `${identifier(key)} = ?`).join(',')} WHERE id = ?`, ...keys.map((key) => row[key]), id);
    },
    async tx(fn) {
      if (context.getStore()?.active) return fn();
      let releaseTest;
      if (queryClient) {
        const previous = testTransactions;
        testTransactions = new Promise((resolve) => { releaseTest = resolve; });
        await previous;
      }
      const client = queryClient || await pool.connect();
      const state = { client, active: true, tail: Promise.resolve(), afterCommit: [] };
      try {
        await client.query('BEGIN');
        const result = await context.run(state, fn);
        await state.tail;
        await client.query('COMMIT');
        state.active = false;
        for (const callback of state.afterCommit) afterCommit(callback);
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { state.active = false; if (!queryClient) client.release(); releaseTest?.(); }
    },
    afterCommit(callback) {
      const state = context.getStore();
      if (state?.active) state.afterCommit.push(callback);
      else afterCommit(callback);
    },
    async exclusive(key, fn) {
      if (queryClient) return fn();
      // A separate connection keeps worker ownership during slow external AI
      // requests without holding the API workflow transaction or its pool slots.
      const lease = new pg.Client({ ...pool.options, application_name: 'hrms-screening-worker' });
      lease.on('error', (error) => console.error('Screening lease connection error:', error.code || error.name));
      await lease.connect();
      try {
        const result = await lease.query('SELECT pg_try_advisory_lock(726418, $1::int) AS acquired', [key]);
        if (!result.rows[0].acquired) return false;
        return await fn();
      } finally { await lease.end(); }
    },
    async close() { if (queryClient) await queryClient.close(); else await pool.end(); },
  };
  try {
    await db.value('SELECT 1');
    if (migrate) {
      const migrations = [
        [1, 'schema.sql'],
        [2, '002-usernames.sql'],
          [3, '003-profile-photos.sql'],
      ];
      await db.tx(async () => {
        await db.exec('SELECT pg_advisory_xact_lock(7264182026)');
        await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
        for (const [version, file] of migrations) {
          if (await db.value('SELECT version FROM schema_migrations WHERE version = ?', version)) continue;
          const sql = await fs.readFile(new URL(`./database/${file}`, import.meta.url), 'utf8');
          await db.exec(sql);
          await db.run('INSERT INTO schema_migrations (version) VALUES (?)', version);
        }
      });
    }
    return db;
  } catch (error) { await db.close(); throw error; }
}
export function json(value, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
