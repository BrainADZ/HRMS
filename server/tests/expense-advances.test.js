import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('Accounts advance approval, employee acceptance and final reconciliation', async () => {
  const ctx = await boot();
  try {
    const accounts = await as(ctx.base, 'vikram.patel@brainadz.com');
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const accountsUser = await ctx.db.get(
      "SELECT employee_id FROM users WHERE email='vikram.patel@brainadz.com'",
    );
    const finance = await ctx.db.value("SELECT id FROM departments WHERE name='Finance'");
    await ctx.db.update('employees', accountsUser.employee_id, { department_id: finance });
    const employeeId = await ctx.db.value(
      "SELECT employee_id FROM users WHERE email='aarav.mehta@brainadz.com'",
    );
    assert.equal(
      (
        await employee.post('/expenses/advances', {
          employee_id: employeeId,
          amount: 1000,
          purpose: 'Trip',
        })
      ).status,
      403,
    );
    const created = await accounts.post('/expenses/advances', {
      employee_id: employeeId,
      amount: 1000,
      purpose: 'Trip',
    });
    assert.equal(created.status, 200);
    const id = created.body.id;
    assert.equal((await employee.get('/expenses/advances')).body.items.length, 0);
    assert.equal(
      (await accounts.post(`/expenses/advances/${id}/decision`, { action: 'approve' })).status,
      403,
    );
    assert.equal(
      (await admin.post(`/expenses/advances/${id}/decision`, { action: 'approve' })).status,
      200,
    );
    assert.equal(
      (await employee.get('/expenses/advances')).body.items[0].status,
      'Awaiting Acceptance',
    );
    assert.equal((await employee.post(`/expenses/advances/${id}/accept`)).status, 200);
    assert.equal(
      (
        await employee.put(`/expenses/advances/${id}/entries`, {
          entries: [{ date: '2026-01-01', description: 'Travel', amount: 1200 }],
        })
      ).status,
      200,
    );
    const item = (await accounts.get('/expenses/advances')).body.items.find((a) => a.id === id);
    assert.equal(item.balance, -200);
    assert.equal((await employee.post(`/expenses/advances/${id}/submit`)).status, 200);
    assert.equal((await accounts.post(`/expenses/advances/${id}/settle`)).status, 200);
    assert.equal((await employee.get('/expenses/advances')).body.items[0].status, 'Settled');
  } finally {
    await ctx.close();
  }
});
