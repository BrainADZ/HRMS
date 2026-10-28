import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('Accounts role manages payroll and advances without administrator approval rights', async () => {
  const ctx = await boot();
  try {
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const accountUser = await ctx.db.get(
      "SELECT id FROM users WHERE email='vikram.patel@brainadz.com'",
    );
    assert.equal((await admin.put(`/users/${accountUser.id}`, { role: 'accounts' })).status, 200);
    const accounts = await as(ctx.base, 'vikram.patel@brainadz.com');
    assert.equal((await accounts.get('/payroll')).status, 200);
    assert.equal((await accounts.get('/reports/summary')).status, 200);
    assert.equal((await accounts.get('/settings')).status, 200);
    assert.equal((await employee.get('/payroll')).status, 403);
    const employeeId = await ctx.db.value(
      "SELECT employee_id FROM users WHERE email='aarav.mehta@brainadz.com'",
    );
    const advance = await accounts.post('/expenses/advances', {
      employee_id: employeeId,
      amount: 500,
      purpose: 'Travel',
    });
    assert.equal(advance.status, 200);
    assert.equal(
      (await accounts.post(`/expenses/advances/${advance.body.id}/decision`, { action: 'approve' }))
        .status,
      403,
    );
    assert.equal(
      (await admin.post(`/expenses/advances/${advance.body.id}/decision`, { action: 'approve' }))
        .status,
      200,
    );
  } finally {
    await ctx.close();
  }
});
