import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';
import { today, setSetting } from '../core.js';
import { addDays, dow, zonedIso } from '../lib/dates.js';
import { dayStatuses } from '../services/calendar.js';
import { reconcileMissedAttendance, pendingAbsences } from '../services/missed-attendance.js';

let ctx;
before(async () => {
  ctx = await boot();
});
after(async () => {
  await ctx?.close();
});

test('a finalized payroll month still requires a missing-day reason without rewriting its attendance or payroll', async () => {
  const employee = await ctx.db.get(
    "SELECT * FROM employees WHERE email='aarav.mehta@brainadz.com'",
  );
  const run = await ctx.db.get('SELECT * FROM payroll_runs ORDER BY month DESC LIMIT 1');
  assert.ok(run);
  let missed = run.month + '-15';
  while ([0, 6].includes(dow(missed))) missed = addDays(missed, -1);
  await setSetting(ctx.db, 'weeklyOffs', [0, 6]);
  await ctx.db.run("UPDATE payroll_runs SET status='Approved' WHERE id=?", run.id);
  const before = await ctx.db.get('SELECT * FROM payroll_runs WHERE id=?', run.id);
  await ctx.db.run('DELETE FROM holidays WHERE date=?', missed);
  await ctx.db.run(
    'DELETE FROM leave_requests WHERE employee_id=? AND from_date<=? AND to_date>=?',
    employee.id,
    missed,
    missed,
  );
  for (const table of ['work_sessions', 'attendance', 'hour_shortfalls'])
    await ctx.db.run(
      'DELETE FROM ' + table + ' WHERE employee_id=? AND date=?',
      employee.id,
      missed,
    );
  await reconcileMissedAttendance(ctx.db, {
    employeeIds: [employee.id],
    from: missed,
    through: missed,
    notify: false,
  });
  assert.equal(
    await ctx.db.get(
      'SELECT * FROM attendance WHERE employee_id=? AND date=?',
      employee.id,
      missed,
    ),
    undefined,
  );
  assert.ok((await pendingAbsences(ctx.db, employee.id)).some((row) => row.date === missed));
  assert.deepEqual(await ctx.db.get('SELECT * FROM payroll_runs WHERE id=?', run.id), before);
  await ctx.db.run(
    "UPDATE hour_shortfalls SET status='Approved',reason='Locked-month fixture explained' WHERE employee_id=? AND date=?",
    employee.id,
    missed,
  );
});

test('an untouched past working day is Absent and check-in cannot skip its reason', async () => {
  const employee = await ctx.db.get(
    "SELECT * FROM employees WHERE email='aarav.mehta@brainadz.com'",
  );
  const day = await today(ctx.db),
    missed = Array.from({ length: 7 }, (_, i) => addDays(day, -i - 1)).find(
      (d) => ![0, 6].includes(dow(d)),
    );
  await setSetting(ctx.db, 'weeklyOffs', [0, 6]);
  await ctx.db.run("UPDATE payroll_runs SET status='In Review'");
  await ctx.db.run('DELETE FROM holidays WHERE date=?', missed);
  await ctx.db.run(
    'DELETE FROM leave_requests WHERE employee_id=? AND from_date<=? AND to_date>=?',
    employee.id,
    missed,
    missed,
  );
  for (const table of ['work_sessions', 'attendance', 'hour_shortfalls'])
    await ctx.db.run(
      'DELETE FROM ' + table + ' WHERE employee_id=? AND date>=?',
      employee.id,
      missed,
    );
  const user = await as(ctx.base, employee.email);
  let register = (await user.get('/attendance/register?month=' + missed.slice(0, 7))).body;
  assert.equal(
    register.rows.find((r) => r.id === employee.id).days.find((r) => r.date === missed).code,
    'A',
  );
  const pending = await user.get('/attendance/missing-days');
  assert.equal(pending.status, 200);
  const item = pending.body.items.find((row) => row.date === missed);
  assert.ok(item);
  assert.equal(
    (
      await ctx.db.get(
        'SELECT * FROM attendance WHERE employee_id=? AND date=?',
        employee.id,
        missed,
      )
    ).auto_absent,
    1,
  );
  assert.equal((await user.post('/attendance/check-in', { mode: 'office' })).status, 409);
  assert.equal(
    (
      await user.post('/attendance/check-in', {
        mode: 'wfh',
        absenceReasons: [{ id: item.id, reason: ' ' }],
      })
    ).status,
    409,
  );
  assert.equal(
    await ctx.db.value(
      'SELECT COUNT(*) FROM work_sessions WHERE employee_id=? AND date=?',
      employee.id,
      day,
    ),
    0,
  );
  const result = await user.post('/attendance/check-in', {
    mode: 'office',
    absenceReasons: [{ id: item.id, reason: 'I was unwell and did not record attendance' }],
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const explanation = await ctx.db.get('SELECT * FROM hour_shortfalls WHERE id=?', item.id);
  assert.equal(explanation.kind, 'absence');
  assert.equal(explanation.status, 'Pending approval');
  assert.equal((await user.get('/attendance/missing-days')).body.items.length, 0);
  assert.equal(
    await ctx.db.value(
      'SELECT status FROM attendance WHERE employee_id=? AND date=?',
      employee.id,
      missed,
    ),
    'A',
  );
  const manager = await as(ctx.base, 'nandini.joshi@brainadz.com');
  const outsider = await as(ctx.base, 'vikram.patel@brainadz.com');
  assert.equal(
    (await outsider.post('/attendance/short-hours/' + item.id + '/decide', { action: 'approve' }))
      .status,
    403,
  );
  assert.equal(
    (
      await manager.post('/attendance/short-hours/' + item.id + '/decide', {
        action: 'reject',
        note: 'Please submit a leave request',
      })
    ).status,
    200,
  );
  assert.equal(
    await ctx.db.value(
      'SELECT status FROM attendance WHERE employee_id=? AND date=?',
      employee.id,
      missed,
    ),
    'A',
  );
  await reconcileMissedAttendance(ctx.db, { employeeIds: [employee.id], notify: false });
  assert.equal(
    await ctx.db.value(
      'SELECT COUNT(*) FROM hour_shortfalls WHERE employee_id=? AND date=?',
      employee.id,
      missed,
    ),
    1,
  );
});

test('holidays, weekly offs, leave, travel, on-site duty, future days and pre-joining days never become automatic absences', async () => {
  const employee = await ctx.db.get(
    "SELECT * FROM employees WHERE email='dev.saxena@brainadz.com'",
  );
  const accountId = await ctx.db.value('SELECT id FROM users WHERE employee_id=?', employee.id);
  const day = await today(ctx.db),
    from = addDays(day, -14);
  await setSetting(ctx.db, 'weeklyOffs', [0, 6]);
  await ctx.db.run('DELETE FROM holidays WHERE date BETWEEN ? AND ?', from, day);
  await ctx.db.run(
    'DELETE FROM leave_requests WHERE employee_id=? AND from_date<=? AND to_date>=?',
    employee.id,
    day,
    from,
  );
  for (const table of ['work_sessions', 'attendance', 'hour_shortfalls'])
    await ctx.db.run(
      'DELETE FROM ' + table + ' WHERE employee_id=? AND date BETWEEN ? AND ?',
      employee.id,
      from,
      day,
    );
  const past = Array.from({ length: 14 }, (_, i) => addDays(day, -i - 1));
  const weekend = past.find((d) => [0, 6].includes(dow(d)));
  const [holiday, leave, travel, duty, missed] = past.filter((d) => ![0, 6].includes(dow(d)));
  await ctx.db.insert('holidays', { date: holiday, name: 'Absence test holiday', type: 'Company' });
  const leaveType = await ctx.db.value(
    "SELECT id FROM leave_types WHERE kind='leave' AND paid=1 LIMIT 1",
  );
  await ctx.db.insert('leave_requests', {
    employee_id: employee.id,
    leave_type_id: leaveType,
    from_date: leave,
    to_date: leave,
    days: 1,
    status: 'Approved',
  });
  await ctx.db.insert('work_statuses', {
    employee_id: employee.id,
    kind: 'travel',
    start_at: zonedIso(travel, '09:00', 'Asia/Kolkata'),
    end_at: zonedIso(travel, '18:00', 'Asia/Kolkata'),
    reason: 'Client travel',
    created_by: accountId,
  });
  await ctx.db.insert('work_sessions', {
    employee_id: employee.id,
    date: duty,
    mode: 'on_duty',
    activity_type: 'duty',
    start_at: zonedIso(duty, '09:00', 'Asia/Kolkata'),
    end_at: zonedIso(duty, '18:00', 'Asia/Kolkata'),
    ended_by: 'checkout',
  });
  await reconcileMissedAttendance(ctx.db, { employeeIds: [employee.id], notify: false });
  const days = (await dayStatuses(ctx.db, [employee], from, addDays(day, 1), day)).get(employee.id);
  for (const date of [weekend, holiday, leave, travel, duty, day, addDays(day, 1)]) {
    assert.notEqual(days.get(date).code, 'A', date);
    assert.equal(
      await ctx.db.value(
        'SELECT COUNT(*) FROM attendance WHERE employee_id=? AND date=? AND auto_absent=1',
        employee.id,
        date,
      ),
      0,
      date,
    );
  }
  assert.equal(days.get(missed).code, 'A');
  const required = await pendingAbsences(ctx.db, employee.id);
  assert.ok(!required.some((r) => [weekend, holiday, leave, travel, duty].includes(r.date)));
  const joiner = await ctx.db.insert('employees', {
    code: 'ABSJOIN',
    first_name: 'Absence',
    last_name: 'Joiner',
    email: 'absence.joiner@example.test',
    join_date: day,
    status: 'Active',
  });
  await reconcileMissedAttendance(ctx.db, { employeeIds: [joiner], notify: false });
  assert.equal(
    await ctx.db.value('SELECT COUNT(*) FROM attendance WHERE employee_id=?', joiner),
    0,
  );
});
