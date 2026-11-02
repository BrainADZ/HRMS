import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { accessProfile, applyAccessContext, saveAssignments, validateAssignments } from '../services/access.js';
import { scopeIds } from '../core.js';

test('responsibility scope persists and cannot borrow another role scope', async () => {
  const ctx = await boot();
  const { db } = ctx;
  try {
    const people = await db.all('SELECT * FROM employees ORDER BY id');
    const actor = people.find(e => e.manager_id);
    const target = people.find(e => e.id !== actor.id && e.department_id && e.vertical_id);
    const account = await db.get('SELECT * FROM users WHERE employee_id=?', actor.id);
    await db.run('DELETE FROM role_permission_rules');
    await db.run("INSERT INTO role_permission_rules VALUES ('head','attendance.view',1),('manager','employees.view',1),('head','attendance.edit',1)");
    const rows = await validateAssignments(db, [
      {role:'head',access_scope:'selected',vertical_id:target.vertical_id,department_id:target.department_id},
      {role:'manager',access_scope:'all'},
    ]);
    await saveAssignments(db, {employeeId:actor.id}, rows);
    const make = async (method, path) => {
      const user = { id:account.id, employeeId:actor.id, ...await accessProfile(db, account) };
      return applyAccessContext(user, method, path);
    };
    const selected = await make('GET','/attendance');
    assert.equal(selected.role,'manager');
    const ids = await scopeIds(db,selected);
    const expected = (await db.all('SELECT e.id FROM employees e WHERE e.department_id=? AND (e.vertical_id=? OR EXISTS(SELECT 1 FROM employee_verticals ev WHERE ev.employee_id=e.id AND ev.vertical_id=?))',target.department_id,target.vertical_id,target.vertical_id)).map(e=>e.id);
    assert.deepEqual(new Set(ids),new Set([...expected,actor.id]));
    assert.ok(ids.includes(target.id));
    assert.equal(await scopeIds(db,await make('GET','/employees')),null);
    assert.equal((await make('PUT','/attendance/bulk')).role,'manager');
    await assert.rejects(validateAssignments(db,[{role:'head',access_scope:'selected'}]),/Select a department or vertical/);
    await assert.rejects(validateAssignments(db,[{role:'ceo',access_scope:'own'}]),/CEO responsibility/);
    await assert.rejects(validateAssignments(db,[{role:'head',access_scope:'bogus'}]),/valid data scope/);
    await saveAssignments(db,{employeeId:actor.id},await validateAssignments(db,[{role:'head',access_scope:'own'}]));
    assert.deepEqual(await scopeIds(db,await make('GET','/attendance')),[actor.id]);
    await db.run("INSERT INTO role_permission_rules VALUES ('head','users.edit',1)");
    await assert.rejects(make('PUT','/users/1'),/Permission required/);
  } finally { await ctx.close(); }
});
