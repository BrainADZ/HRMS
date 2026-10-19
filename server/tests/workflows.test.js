import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, as, client, credentials } from './helpers.js';
import { addMonths } from '../lib/dates.js';

let ctx;
const ADMIN = 'rajiv.malhotra@brainadz.com';
const HR = 'priya.sharma@brainadz.com';
const EMP = 'aarav.mehta@brainadz.com';
before(async () => { ctx = await boot(); });
after(async () => { await ctx?.close(); });

test('only administrators use email; employees, HR and managers use case-insensitive usernames', async () => {
  const anon = client(ctx.base);
  for (const email of [HR, EMP, 'vikram.patel@brainadz.com']) {
    assert.equal((await anon.post('/auth/login', { email, password: 'Brainadz@2026' })).status, 401);
    const who = credentials(ctx.base, email);
    const user = await client(ctx.base).post('/auth/login', { ...who, username: who.username.toUpperCase(), password: 'Brainadz@2026' });
    assert.equal(user.status, 200);
  }
  assert.equal((await anon.post('/auth/login', { email: ADMIN.toUpperCase(), password: 'Brainadz@2026' })).status, 200);
  assert.equal((await anon.post('/auth/login', { username: ADMIN, password: 'Brainadz@2026' })).status, 401);
  assert.equal((await client(ctx.base).raw('GET', '/auth/me', undefined, { headers: { Cookie: 'hrms_session=%invalid' } })).status, 401);
});

test('new employee credentials, first-login gate, session rotation, rename and role transitions work together', async () => {
  const admin = await as(ctx.base, ADMIN);
  const adminEmployeeId = (await admin.get('/auth/me')).body.user.employeeId;
  assert.equal((await admin.post(`/employees/${adminEmployeeId}/login`, { role: 'employee' })).status, 400);
  const today = (await admin.get('/meta')).body.today;
  const made = await admin.post('/employees', { first_name: 'Login Test', email: 'login.test@example.com', join_date: today, create_login: true });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const profile = (await admin.get(`/employees/${made.body.id}`)).body;
  assert.equal(made.body.username, `logintest${profile.employee.code.toLowerCase()}`);
  const user = await as(ctx.base, made.body.username, made.body.tempPassword);
  assert.equal((await user.get('/employees')).status, 403);
  assert.equal((await user.post('/auth/change-password', { current: made.body.tempPassword, next: 'NewPassword2026' })).status, 200);
  const raw = await fetch(ctx.base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hrms' }, body: JSON.stringify({ username: made.body.username, password: 'NewPassword2026' }) });
  const staleCookie = raw.headers.get('set-cookie').split(';')[0];
  assert.equal((await user.post('/auth/change-password', { current: 'NewPassword2026', next: 'NextPassword2026' })).status, 200);
  assert.equal((await fetch(ctx.base + '/auth/me', { headers: { Cookie: staleCookie } })).status, 401);
  assert.equal((await admin.put(`/employees/${made.body.id}`, { first_name: 'Renamed' })).status, 200);
  const changed = (await admin.get(`/employees/${made.body.id}`)).body.login;
  assert.equal(changed.username, `renamed${profile.employee.code.toLowerCase()}`);
  assert.equal((await client(ctx.base).post('/auth/login', { username: made.body.username, password: 'NextPassword2026' })).status, 401);
  await as(ctx.base, changed.username, 'NextPassword2026');
  assert.equal((await admin.put(`/users/${changed.id}`, { role: 'admin' })).status, 200);
  assert.equal((await user.get('/auth/me')).status, 401);
  const promoted = await as(ctx.base, 'login.test@example.com', 'NextPassword2026');
  assert.equal((await promoted.get('/auth/me')).body.user.username, null);
  assert.equal((await admin.put(`/users/${changed.id}`, { role: 'employee' })).status, 200);
  assert.equal((await promoted.get('/auth/me')).status, 401);
  const reset = await admin.post(`/users/${changed.id}/reset`);
  assert.equal(reset.body.username, changed.username);
  const resetUser = await as(ctx.base, reset.body.username, reset.body.tempPassword);
  assert.equal((await resetUser.get('/meta')).status, 403);
});

test('bulk logins and candidate conversion return generated usernames', async () => {
  const hr = await as(ctx.base, HR);
  const today = (await hr.get('/meta')).body.today;
  const employee = await hr.post('/employees', { first_name: 'Bulk', email: 'bulk@example.com', join_date: today, create_login: false });
  assert.equal(employee.status, 200);
  const csv = await hr.post('/users/bulk-create');
  assert.equal(csv.status, 200);
  assert.match(csv.body, /Username/);
  const bulk = await ctx.db.get('SELECT username FROM users WHERE employee_id = ?', employee.body.id);
  assert.ok(csv.body.includes(bulk.username));
  const job = await hr.post('/jobs', { title: 'Username integration role' });
  assert.equal(job.status, 200);
  const candidate = await hr.post('/candidates', { job_id: job.body.id, name: 'Candidate Tester', email: 'candidate@example.com' });
  assert.equal(candidate.status, 200);
  const assigned = (await ctx.db.get('SELECT employee_id FROM users WHERE email = ?', EMP)).employee_id;
  const other = (await ctx.db.get("SELECT employee_id FROM users WHERE email = 'vikram.patel@brainadz.com'")).employee_id;
  const at = `${today}T14:00`;
  assert.equal((await hr.post('/interviews', { candidate_id: candidate.body.id, scheduled_at: `${today}T25:99` })).status, 400);
  const interview = await hr.post('/interviews', { candidate_id: candidate.body.id, scheduled_at: at, interviewer_id: assigned });
  assert.equal(interview.status, 200);
  const second = await hr.post('/interviews', { candidate_id: candidate.body.id, scheduled_at: at, interviewer_id: other });
  assert.equal(second.status, 200);
  const employeeInterviewer = await as(ctx.base, EMP);
  assert.equal((await employeeInterviewer.put(`/interviews/${second.body.id}`, { status: 'Cancelled' })).status, 403);
  assert.equal((await employeeInterviewer.put(`/interviews/${interview.body.id}`, { scheduled_at: 'invalid' })).status, 400);
  assert.equal((await employeeInterviewer.put(`/interviews/${interview.body.id}`, { status: 'Completed', rating: 4, recommendation: 'Hire' })).status, 200);
  assert.equal((await hr.post(`/candidates/${candidate.body.id}/hire`, { join_date: today, email: 'hired@example.com', create_login: true })).status, 409);
  assert.equal((await hr.post(`/candidates/${candidate.body.id}/offer`, { offer_ctc: 6, joining_date: today })).status, 200);
  assert.equal((await hr.post(`/candidates/${candidate.body.id}/offer-status`, { status: 'Accepted' })).status, 200);
  const hired = await hr.post(`/candidates/${candidate.body.id}/hire`, { join_date: today, email: 'hired@example.com', create_login: true });
  assert.equal(hired.status, 200, JSON.stringify(hired.body));
  assert.match(hired.body.username, /^candidatebz\d+$/);
  await as(ctx.base, hired.body.username, hired.body.tempPassword);
  assert.equal((await hr.post(`/candidates/${candidate.body.id}/hire`, { join_date: today })).status, 409);
  assert.equal((await hr.post(`/candidates/${candidate.body.id}/move`, { stage: 'Rejected' })).status, 409);
  assert.equal((await hr.post(`/candidates/${candidate.body.id}/offer`, { offer_ctc: 8 })).status, 409);
  assert.equal((await hr.post(`/candidates/${candidate.body.id}/offer-status`, { status: 'Declined' })).status, 409);
  assert.equal((await hr.post(`/screener/candidates/${candidate.body.id}/action`, { action: 'reject' })).status, 409);
});

test('HR adjustments recompute draft payroll and invalidate finance review; approved inputs are locked', async () => {
  const hr = await as(ctx.base, HR);
  const admin = await as(ctx.base, ADMIN);
  const emp = await as(ctx.base, EMP);
  const employeeId = (await emp.get('/auth/me')).body.user.employeeId;
  const month = addMonths((await hr.get('/meta')).body.today.slice(0, 7), 1);
  const adj = await hr.post('/payroll/adjustments', { employee_id: employeeId, month, kind: 'Bonus', amount: 500 });
  assert.equal(adj.status, 200);
  const run = await hr.post('/payroll/runs', { month });
  assert.equal(run.status, 200);
  assert.equal((await hr.post(`/payroll/runs/${run.body.id}/approve`, { stage: 'finance' })).status, 200);
  assert.equal((await hr.put(`/payroll/adjustments/${adj.body.id}`, { status: 'Approved' })).status, 200);
  const payroll = (await hr.get(`/payroll?month=${month}`)).body;
  assert.equal(payroll.run.status, 'In Review');
  assert.equal(payroll.lines.find((line) => line.employeeId === employeeId).payslip.earnings.bonus, 500);
  assert.equal((await hr.post(`/payroll/runs/${run.body.id}/approve`, { stage: 'finance' })).status, 200);
  assert.equal((await admin.post(`/payroll/runs/${run.body.id}/approve`, { stage: 'management' })).status, 200);
  assert.equal((await hr.put(`/payroll/adjustments/${adj.body.id}`, { status: 'Rejected' })).status, 409);
  assert.equal((await hr.del(`/payroll/adjustments/${adj.body.id}`)).status, 409);
  assert.equal((await hr.post('/payroll/adjustments', { employee_id: employeeId, month, amount: 100 })).status, 409);
});

test('performance APIs enforce cycle state and self-before-manager review', async () => {
  const hr = await as(ctx.base, HR);
  const employee = await as(ctx.base, EMP);
  const eid = (await employee.get('/auth/me')).body.user.employeeId;
  const rv = await ctx.db.get('SELECT * FROM reviews WHERE employee_id = ? ORDER BY id DESC LIMIT 1', eid);
  const originalCycle = await ctx.db.value('SELECT status FROM review_cycles WHERE id = ?', rv.cycle_id);
  try {
    await ctx.db.update('reviews', rv.id, { status: 'Not Started' });
    await ctx.db.update('review_cycles', rv.cycle_id, { status: 'Closed' });
    assert.equal((await employee.post(`/performance/reviews/${rv.id}/self`, { rating: 4 })).status, 409);
    assert.equal((await hr.post(`/performance/reviews/${rv.id}/manager`, { rating: 4 })).status, 409);
    await ctx.db.update('review_cycles', rv.cycle_id, { status: 'Active' });
    assert.equal((await hr.post(`/performance/reviews/${rv.id}/manager`, { rating: 4 })).status, 409);
    assert.equal((await employee.post(`/performance/reviews/${rv.id}/self`, { rating: 4 })).status, 200);
    assert.equal((await hr.post(`/performance/reviews/${rv.id}/manager`, { rating: 4 })).status, 200);
    assert.equal((await employee.get(`/performance/reviews/${rv.id}`)).body.review.status, 'Completed');
  } finally {
    await ctx.db.update('reviews', rv.id, { status: rv.status, self_rating: rv.self_rating, manager_rating: rv.manager_rating, final_rating: rv.final_rating });
    await ctx.db.update('review_cycles', rv.cycle_id, { status: originalCycle });
  }
});

test('policies, confidential POSH complaints, assets and helpdesk complete their main workflows', async () => {
  const admin = await as(ctx.base, ADMIN);
  const hr = await as(ctx.base, HR);
  const employee = await as(ctx.base, EMP);
  const eid = (await employee.get('/auth/me')).body.user.employeeId;
  const policy = await hr.post('/policies', { title: 'Integration test policy', content: 'Policy details', version: '1.0', requires_ack: true });
  assert.equal(policy.status, 200);
  assert.equal((await employee.post(`/policies/${policy.body.id}/ack`)).status, 200);
  const complaint = await employee.post('/posh/complaints', { description: 'Confidential integration test complaint', anonymous: true });
  assert.equal(complaint.status, 200);
  const cases = (await admin.get('/posh')).body.complaints;
  const row = cases.find((c) => c.ref_no === complaint.body.ref);
  assert.ok(row);
  assert.equal(row.complainant_id, null);
  assert.equal((await employee.put(`/posh/complaints/${row.id}`, { status: 'Closed' })).status, 403);
  assert.equal((await admin.put(`/posh/complaints/${row.id}`, { status: 'Under Inquiry', note: 'Case reviewed' })).status, 200);
  const asset = await hr.post(`/employees/${eid}/assets`, { type: 'Laptop', name: 'Integration device', serial: 'TEST-ONLY' });
  assert.equal(asset.status, 200);
  assert.equal((await employee.put(`/assets/${asset.body.id}`, { status: 'Returned' })).status, 403);
  assert.equal((await hr.put(`/assets/${asset.body.id}`, { status: 'Returned' })).status, 200);
  assert.equal((await hr.del(`/assets/${asset.body.id}`)).status, 200);
  const request = await employee.post('/requests', { category: 'IT', subject: 'Integration support request' });
  assert.equal(request.status, 200);
  assert.equal((await hr.put(`/requests/${request.body.id}`, { status: 'Resolved', response: 'Completed' })).status, 200);
  assert.equal((await employee.get('/requests')).body.items.find((r) => r.id === request.body.id).status, 'Resolved');
  assert.equal((await hr.del(`/policies/${policy.body.id}`)).status, 200);
});

test('every static GET API and CSV export responds for the administrator', async () => {
  const admin = await as(ctx.base, ADMIN);
  const endpoints = new Set();
  for (const file of fs.readdirSync(new URL('../routes/', import.meta.url))) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(new URL(`../routes/${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/r\.get\('([^']+)'/g)) if (!match[1].includes(':')) endpoints.add(match[1]);
  }
  assert.ok(endpoints.size >= 40);
  for (const endpoint of endpoints) {
    const result = await admin.get(endpoint);
    assert.equal(result.status, 200, `${endpoint}: ${JSON.stringify(result.body).slice(0, 200)}`);
  }
});
