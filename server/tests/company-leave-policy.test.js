import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';
import { balances } from '../services/leave.js';
import fs from 'node:fs/promises';

test('company leave configuration, historical SL pool, fiscal split and API limits', async (t) => {
  const { base, db, close } = await boot();
  t.after(close);
  const hr = await as(base, 'priya.sharma@brainadz.com');
  const types = new Map((await db.all('SELECT * FROM leave_types')).map((x) => [x.code, x]));
  assert.equal(types.get('EL').annual_quota, 6);
  assert.equal(types.get('CL').annual_quota, 12);
  assert.equal(types.get('CL').accrual, 'quarterly');
  assert.equal(types.get('SL').active, 0);
  assert.equal(types.get('PL').annual_quota, 6);
  // Exercise an existing installation, where the migration runs after seed.
  await db.run("UPDATE leave_types SET annual_quota=20 WHERE code='EL'");
  await db.run("UPDATE leave_types SET annual_quota=15 WHERE code='PL'");
  await db.run("UPDATE leave_types SET active=1, annual_quota=10 WHERE code='SL'");
  await db.run(
    "UPDATE policies SET version='3.2', content=? WHERE title='Leave Policy'",
    '## 2. Entitlements (per calendar year)\n- Casual Leave (CL): 12 days, credited in January (pro-rated for joiners). No carry forward.\n- Sick Leave (SL): 10 days. A medical certificate is required for absences longer than 3 days.',
  );
  await db.exec(
    await fs.readFile(new URL('../database/024-company-leave-policy.sql', import.meta.url), 'utf8'),
  );
  assert.equal(await db.value("SELECT annual_quota FROM leave_types WHERE code='EL'"), 6);
  assert.equal(await db.value("SELECT annual_quota FROM leave_types WHERE code='PL'"), 6);
  const policy = await db.get("SELECT * FROM policies WHERE title='Leave Policy'");
  assert.equal(policy.version, '4.0');
  assert.match(policy.content, /one combined 12-day/);
  assert.ok(!policy.content.includes('Sick Leave (SL): 10'));
  const employeeId = await db.insert('employees', {
    code: 'POL9001',
    first_name: 'Policy',
    email: 'policy-test@example.test',
    gender: 'M',
    join_date: '2020-01-01',
  });
  const emp = await db.get('SELECT * FROM employees WHERE id = ?', employeeId);
  const ctx = { weeklyOffs: [0, 6], holidays: new Set() };
  const record = (code, from, to, days, status = 'Approved') =>
    db.insert('leave_requests', {
      employee_id: employeeId,
      leave_type_id: types.get(code).id,
      from_date: from,
      to_date: to,
      days,
      status,
    });
  await record('SL', '2027-01-04', '2027-01-04', 1);
  await record('CL', '2027-02-01', '2027-02-01', 1, 'Pending');
  await record('CL', '2027-03-31', '2027-04-02', 3);
  const oldYear = await balances(db, emp, 2026, '2027-03-31', ctx);
  const cl = oldYear.find((x) => x.code === 'CL');
  assert.equal(cl.entitled, 12);
  assert.equal(cl.used, 2);
  assert.equal(cl.pending, 1);
  assert.equal(cl.available, 9);
  assert.ok(!oldYear.some((x) => x.code === 'SL'));
  assert.equal(oldYear.find((x) => x.code === 'EL').entitled + cl.entitled, 18);
  const newYear = await balances(db, emp, 2027, '2027-04-02', ctx);
  assert.equal(newYear.find((x) => x.code === 'CL').used, 2);
  assert.equal(newYear.find((x) => x.code === 'CL').entitled, 3);
  assert.equal(newYear.find((x) => x.code === 'EL').entitled, 0);

  await db.run('DELETE FROM leave_requests WHERE employee_id = ?', employeeId);
  const request = (code, from, to) => ({
    employee_id: employeeId,
    leave_type_id: types.get(code).id,
    from_date: from,
    to_date: to,
  });
  assert.equal(
    (await hr.post('/leave/preview', request('PL', '2028-04-03', '2028-04-10'))).body.ok,
    true,
  );
  const tooMuch = await hr.post('/leave/preview', request('PL', '2028-04-03', '2028-04-11'));
  assert.equal(tooMuch.body.ok, false);
  assert.match(tooMuch.body.error, /cannot exceed 6/);
  assert.equal(
    (await hr.post('/leave/preview', request('PL', '2028-03-27', '2028-04-05'))).body.ok,
    false,
  );
  const early = await hr.post('/leave/preview', request('CL', '2028-04-03', '2028-04-06'));
  assert.equal(early.body.ok, false, 'April cannot spend later quarterly credits');
  assert.equal(
    (await hr.post('/leave/preview', request('SL', '2028-04-03', '2028-04-03'))).body.ok,
    false,
  );
});
