import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, as, client, credentials } from './helpers.js';
import { workDate, shiftEnd, closeStaleSessions } from '../server/services/workday.js';
import { addDays, zonedIso, isLateCheckIn } from '../server/lib/dates.js';
import { getSettings } from '../server/core.js';
import { verifyPassword } from '../server/auth.js';
import { calculateSettlement } from '../server/lib/settlement.js';

let ctx, hr, employee, manager, admin, eid, day;
before(async () => {
  ctx = await boot();
  hr = await as(ctx.base, 'priya.sharma@brainadz.com');
  employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
  manager = await as(ctx.base, 'nandini.joshi@brainadz.com');
  admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
  eid = (await employee.get('/auth/me')).body.user.employeeId;
  day = (await admin.get('/meta')).body.today;
});
after(async () => { await ctx?.close(); });

test('malformed stored hashes fail safely', () => {
  for (const hash of [null, '', 'scrypt$x$00', 'scrypt$' + 'aa'.repeat(16) + '$' + 'aa'.repeat(100000)]) assert.equal(verifyPassword('test', hash), false);
});

test('overnight shift survives midnight and closes at next-day shift end', async () => {
  const settings = { ...(await getSettings(ctx.db)), workdayStart: '22:00', workdayEnd: '06:00', timezone: 'Asia/Kolkata' };
  const previous = addDays(day, -1);
  assert.equal(workDate(day, settings, zonedIso(day, '03:00', settings.timezone)), previous);
  assert.equal(workDate(day, settings, zonedIso(day, '07:00', settings.timezone)), day);
  assert.equal(shiftEnd(previous, settings), zonedIso(day, '06:00', settings.timezone));
  assert.equal(isLateCheckIn(zonedIso(day, '00:15', settings.timezone), previous, { ...settings, lateAfter: '00:30' }), false);
  assert.equal(isLateCheckIn(zonedIso(day, '00:45', settings.timezone), previous, { ...settings, lateAfter: '00:30' }), true);
  await ctx.db.run('DELETE FROM work_sessions WHERE employee_id=?', eid);
  await ctx.db.run('DELETE FROM attendance WHERE employee_id=?', eid);
  const sid = await ctx.db.insert('work_sessions', { employee_id: eid, date: previous, start_at: zonedIso(previous, '22:00', settings.timezone), mode: 'office' });
  await closeStaleSessions(ctx.db, day, settings, zonedIso(day, '03:00', settings.timezone));
  assert.equal(await ctx.db.value('SELECT end_at FROM work_sessions WHERE id=?', sid), null);
  await closeStaleSessions(ctx.db, day, settings, zonedIso(day, '07:00', settings.timezone));
  assert.equal(await ctx.db.value('SELECT end_at FROM work_sessions WHERE id=?', sid), shiftEnd(previous, settings));
});

test('corrections require another authorised approver, prevent duplicate/stale approvals and persist status', async () => {
  const date = addDays(day, -2);
  const request = await employee.post('/attendance/corrections', { date, status: 'WFH', reason: 'Approved client work from home' });
  assert.equal(request.status, 200, JSON.stringify(request.body));
  assert.equal((await employee.post('/attendance/corrections', { date, status: 'P', reason: 'Duplicate' })).status, 409);
  assert.equal((await employee.post(`/attendance/corrections/${request.body.id}/decision`, { action: 'approve' })).status, 403);
  assert.equal((await manager.post(`/attendance/corrections/${request.body.id}/decision`, { action: 'approve' })).status, 200);
  assert.equal(await ctx.db.value('SELECT status FROM attendance WHERE employee_id=? AND date=?', eid, date), 'WFH');
  assert.equal((await hr.post(`/attendance/corrections/${request.body.id}/decision`, { action: 'approve' })).status, 409);
  const otherDay = addDays(day, -3);
  const second = await employee.post('/attendance/corrections', { date: otherDay, status: 'P', reason: 'Missing mark' });
  assert.equal((await hr.put('/attendance', { employee_id: eid, date: otherDay, status: 'HD' })).status, 200);
  assert.equal((await manager.post(`/attendance/corrections/${second.body.id}/decision`, { action: 'approve' })).status, 409);
  assert.equal((await manager.post(`/attendance/corrections/${second.body.id}/decision`, { action: 'reject', note: 'Please submit current details' })).status, 200);
});

test('attendance changes invalidate prepared payroll; approved payroll blocks historical corrections', async () => {
  const month = day.slice(0, 7);
  const date = addDays(day, -1);
  const run = await hr.post('/payroll/runs', { month });
  assert.equal(run.status, 200);
  const rid = await ctx.db.value('SELECT id FROM payroll_runs WHERE month=?', month);
  assert.equal((await hr.post(`/payroll/runs/${rid}/approve`, { stage: 'finance' })).status, 200);
  assert.equal((await hr.put('/attendance', { employee_id: eid, date, status: 'P' })).status, 200);
  assert.equal((await hr.post(`/payroll/runs/${rid}/approve`, { stage: 'finance' })).status, 409);
  assert.equal(await ctx.db.value('SELECT status FROM payroll_runs WHERE id=?', rid), 'In Review');
  assert.equal((await hr.post('/payroll/runs', { month })).status, 200);
  assert.equal((await hr.post(`/payroll/runs/${rid}/approve`, { stage: 'finance' })).status, 200);
  assert.equal((await admin.post(`/payroll/runs/${rid}/approve`, { stage: 'management' })).status, 200);
  assert.equal((await hr.put('/attendance', { employee_id: eid, date, status: 'A' })).status, 409);
});

test('managers cannot see confidential documents or exit settlement; letters require issue after completion', async () => {
  const profile = (await manager.get(`/employees/${eid}`)).body;
  assert.deepEqual(profile.documents, []);
  const rid = await ctx.db.insert('resignations', { employee_id: eid, submitted_on: day, reason_category: 'Other', notice_days: 0, last_working_day: day, status: 'In Progress', settlement: { amount: 12345, paidOn: day }, exit_interview: { feedback: 'Private feedback' } });
  const detail = (await manager.get(`/resignations/${rid}`)).body;
  assert.equal(detail.settlement, null);
  assert.equal(detail.exit_interview, null);
  assert.equal((await hr.put(`/resignations/${rid}/rehire`, { experience: true })).status, 409);
  const settlement = await hr.post(`/resignations/${rid}/settlement`, { components: { earnedSalary: 10000, leaveEncashment: 2500, recoveries: 500 }, amount: 1 });
  assert.equal(settlement.status, 200, JSON.stringify(settlement.body));
  assert.equal(JSON.parse(await ctx.db.value('SELECT settlement FROM resignations WHERE id=?', rid)).amount, 12000);
  assert.equal((await employee.get(`/resignations/${rid}/letters/experience`)).status, 409);
  await ctx.db.update('resignations', rid, { status: 'Completed' });
  assert.equal((await hr.put(`/resignations/${rid}/rehire`, { experience: true })).status, 200);
  const letter = await employee.get(`/resignations/${rid}/letters/experience`);
  assert.equal(letter.status, 200);
  assert.equal(letter.body.issuedOn, day);
  assert.equal(letter.body.settlement.amount, undefined);
  assert.equal((await manager.get(`/resignations/${rid}/letters/experience`)).status, 403);
});

test('settlement components use server arithmetic and validate recoveries', () => {
  assert.equal(calculateSettlement({ earnedSalary: 10000.45, leaveEncashment: 2000.25, recoveries: 300.1 }).amount, 11700.6);
  assert.throws(() => calculateSettlement({ earnedSalary: 100, recoveries: 200 }), /Net settlement/);
  assert.throws(() => calculateSettlement({ gratuity: -1 }), /Invalid/);
});

test('report filters reconcile summary, vertical counts and scoped CSV', async () => {
  const report = await hr.get(`/reports/summary?employee=${eid}&as_of=${day}`);
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.equal(report.body.headcount, 1);
  assert.equal(report.body.byVertical.reduce((sum, row) => sum + row.value, 0), 1);
  const csv = await hr.get(`/employees/export.csv?employee=${eid}`);
  assert.equal(csv.body.trim().split('\n').length, 2);
  assert.equal((await hr.get('/reports/summary?department=invalid')).status, 400);
  assert.equal((await employee.get('/reports/summary')).status, 403);
});

test('expired sessions fail on every device; production hides and rejects shared demo logins', async () => {
  const second = await as(ctx.base, 'aarav.mehta@brainadz.com');
  const uid = (await second.get('/auth/me')).body.user.id;
  assert.ok((await second.get('/auth/me')).body.sessionExpiresAt);
  await ctx.db.run('UPDATE sessions SET expires_at=? WHERE user_id=?', '2000-01-01T00:00:00.000Z', uid);
  assert.equal((await second.get('/auth/me')).status, 401);
  assert.equal((await employee.get('/auth/me')).status, 401);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const anon = client(ctx.base);
    assert.deepEqual((await anon.get('/auth/config')).body.demoAccounts, []);
    assert.equal((await anon.post('/auth/login', { ...credentials(ctx.base, 'aarav.mehta@brainadz.com'), password: 'Brainadz@2026' })).status, 403);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('mixed-role concurrent reads remain consistent under a local smoke load', async () => {
  const users = await Promise.all(['aarav.mehta@brainadz.com', 'nandini.joshi@brainadz.com', 'priya.sharma@brainadz.com', 'rajiv.malhotra@brainadz.com'].map((email) => as(ctx.base, email)));
  const started = performance.now();
  const responses = await Promise.all(Array.from({ length: 48 }, (_, index) => users[index % 4].get(index % 2 ? '/employees?pageSize=5' : '/auth/me')));
  assert.ok(responses.every((response) => response.status === 200));
  console.log(`Local smoke load: 48 mixed-role requests, ${Math.round(performance.now() - started)} ms, no errors`);
});
