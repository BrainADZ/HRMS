import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import pg from 'pg';
import crypto from 'node:crypto';
import { postgresConfig } from '../server/db.js';

const fixtures = new Map();
export function credentials(base, identifier) {
  const user = fixtures.get(base)?.find((u) => u.email === identifier);
  if (user) return user.role === 'admin' ? { loginType: 'admin', email: user.email } : { loginType: 'employee', username: user.username };
  return String(identifier).includes('@') ? { loginType: 'admin', email: identifier } : { loginType: 'employee', username: identifier };
}

// Boots an app on a random port with a fresh demo database in a temp dir.
export async function boot({ serveClient = false, clientOrigin } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrms-test-'));
  let cleanup = async () => {};
  let database;
  if (process.env.HRMS_TEST_POSTGRES === '1') {
    const config = postgresConfig();
    const owner = new pg.Pool(config);
    const schema = `hrms_test_${crypto.randomBytes(8).toString('hex')}`;
    await owner.query(`CREATE SCHEMA ${schema}`);
    cleanup = async () => { try { await owner.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await owner.end(); } };
    try { database = await openDb({ pool: new pg.Pool({ ...config, options: `-c search_path=${schema}`, max: 4 }) }); }
    catch (error) { await cleanup(); throw error; }
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    database = await openDb({ queryClient: new PGlite() });
  }
  const { app, db, close: closeApp } = await createApp({ database, dataDir: dir, serveClient, clientOrigin });
  const server = await new Promise((resolve) => {const s = app.listen(0, () => resolve(s));});
  const base = `http://127.0.0.1:${server.address().port}/api`;
  fixtures.set(base, await db.all('SELECT email, username, role FROM users'));
  const close = async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeApp();
    await cleanup();
    fixtures.delete(base);
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { base, db, dir, close };
}

export function client(base) {
  let cookie = '';
  const call = async (method, p, body, { form, headers = {} } = {}) => {
    const h = { 'X-Requested-With': 'hrms', ...headers };
    if (cookie) h.Cookie = cookie;
    let payload;
    if (form) payload = form;else
    if (body !== undefined) {h['Content-Type'] = 'application/json';payload = JSON.stringify(body);}
    const res = await fetch(base + p, { method, headers: h, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return {
    get: async (p) => await call('GET', p),
    post: async (p, b = {}, o) => await call('POST', p, b, o),
    put: async (p, b = {}) => await call('PUT', p, b),
    del: async (p) => await call('DELETE', p),
    raw: call,
    async login(email, password = 'Brainadz@2026') {
      const r = await call('POST', '/auth/login', { ...credentials(base, email), password });
      if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
      return this;
    }
  };
}

export const as = (base, email, password) => client(base).login(email, password);
