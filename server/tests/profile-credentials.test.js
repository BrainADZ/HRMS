import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('profile user ID remains visible and original self-service password policy is restored', async () => {
  const ctx = await boot();
  try {
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const me = (await employee.get('/auth/me')).body.user;
    assert.equal(Object.hasOwn(me, 'canManageCredentials'), false);
    const profile = await employee.get('/employees/' + me.employeeId);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.login.username, me.username);
    assert.equal(
      (
        await employee.post('/auth/change-password', {
          current: 'wrong-password',
          next: 'ChangedPass123',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await employee.post('/auth/change-password', {
          current: 'Brainadz@2026',
          next: 'ChangedPass123',
        })
      ).status,
      200,
    );
    const columns = await ctx.db.all(
      "SELECT column_name FROM information_schema.columns WHERE table_name='users'",
    );
    assert.equal(
      columns.some((c) => ['credential_role', 'managed_username'].includes(c.column_name)),
      false,
    );
    assert.equal((await employee.get('/credentials/users')).status, 404);
  } finally {
    await ctx.close();
  }
});
