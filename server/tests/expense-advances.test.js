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
      "SELECT id FROM users WHERE email='vikram.patel@brainadz.com'",
    );
    await ctx.db.update('users', accountsUser.id, { role: 'accounts' });
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
    assert.equal(
      (
        await admin.post('/expenses/advances', {
          employee_id: employeeId,
          amount: 1000,
          purpose: 'Trip',
          disbursed_on: '2026-01-01',
          payment_method: 'Cash',
        })
      ).status,
      403,
    );
    const created = await accounts.post('/expenses/advances', {
      employee_id: employeeId,
      amount: 1000,
      purpose: 'Trip',
      disbursed_on: '2026-01-01',
      payment_method: 'Bank transfer',
      payment_reference: 'TXN-100',
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
    const form = new FormData();
    form.append('advance_id', String(id));
    form.append(
      'entries',
      JSON.stringify([
        {
          start_date: '2026-01-01',
          end_date: '2026-01-01',
          purpose: 'Client trip',
          category: 'Travel',
          amount: 1200,
          merchant: 'Railways',
          description: 'Travel',
          reference: '',
          files: [0],
        },
      ]),
    );
    form.append(
      'proofs',
      new Blob(['%PDF-1.4\nreceipt'], { type: 'application/pdf' }),
      'ticket.pdf',
    );
    assert.equal((await employee.post('/expenses', undefined, { form })).status, 200);
    const item = (await accounts.get('/expenses/advances')).body.items.find((a) => a.id === id);
    assert.equal(item.balance, -200);
    assert.equal(item.entries[0].attachments[0].name, 'ticket.pdf');
    assert.equal((await employee.get(`/expenses/advances/${id}/attachments/0/0`)).status, 200);
    assert.equal((await employee.get('/expenses')).body.items.length, 0);
    assert.equal((await employee.post(`/expenses/advances/${id}/submit`)).status, 200);
    assert.equal(
      await ctx.db.value(
        'SELECT link FROM notifications WHERE text LIKE ? ORDER BY id DESC LIMIT 1',
        `%submitted final expenses for advance #${id}`,
      ),
      '/expenses/approvals',
    );
    const extra = await employee.post(`/expenses/advances/${id}/extra-claim`);
    assert.equal(extra.status, 200);
    assert.equal((await employee.post(`/expenses/advances/${id}/extra-claim`)).status, 409);
    assert.equal((await employee.get(`/expenses/${extra.body.id}`)).body.amount, 200);
    assert.equal((await accounts.post(`/expenses/advances/${id}/settle`)).status, 200);
    assert.equal((await employee.get('/expenses/advances')).body.items[0].status, 'Settled');
  } finally {
    await ctx.close();
  }
});
