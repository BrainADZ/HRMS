import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('self profile exposes generated login ID and credentials are managed by CEO / IT only', async () => {
  const ctx = await boot();
  try {
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const me = (await employee.get('/auth/me')).body.user;
    assert.equal(me.canManageCredentials, false);
    const profile = await employee.get('/employees/' + me.employeeId);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.login.username, me.username);
    assert.ok(me.username);
    assert.equal(
      (
        await employee.post('/auth/change-password', {
          current: 'Brainadz@2026',
          next: 'ChangedPass123',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await employee.put('/employees/' + me.employeeId, {
          phone: '+91 9999999999',
          about: 'Profile update',
        })
      ).status,
      200,
    );
    await employee.put('/employees/' + me.employeeId, {
      email: 'changed@example.test',
      username: 'ChangedLogin',
    });
    assert.equal((await employee.get('/auth/me')).body.user.email, me.email);
    assert.equal((await employee.get('/auth/me')).body.user.username, me.username);
    const hr = await as(ctx.base, 'priya.sharma@brainadz.com');
    assert.equal((await hr.get('/auth/me')).body.user.canManageCredentials, false);
    assert.equal(
      (await hr.post('/employees/' + me.employeeId + '/login', { role: 'employee' })).status,
      403,
    );
    assert.equal(
      (await hr.put('/employees/' + me.employeeId, { email: 'changed@example.test' })).status,
      403,
    );
    const ceo = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    assert.equal((await ceo.get('/auth/me')).body.user.canManageCredentials, true);
    // A CEO reset does not require an employee to change the managed password.
    assert.equal((await ceo.post('/users/' + me.id + '/reset')).status, 200);
    const account = await ctx.db.get('SELECT must_change_password FROM users WHERE id=?', me.id);
    assert.equal(account.must_change_password, 1);
    const { loadUser } = await import('../auth.js');
    const loaded = await loadUser(ctx.db, me.id);
    assert.equal(loaded.mustChangePassword, false);
  } finally {
    await ctx.close();
  }
});
