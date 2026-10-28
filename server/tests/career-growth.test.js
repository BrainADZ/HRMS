import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('career growth records role and salary changes and totals only paid payroll', async () => {
  const ctx = await boot();
  try {
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const employeeId = await ctx.db.value(
      "SELECT employee_id FROM users WHERE email='aarav.mehta@brainadz.com'",
    );
    const before = (await employee.get(`/employees/${employeeId}`)).body;
    assert.equal(before.careerGrowth.events.length, 3);
    assert.equal(before.careerGrowth.incrementCount, 2);
    const expectedNet = await ctx.db.value(
      "SELECT COALESCE(SUM(p.net),0) FROM payslips p JOIN payroll_runs r ON r.id=p.run_id WHERE p.employee_id=? AND p.status='Paid' AND r.status='Completed'",
      employeeId,
    );
    assert.equal(Number(before.careerGrowth.paid.net_paid), Number(expectedNet));
    const ctc = before.careerGrowth.currentCtc;
    assert.equal((await admin.put(`/employees/${employeeId}`, { ctc: ctc + 12000 })).status, 200);
    const after = (await employee.get(`/employees/${employeeId}`)).body.careerGrowth;
    assert.equal(after.incrementCount, 3);
    assert.equal(after.annualCtcIncrease, 132000);
    assert.equal(after.events.at(-1).new_ctc, ctc + 12000);
  } finally {
    await ctx.close();
  }
});
