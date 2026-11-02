import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';
import { loadUser } from '../auth.js';
import { assignmentsFor } from '../services/access.js';

test('CEO configures opt-in multi-role permissions, revocation and scoped Head teams', async () => {
  const ctx = await boot();
  // Exercise opt-in authorization from an explicitly empty chart.
  await ctx.db.run('DELETE FROM role_permission_rules');
  try {
    const ceo = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const staff = await as(ctx.base, 'dev.saxena@brainadz.com');
    const head = await as(ctx.base, 'vikram.patel@brainadz.com');
    const ceoId = await ctx.db.value(
      "SELECT id FROM users WHERE email='rajiv.malhotra@brainadz.com'",
    );
    const headUser = await ctx.db.get(
      "SELECT * FROM users WHERE email='vikram.patel@brainadz.com'",
    );
    const employee = await ctx.db.get(
      "SELECT e.* FROM employees e JOIN users u ON u.employee_id=e.id WHERE u.email='dev.saxena@brainadz.com'",
    );
    const outsider = await ctx.db.get(
      "SELECT * FROM employees WHERE vertical_id != ? AND status='Active' AND grade='Executive' ORDER BY id LIMIT 1",
      employee.vertical_id,
    );
    const third = await ctx.db.get(
      "SELECT * FROM employees WHERE vertical_id NOT IN (?,?) AND status='Active' AND grade='Executive' ORDER BY id LIMIT 1",
      employee.vertical_id,
      outsider.vertical_id,
    );
    const initial = await ceo.get('/permissions');
    assert.equal(initial.status, 200);
    assert.equal(
      await ctx.db.value('SELECT COUNT(*) FROM role_assignments'),
      0,
      'no automatic access migration',
    );
    assert.deepEqual(Object.keys(initial.body.matrix), [
      'ceo',
      'admin',
      'head',
      'manager',
      'accounts',
      'employee',
    ]);
    assert.ok(Object.values(initial.body.matrix).every((permissions) => !permissions.length));
    assert.equal((await staff.get('/permissions')).status, 403);
    let revision = initial.body.revision;
    const grant = async (role, permission, allowed = true) => {
      const result = await ceo.put('/permissions', { role, permission, allowed, revision });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      revision = result.body.revision;
    };
    const roles = [
      { role: 'head', vertical_id: employee.vertical_id, department_id: employee.department_id },
    ];
    assert.equal((await ceo.put('/users/' + headUser.id, { roleAssignments: roles })).status, 200);
    assert.equal(
      (await head.get('/attendance/today')).body.team,
      null,
      'role alone does not grant a permission',
    );
    await grant('head', 'attendance.team');
    let today = await head.get('/attendance/today');
    assert.equal(today.status, 200);
    assert.ok(today.body.team.rows.some((row) => row.id === employee.id));
    assert.ok(!today.body.team.rows.some((row) => row.id === outsider.id));
    assert.equal((await head.get('/settings')).status, 403);
    roles.push({
      role: 'head',
      vertical_id: outsider.vertical_id,
      department_id: outsider.department_id,
    });
    assert.equal((await ceo.put('/users/' + headUser.id, { roleAssignments: roles })).status, 200);
    today = await head.get('/attendance/today');
    assert.ok(today.body.team.rows.some((row) => row.id === outsider.id));
    assert.ok(!today.body.team.rows.some((row) => row.id === third.id));
    const created = await ceo.post('/employees', {
      first_name: 'Direct Head Report',
      last_name: 'Test',
      email: 'direct.head.report@example.test',
      join_date: today.body.today,
      manager_id: headUser.employee_id,
      vertical_id: employee.vertical_id,
      department_id: employee.department_id,
      create_login: true,
      roleAssignments: [
        { role: 'employee' },
        {
          role: 'manager',
          vertical_id: outsider.vertical_id,
          department_id: outsider.department_id,
        },
      ],
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(
      (await ctx.db.get('SELECT manager_id FROM employees WHERE id=?', created.body.id)).manager_id,
      headUser.employee_id,
    );
    assert.equal((await assignmentsFor(ctx.db, { employeeId: created.body.id })).length, 2);
    assert.ok(
      (await head.get('/attendance/today')).body.team.rows.some(
        (row) => row.id === created.body.id,
      ),
    );
    const direct = await ceo.post('/employees', {
      first_name: 'Direct Employee',
      email: 'direct.employee@example.test',
      join_date: today.body.today,
      manager_id: headUser.employee_id,
      roleAssignments: [{ role: 'employee' }],
    });
    assert.equal(direct.status, 200, JSON.stringify(direct.body));
    assert.deepEqual(
      (await assignmentsFor(ctx.db, { employeeId: direct.body.id })).map((row) => row.role),
      ['employee'],
    );
    await grant('head', 'attendance.team', false);
    assert.equal(
      (await head.get('/attendance/today')).body.team,
      null,
      'revocation applies to an existing session',
    );
    assert.equal(
      (
        await head.put('/attendance', {
          employee_id: employee.id,
          date: today.body.today,
          status: 'P',
        })
      ).status,
      403,
    );
    const stale = await ceo.put('/permissions', {
      role: 'head',
      permission: 'reports.view',
      allowed: true,
      revision: 0,
    });
    assert.equal(stale.status, 409);
    const staffId = await ctx.db.value('SELECT id FROM users WHERE employee_id=?', employee.id);
    assert.equal(
      (await ceo.put('/users/' + staffId, { roleAssignments: [{ role: 'employee' }] })).status,
      200,
    );
    await grant('employee', 'employees.view_all');
    assert.equal((await staff.get('/employees/' + outsider.id)).body.compensation, undefined);
    assert.equal((await staff.get('/employees/export.csv')).status, 403);
    assert.equal((await staff.post('/employees', { first_name: 'Blocked' })).status, 403);
    await grant('employee', 'employees.view_all', false);
    const before = await assignmentsFor(ctx.db, { employeeId: headUser.employee_id });
    assert.equal(
      (await ceo.put('/users/' + headUser.id, { roleAssignments: [roles[0], roles[0]] })).status,
      400,
    );
    assert.deepEqual(await assignmentsFor(ctx.db, { employeeId: headUser.employee_id }), before);
    await grant('admin', 'users.manage');
    await grant('admin', 'employees.manage');
    assert.equal(
      (await ceo.put('/users/' + headUser.id, { roleAssignments: [{ role: 'admin' }] })).status,
      200,
    );
    assert.equal((await head.get('/users')).status, 200);
    assert.equal((await head.put('/employees/' + employee.id, { ctc: 999999 })).status, 403);
    assert.equal(
      (
        await head.put('/employees/' + employee.id, {
          about: 'Updated without changing private pay details',
        })
      ).status,
      200,
    );
    assert.equal((await head.get('/permissions')).status, 403);
    assert.equal(
      (await head.put('/users/' + headUser.id, { roleAssignments: [{ role: 'ceo' }] })).status,
      403,
    );
    assert.equal((await head.put('/users/' + ceoId, { active: false })).status, 403);
    assert.equal(
      (await ceo.put('/users/' + ceoId, { roleAssignments: [{ role: 'ceo' }, ...roles] })).status,
      200,
    );
    const owner = await loadUser(ctx.db, ceoId);
    assert.deepEqual(owner.roles, ['ceo', 'head']);
    assert.equal(owner.roleAssignments.length, 3);
    assert.equal((await ceo.get('/permissions')).status, 200);
    assert.equal(
      (await ceo.put('/users/' + ceoId, { roleAssignments: [{ role: 'employee' }] })).status,
      400,
    );
    assert.equal((await ceo.get('/payroll')).body.code, 'payroll_disabled');
    assert.equal((await ceo.get('/users')).status, 200);
  } finally {
    await ctx.close();
  }
});
