import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('new joiner training is assigned, private and completed by the employee', async () => {
  const ctx = await boot();
  try {
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const other = await as(ctx.base, 'vikram.patel@brainadz.com');
    const catalog = await admin.get('/training');
    assert.equal(catalog.status, 200);
    assert.ok(catalog.body.modules.length >= 4);
    assert.equal((await employee.post('/training/modules', { title: 'Forbidden', content: 'x' })).status, 403);

    const created = await admin.post('/training/modules', {
      title: 'First-week induction',
      description: 'Meet your team',
      content: 'Review your role and first-week goals with your manager.',
    });
    assert.equal(created.status, 200);
    const employeeId = await ctx.db.value("SELECT employee_id FROM users WHERE email = 'aarav.mehta@brainadz.com'");
    assert.equal((await admin.post(`/training/modules/${created.body.id}/assign`, { employee_id: employeeId })).status, 200);

    const assigned = await employee.get('/training');
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.modules.length, 0);
    assert.equal(assigned.body.people.length, 0);
    assert.ok(assigned.body.my.some((item) => item.module_id === created.body.id));
    assert.equal((await other.post(`/training/modules/${created.body.id}/complete`)).status, 404);
    assert.equal((await employee.post(`/training/modules/${created.body.id}/complete`)).status, 200);
    const completed = await employee.get('/training');
    assert.ok(completed.body.my.find((item) => item.module_id === created.body.id)?.completed_at);

    const today = (await admin.get('/meta')).body.today;
    const hire = await admin.post('/employees', {
      first_name: 'Training', last_name: 'Joiner', email: 'training.joiner@example.com', join_date: today,
    });
    assert.equal(hire.status, 200, JSON.stringify(hire.body));
    const assignedCount = await ctx.db.value('SELECT COUNT(*) FROM training_assignments WHERE employee_id = ?', hire.body.id);
    assert.equal(assignedCount, catalog.body.modules.length + 1);
  } finally {
    await ctx.close();
  }
});
