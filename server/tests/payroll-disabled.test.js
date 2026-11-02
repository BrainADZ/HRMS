import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('payroll is disabled for every role while attendance and expenses remain available', async () => {
  const ctx = await boot();
  try {
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const employee = await as(ctx.base, 'dev.saxena@brainadz.com');
    const manager = await as(ctx.base, 'vikram.patel@brainadz.com');
    const hr = await as(ctx.base, 'priya.sharma@brainadz.com');
    const account = await ctx.db.get("SELECT * FROM users WHERE email='aarav.mehta@brainadz.com'");
    await ctx.db.update('users', account.id, { role: 'accounts' });
    const accounts = await as(ctx.base, account.username);
    const before = await ctx.db.all('SELECT id, month, status FROM payroll_runs ORDER BY id');
    for (const user of [admin, accounts, hr, manager, employee]) {
      for (const path of ['/payroll', '/payroll/my', '/payroll/payslips/1', '/payroll/runs/1/bank-file.csv', '/payroll/runs/1/register.csv', '/payroll/adjustments/1/proof']) {
        const response = await user.get(path);
        assert.equal(response.status, 403, path);
        assert.equal(response.body.code, 'payroll_disabled', path);
      }
      for (const path of ['/payroll/runs', '/payroll/runs/1/approve', '/payroll/runs/1/transfer', '/payroll/runs/1/complete', '/payroll/adjustments']) {
        assert.equal((await user.post(path)).body.code, 'payroll_disabled', path);
      }
      assert.equal((await user.put('/payroll/payslips/1/hold', { hold: true })).body.code, 'payroll_disabled');
      assert.equal((await user.del('/payroll/runs/1')).body.code, 'payroll_disabled');
      assert.equal((await user.get('/attendance/today')).status, 200);
      assert.equal((await user.get('/expenses')).status, 200);
    }
    assert.equal((await admin.put('/settings', { payroll: { basicPercent: 50 } })).status, 403);
    assert.deepEqual(await ctx.db.all('SELECT id, month, status FROM payroll_runs ORDER BY id'), before);
  } finally {
    await ctx.close();
  }
});
