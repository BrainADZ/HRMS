import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';
import { loadUser } from '../auth.js';

test('multi-vertical membership is independent of roles, scoped teams and Accounts grants', async () => {
  const ctx = await boot();
  // This test isolates explicit grants from the shipped role defaults.
  await ctx.db.run('DELETE FROM role_permission_rules');
  try {
    const ceo = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const staff = await as(ctx.base, 'dev.saxena@brainadz.com');
    const head = await as(ctx.base, 'vikram.patel@brainadz.com');
    const users = (await ceo.get('/users')).body.users;
    const person = users.find(u => u.email === 'dev.saxena@brainadz.com');
    const leader = users.find(u => u.email === 'vikram.patel@brainadz.com');
    const secondary = await ctx.db.value('SELECT id FROM verticals WHERE id!=? ORDER BY id LIMIT 1', person.vertical_id);
    const before = await loadUser(ctx.db, person.id);
    const url = '/access/employees/' + person.employee_id;
    assert.deepEqual(person.vertical_ids, [person.vertical_id]);
    assert.equal((await staff.put(url, {vertical_ids:[person.vertical_id,secondary]})).status,403);
    assert.equal((await ceo.put(url, {vertical_ids:[person.vertical_id,secondary]})).status,200);
    const after = await loadUser(ctx.db, person.id);
    assert.equal(after.managedAccess,before.managedAccess);
    assert.deepEqual(after.permissions,before.permissions);
    assert.deepEqual((await ceo.get('/users')).body.users.find(u=>u.id===person.id).vertical_ids.sort(), [person.vertical_id,secondary].sort());
    assert.ok((await ceo.get('/employees?vertical='+secondary)).body.items.some(e=>e.id===person.employee_id));
    assert.equal((await ceo.put(url,{vertical_ids:[secondary]})).status,400);
    assert.equal((await ceo.put(url,{vertical_ids:[person.vertical_id,999999],roleAssignments:[{role:'admin'}]})).status,400);
    assert.equal((await loadUser(ctx.db,person.id)).managedAccess,false,'invalid membership rolls role update back');
    assert.equal((await ceo.put('/users/'+leader.id,{roleAssignments:[{role:'head',vertical_id:secondary,department_id:person.department_id}]})).status,200);
    let state=(await ceo.get('/permissions')).body;
    assert.equal((await ceo.put('/permissions',{role:'head',permission:'attendance.team',allowed:true,revision:state.revision})).status,200);
    assert.ok((await head.get('/attendance/today')).body.team.rows.some(e=>e.id===person.employee_id),'team scope includes secondary membership');
    assert.equal((await ceo.put(url,{roleAssignments:[{role:'admin'},{role:'accounts',department_id:person.department_id}]})).status,200);
    let profile=await loadUser(ctx.db,person.id);
    assert.deepEqual(profile.roles,['admin','accounts']);
    assert.deepEqual(profile.permissions,[],'Accounts has no automatic grants');
    state=(await ceo.get('/permissions')).body;
    assert.equal((await ceo.put('/permissions',{role:'accounts',permission:'expenses.review',allowed:true,revision:state.revision})).status,200);
    profile=await loadUser(ctx.db,person.id);
    assert.ok(profile.permissions.includes('expenses.review'));
    assert.ok(profile.permissions.includes('expenses.approve'));
    const owner=users.find(u=>u.roles.includes('ceo'));
    state=(await ceo.get('/permissions')).body;
    await ceo.put('/permissions',{role:'admin',permission:'users.manage',allowed:true,revision:state.revision});
    assert.equal((await staff.put('/access/employees/'+owner.employee_id,{vertical_ids:owner.vertical_ids})).status,403);
    assert.equal((await staff.get('/permissions')).status,403);
    assert.equal((await staff.get('/payroll')).status,403);
    const newPerson = await ceo.post('/employees', {
      first_name:'Multiple Vertical', email:'multiple.vertical@example.test',
      join_date:'2026-11-02', vertical_id:person.vertical_id,
      vertical_ids:[person.vertical_id,secondary], create_login:false,
      roleAssignments:[{role:'admin'},{role:'accounts'}],
    });
    assert.equal(newPerson.status,200,JSON.stringify(newPerson.body));
    const pending=(await ceo.get('/users')).body.employeesWithoutLogin.find(e=>e.employee_id===newPerson.body.id);
    assert.deepEqual(pending.roleAssignments.map(a=>a.role),['admin','accounts']);
    assert.equal(pending.vertical_ids.length,2);
    assert.equal((await ceo.post('/users/bulk-create')).status,200);
    assert.equal(await ctx.db.value('SELECT role FROM users WHERE employee_id=?',newPerson.body.id),'admin');
  } finally { await ctx.close(); }
});
