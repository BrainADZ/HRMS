import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, as } from './helpers.js';
import { CHECKLIST } from '../routes/resignations.js';
import { salaryStructure } from '../lib/payroll.js';
import { DEFAULT_SETTINGS } from '../core.js';
import { addDays } from '../lib/dates.js';

let ctx, hr, admin, employee, ceo, eid, today;
before(async () => {
  ctx = await boot();
  hr = await as(ctx.base, 'priya.sharma@brainadz.com');
  admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
  employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
  ceo = (await admin.get('/auth/me')).body.user.employeeId;
  eid = (await employee.get('/auth/me')).body.user.employeeId;
  today = (await admin.get('/meta')).body.today;
});
after(async () => { await ctx?.close(); });

test('failed settings updates roll back all fields, including invalid CTC allocations', async () => {
  const before = await ctx.db.value("SELECT value FROM settings WHERE key='companyName'");
  assert.equal((await hr.put('/settings', { companyName: 'Must not persist', workHours: 999 })).status, 400);
  assert.equal(await ctx.db.value("SELECT value FROM settings WHERE key='companyName'"), before);
  assert.equal((await hr.put('/settings', { companyName: 'Must not persist either', payroll: { basicPct: 100, hraPct: 100 } })).status, 400);
  assert.equal(await ctx.db.value("SELECT value FROM settings WHERE key='companyName'"), before);
  assert.throws(() => salaryStructure(1200000, { ...DEFAULT_SETTINGS.payroll, basicPct: 100, hraPct: 100 }), /CTC/);
  for (const annual of [1, 13, 101, 1200000]) {
    const s = salaryStructure(annual, DEFAULT_SETTINGS.payroll);
    assert.ok(s.gross + s.employerPf <= s.monthlyCtc, JSON.stringify(s));
  }
});

test('HR cannot disable an administrator through profile edits or offboarding', async () => {
  assert.equal((await hr.put(`/employees/${ceo}`, { status: 'Exited', exit_date: today })).status, 403);
  assert.equal((await admin.put(`/employees/${ceo}`, { status: 'Exited', exit_date: today })).status, 400);
  const rid = await ctx.db.insert('resignations', { employee_id: ceo, submitted_on: today, reason_category: 'Other', notice_days: 0, last_working_day: today, status: 'In Progress' });
  assert.equal((await hr.put(`/resignations/${rid}/checklist`, { key: 'access_revocation', status: 'Completed' })).status, 403);
  assert.equal((await hr.post(`/resignations/${rid}/complete`)).status, 403);
  assert.equal((await admin.get('/auth/me')).status, 200);
});

test('only administrators appoint ICC members; confidential case access follows membership', async () => {
  assert.equal((await admin.put('/posh/icc', { presidingOfficerId: null, memberIds: [] })).status, 200);
  assert.equal((await hr.get('/posh')).body.canSeeCases, false);
  const hid = (await hr.get('/auth/me')).body.user.employeeId;
  assert.equal((await hr.put('/posh/icc', { presidingOfficerId: hid })).status, 403);
  assert.equal((await hr.get('/posh')).body.canSeeCases, false);
  assert.equal((await admin.put('/posh/icc', { memberIds: [999999] })).status, 400);
  assert.equal((await admin.put('/posh/icc', { presidingOfficerId: hid, memberIds: [] })).status, 200);
  assert.equal((await hr.get('/posh')).body.canSeeCases, true);
});

test('unauthorized and invalid uploads leave no files or database documents', async () => {
  const folder = path.join(ctx.dir, 'uploads', 'documents');
  const before = fs.readdirSync(folder).length;
  const form = new FormData(); form.append('file', new Blob(['valid plain text']), 'file.txt');
  assert.equal((await employee.post(`/employees/${ceo}/documents`, undefined, { form })).status, 403);
  const fake = new FormData(); fake.append('file', new Blob(['not a PDF']), 'fake.pdf');
  assert.equal((await employee.post(`/employees/${eid}/documents`, undefined, { form: fake })).status, 400);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fs.readdirSync(folder).length, before);
});

test('approved payroll holds are frozen and reviewed holds invalidate finance approval', async () => {
  const run = await ctx.db.get("SELECT * FROM payroll_runs WHERE status='Completed' ORDER BY id DESC LIMIT 1");
  const slip = await ctx.db.get('SELECT * FROM payslips WHERE run_id=? LIMIT 1', run.id);
  await ctx.db.update('payroll_runs', run.id, { status: 'Approved' });
  assert.equal((await hr.put(`/payroll/payslips/${slip.id}/hold`, { hold: true })).status, 409);
  assert.equal(await ctx.db.value('SELECT status FROM payslips WHERE id=?', slip.id), slip.status);
  await ctx.db.update('payroll_runs', run.id, { status: 'Finance Reviewed', approvals: [{ stage: 'Finance Review' }] });
  assert.equal((await hr.put(`/payroll/payslips/${slip.id}/hold`, { hold: true })).status, 200);
  assert.equal(await ctx.db.value('SELECT status FROM payroll_runs WHERE id=?', run.id), 'In Review');
});

test('exit requires clearances, paid settlement and returned assets before atomic completion', async () => {
  const made = await hr.post('/employees', { first_name: 'Exit Test', email: 'exit.test@example.com', join_date: today });
  assert.equal(made.status, 200);
  const id = made.body.id;
  const checklist = Object.fromEntries(CHECKLIST.map(([key]) => [key, { status: 'Completed' }]));
  const rid = await ctx.db.insert('resignations', { employee_id: id, submitted_on: today, reason_category: 'Other', notice_days: 0, last_working_day: today, status: 'In Progress', checklist });
  assert.equal((await hr.post(`/resignations/${rid}/complete`)).status, 400);
  for (const key of ['manager', 'it', 'admin', 'finance']) assert.equal((await hr.put(`/resignations/${rid}/clearance`, { key, status: 'Approved' })).status, 200);
  assert.equal((await hr.post(`/resignations/${rid}/complete`)).status, 400);
  assert.equal((await hr.post(`/resignations/${rid}/settlement`, { amount: 0, paid_on: today })).status, 200);
  assert.equal((await hr.post(`/resignations/${rid}/complete`)).status, 200);
  assert.equal(await ctx.db.value('SELECT status FROM employees WHERE id=?', id), 'Exited');
  assert.equal((await hr.post(`/resignations/${rid}/settlement`, { amount: 99, paid_on: today })).status, 409);
});

test('parallel employee creation allocates unique codes and overlapping leave commits only once', async () => {
  const created = await Promise.all([1, 2, 3].map((n) => hr.post('/employees', { first_name: 'Concurrent', email: `concurrent${n}@example.com`, join_date: today, create_login: false })));
  for (const result of created) assert.equal(result.status, 200, JSON.stringify(result.body));
  const codes = await Promise.all(created.map((result) => ctx.db.value('SELECT code FROM employees WHERE id=?', result.body.id)));
  assert.equal(new Set(codes).size, 3);
  const type = await ctx.db.value('SELECT id FROM leave_types WHERE annual_quota IS NULL AND active=1 LIMIT 1');
  assert.ok(type);
  let body;
  for (let days = 7; days < 30; days++) {
    body = { employee_id: created[0].body.id, leave_type_id: type, from_date: addDays(today, days), reason: 'Concurrency regression' };
    if ((await hr.post('/leave/preview', body)).body.ok) break;
  }
  const results = await Promise.all([hr.post('/leave/requests', body), hr.post('/leave/requests', body)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const request = results.find((result) => result.status === 200).body.id;
  const decisions = await Promise.all(['approve', 'reject'].map((action) => hr.post(`/leave/requests/${request}/decision`, { action })));
  assert.deepEqual(decisions.map((result) => result.status).sort(), [200, 409]);
});
