import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, as, client, credentials } from './helpers.js';
import { hashPassword } from '../auth.js';

let ctx;
const resetEmails = [];
let failDelivery = false;
const ADMIN = 'rajiv.malhotra@brainadz.com';
const HR = 'priya.sharma@brainadz.com';
const EMP = 'aarav.mehta@brainadz.com';
before(async () => { ctx = await boot({ passwordResetMailer: { appUrl: 'https://hrms.example.com', send: async (message) => { if (failDelivery) throw new Error('SMTP unavailable'); resetEmails.push(message); } } }); });
after(async () => { await ctx?.close(); });

test('employee requests an admin reset; only admin can issue the one-time password', async () => {
  const anon = client(ctx.base);
  const username = credentials(ctx.base, EMP).username;
  const unknown = await anon.post('/auth/password-reset-request', { username: 'no-such-employee' });
  const requested = await anon.post('/auth/password-reset-request', { username });
  assert.equal(requested.status, 200);
  assert.equal(requested.body.message, unknown.body.message);
  await anon.post('/auth/password-reset-request', { username });

  const admin = await as(ctx.base, ADMIN);
  const hr = await as(ctx.base, HR);
  const employee = await as(ctx.base, EMP);
  const user = await ctx.db.get('SELECT id FROM users WHERE username = ?', username);
  const pending = (await admin.get('/users')).body.passwordRequests;
  assert.equal(pending.filter((request) => request.user_id === user.id).length, 1);
  assert.ok((await admin.get('/notifications')).body.items.some((item) => item.link === '/settings?tab=users'));
  assert.deepEqual((await hr.get('/users')).body.passwordRequests, []);
  assert.equal((await hr.post(`/users/${user.id}/reset`)).status, 403);
  assert.equal((await employee.post(`/users/${user.id}/reset`)).status, 403);
  const reset = await admin.post(`/users/${user.id}/reset`);
  assert.equal(reset.status, 200);
  assert.ok(reset.body.tempPassword);
  assert.equal((await admin.get('/users')).body.passwordRequests.length, 0);
  assert.equal((await employee.get('/auth/me')).status, 401);
  assert.equal((await anon.post('/auth/login', { loginType: 'employee', username, password: 'Brainadz@2026' })).status, 401);
  const signedIn = await as(ctx.base, username, reset.body.tempPassword);
  assert.equal((await signedIn.get('/auth/me')).body.user.mustChangePassword, true);
});

test('admin email recovery sends a private single-use link and revokes old sessions after reset', async () => {
  const uid = await ctx.db.insert('users', { email: 'recovery.admin@example.com', display_name: 'Recovery Admin', role: 'admin', password_hash: hashPassword('Recovery2026') });
  const anon = client(ctx.base);
  const unknown = await anon.post('/auth/password-reset-request', { loginType: 'admin', email: 'unknown.admin@example.com' });
  const requested = await anon.post('/auth/password-reset-request', { loginType: 'admin', email: 'RECOVERY.ADMIN@example.com' });
  assert.equal(requested.status, 200);
  assert.deepEqual(requested.body, unknown.body);
  assert.match(requested.body.message, /reset link/);
  assert.equal((await anon.get('/auth/me')).status, 401);
  await anon.post('/auth/password-reset-request', { loginType: 'admin', email: 'recovery.admin@example.com' });
  assert.equal(resetEmails.length, 1);
  assert.equal(resetEmails[0].to, 'recovery.admin@example.com');
  const link = new URL(resetEmails[0].resetUrl);
  assert.equal(link.origin, 'https://hrms.example.com');
  const token = new URLSearchParams(link.hash.slice(1)).get('token');
  assert.match(token, /^[a-f0-9]{64}$/);
  const stored = await ctx.db.get('SELECT token_hash FROM admin_password_reset_tokens WHERE user_id = ?', uid);
  assert.notEqual(stored.token_hash, token);
  assert.equal(JSON.stringify(requested.body).includes(token), false);
  const oldSession = await as(ctx.base, 'recovery.admin@example.com', 'Recovery2026');
  assert.equal((await anon.post('/auth/password-reset', { token, password: 'short' })).status, 400);
  assert.equal((await anon.post('/auth/password-reset', { token, password: 'UpdatedPassword2026' })).status, 200);
  assert.equal((await oldSession.get('/auth/me')).status, 401);
  assert.equal((await anon.post('/auth/password-reset', { token, password: 'ReusePassword2026' })).status, 400);
  const recovered = await as(ctx.base, 'recovery.admin@example.com', 'UpdatedPassword2026');
  assert.equal((await recovered.get('/auth/me')).body.user.mustChangePassword, false);
  assert.equal((await anon.post('/auth/password-reset-request', { loginType: 'admin', email: 'bad-email' })).status, 400);
});

test('expired admin links and email delivery failures cannot reset a password', async () => {
  const uid = await ctx.db.insert('users', { email: 'expired.admin@example.com', role: 'admin', password_hash: hashPassword('Original2026') });
  const anon = client(ctx.base);
  assert.equal((await anon.post('/auth/password-reset-request', { loginType: 'admin', email: 'expired.admin@example.com' })).status, 200);
  const token = new URLSearchParams(new URL(resetEmails.at(-1).resetUrl).hash.slice(1)).get('token');
  await ctx.db.run('UPDATE admin_password_reset_tokens SET expires_at = ? WHERE user_id = ?', new Date(Date.now() - 1000).toISOString(), uid);
  assert.equal((await anon.post('/auth/password-reset', { token, password: 'Changed2026' })).status, 400);
  await ctx.db.run('DELETE FROM admin_password_reset_tokens WHERE user_id = ?', uid);
  failDelivery = true;
  try {
    assert.equal((await anon.post('/auth/password-reset-request', { loginType: 'admin', email: 'expired.admin@example.com' })).status, 503);
    assert.equal(await ctx.db.value('SELECT COUNT(*) FROM admin_password_reset_tokens WHERE user_id = ?', uid), 0);
  } finally { failDelivery = false; }
  await as(ctx.base, 'expired.admin@example.com', 'Original2026');
});

test('vertical queries scope employee, hiring, leave, resignation and compliance views', async () => {
  const admin = await as(ctx.base, ADMIN);
  const meta = (await admin.get('/meta')).body;
  const live = meta.verticals.find((v) => v.short === 'Live');
  assert.ok(live);
  const query = `?vertical=${live.id}`;
  const employees = await admin.get(`/employees${query}`);
  assert.equal(employees.status, 200);
  assert.ok(employees.body.items.every((e) => e.vertical_id === live.id));
  const dashboard = await admin.get(`/dashboard${query}`);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.kpis.headcount, await ctx.db.value('SELECT COUNT(*) FROM employees WHERE vertical_id = ? AND join_date <= ? AND (exit_date IS NULL OR exit_date >= ?)', live.id, meta.today, meta.today));
  assert.ok(dashboard.body.managers.every((m) => m.team > 0));
  const hiring = await admin.get(`/hiring${query}`);
  assert.equal(hiring.status, 200);
  assert.ok(hiring.body.jobs.every((j) => j.vertical_id === live.id));
  assert.ok(hiring.body.onboarding.every((e) => e.vertical === live.short));
  const screener = await admin.get(`/screener${query}`);
  assert.equal(screener.status, 200);
  assert.ok(screener.body.jobs.every((j) => j.vertical_id === live.id));
  const leave = await admin.get(`/leave/requests?scope=all&vertical=${live.id}`);
  assert.equal(leave.status, 200);
  assert.ok(leave.body.items.every((r) => r.vertical === live.short));
  const resignations = await admin.get(`/resignations${query}`);
  assert.equal(resignations.status, 200);
  assert.ok(resignations.body.items.every((r) => r.vertical === live.short));
  const posh = await admin.get(`/posh${query}`);
  assert.equal(posh.status, 200);
  assert.equal(posh.body.stats.headcount, dashboard.body.kpis.headcount);
});
