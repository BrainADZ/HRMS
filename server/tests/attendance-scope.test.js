import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';
import { isCompanyOwner } from '../lib/employee-policy.js';
import { monthStart, monthEnd } from '../lib/dates.js';

test('attendance visibility follows employee, manager, head and company access', async () => {
  const ctx = await boot();
  try {
    const employee = await as(ctx.base, 'dev.saxena@brainadz.com');
    const manager = await as(ctx.base, 'vikram.patel@brainadz.com');
    const head = await as(ctx.base, 'kabir.sethi@brainadz.com');
    const ceo = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    let accountsUser = await ctx.db.get("SELECT * FROM users WHERE role='accounts' LIMIT 1");
    if (!accountsUser) {
      await ctx.db.run("UPDATE users SET role='accounts' WHERE email='admin@brainadz.com'");
      accountsUser = await ctx.db.get("SELECT * FROM users WHERE role='accounts' LIMIT 1");
    }
    assert.ok(accountsUser, 'Accountant fixture exists');
    const accounts = await as(ctx.base, accountsUser.username);
    const ownerAccount = await ctx.db.get(
      "SELECT password_hash FROM users WHERE role='admin' LIMIT 1",
    );
    await ctx.db.insert('users', {
      email: 'attendance.admin@example.test',
      role: 'admin',
      password_hash: ownerAccount.password_hash,
      must_change_password: 0,
    });
    const admin = await as(ctx.base, 'attendance.admin@example.test');
    const employees = await ctx.db.all('SELECT * FROM employees');
    const byName = (name) => employees.find((e) => e.first_name === name);
    const day = (await employee.get('/attendance/workday')).body.today;
    const registerPath = '/attendance/register?month=' + day.slice(0, 7);
    const ids = (response) => response.body.rows.map((row) => row.id);
    assert.equal((await employee.get('/attendance/today')).body.team, null);
    assert.deepEqual(ids(await employee.get(registerPath)), [byName('Dev').id]);
    assert.deepEqual(
      ids(await employee.get(registerPath + '&employee=' + byName('Ritika').id)),
      [],
    );
    assert.deepEqual(
      (await employee.get('/attendance/activity?employee=' + byName('Ritika').id)).body.items,
      [],
    );
    for (const [viewer, name] of [[employee, 'Dev'], [manager, 'Vikram'], [head, 'Kabir'], [ceo, 'Rajiv']]) {
      assert.deepEqual(ids(await viewer.get(registerPath + '&self=1&employee=' + byName('Ritika').id + '&vertical=999999')), [byName(name).id]);
    }
    assert.deepEqual(ids(await admin.get(registerPath + '&self=1')), []);
    const managerIds = ids(await manager.get(registerPath));
    assert.ok(managerIds.includes(byName('Vikram').id));
    assert.ok(managerIds.includes(byName('Dev').id));
    assert.ok(!managerIds.includes(byName('Ishita').id));
    assert.ok(!managerIds.includes(byName('Kabir').id));
    const headIds = ids(await head.get(registerPath));
    assert.ok(headIds.includes(byName('Vikram').id));
    assert.ok(headIds.includes(byName('Ishita').id));
    assert.ok(headIds.includes(byName('Dev').id));
    const indirect = employees.find((e) => e.manager_id === byName('Ishita').id);
    assert.ok(headIds.includes(indirect.id));
    assert.ok(!headIds.includes(byName('Nandini').id));
    assert.deepEqual(ids(await head.get(registerPath + '&employee=' + byName('Nandini').id)), []);
    const expected = employees
      .filter(
        (e) =>
          !isCompanyOwner(e) &&
          e.join_date <= monthEnd(day.slice(0, 7)) &&
          (!e.exit_date || e.exit_date >= monthStart(day.slice(0, 7))),
      )
      .map((e) => e.id)
      .sort((a, b) => a - b);
    for (const companyViewer of [accounts, admin, ceo]) {
      assert.deepEqual(
        ids(await companyViewer.get(registerPath)).sort((a, b) => a - b),
        expected,
      );
      assert.ok(
        (await companyViewer.get('/attendance/today')).body.team.rows.some(
          (e) => e.id === byName('Dev').id,
        ),
      );
    }
    assert.equal(
      (
        await employee.put('/attendance', {
          employee_id: byName('Ritika').id,
          date: day,
          status: 'P',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await manager.put('/attendance', {
          employee_id: byName('Nandini').id,
          date: day,
          status: 'P',
        })
      ).status,
      403,
    );
  } finally {
    await ctx.close();
  }
});
