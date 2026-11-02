import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';
import { loadUser } from '../auth.js';
import { expandRolePermissions, MODULES } from '../../shared/permission-modules.js';

test('module actions preserve legacy grants but explicit action denials take precedence', () => {
  const grants=expandRolePermissions(['employees.manage'],['employees.edit']);
  assert.ok(grants.includes('employees.create'));
  assert.ok(!grants.includes('employees.edit'));
  assert.ok(!MODULES.find(m=>m.key==='employees').actions.includes('delete'));
  assert.ok(!MODULES.find(m=>m.key==='documents').actions.includes('delete'));
  assert.deepEqual(expandRolePermissions(['reports.read']),['reports.read']);
});

test('View, Create, Edit, Delete, Approve and Export are independently enforced', async () => {
  const ctx=await boot();
  await ctx.db.run('DELETE FROM role_permission_rules');
  try {
    const ceo=await as(ctx.base,'rajiv.malhotra@brainadz.com');
    const staff=await as(ctx.base,'dev.saxena@brainadz.com');
    const person=await ctx.db.get("SELECT * FROM users WHERE email='dev.saxena@brainadz.com'");
    const other=await ctx.db.get("SELECT * FROM employees WHERE id!=? AND status='Active' AND grade='Executive' ORDER BY id LIMIT 1",person.employee_id);
    assert.equal((await ceo.put('/users/'+person.id,{roleAssignments:[{role:'employee'}]})).status,200);
    let revision=(await ceo.get('/permissions')).body.revision;
    const grant=async(permission,allowed=true,role='employee')=>{
      const r=await ceo.put('/permissions',{role,permission,allowed,revision});
      assert.equal(r.status,200,JSON.stringify(r.body)); revision=r.body.revision;
    };
    await grant('employees.view');
    const viewed=await staff.get('/employees/'+other.id);
    assert.equal(viewed.status,200);
    assert.notEqual(viewed.body.limited,true);
    const body={first_name:'Granular',email:'granular.actions@example.test',join_date:'2026-11-02',vertical_id:other.vertical_id};
    assert.equal((await staff.post('/employees',body)).status,403);
    assert.equal((await staff.put('/employees/'+other.id,{about:'Denied edit'})).status,403);
    await grant('employees.create');
    const added=await staff.post('/employees',body);
    assert.equal(added.status,200,JSON.stringify(added.body));
    assert.equal((await staff.put('/employees/'+other.id,{about:'Still denied'})).status,403);
    await grant('employees.edit');
    assert.equal((await staff.put('/employees/'+other.id,{about:'Allowed edit'})).status,200);
    assert.equal((await staff.put('/employees/'+other.id,{ctc:900000})).status,403,'sensitive access is independent');
    await grant('assets.create');
    const asset=await staff.post('/employees/'+other.id+'/assets',{type:'Laptop',name:'Granular asset'});
    assert.equal(asset.status,200,JSON.stringify(asset.body));
    assert.equal((await staff.del('/assets/'+asset.body.id)).status,403);
    assert.equal((await staff.put('/assets/'+asset.body.id,{status:'Returned'})).status,403);
    await grant('assets.edit');
    assert.equal((await staff.put('/assets/'+asset.body.id,{status:'Returned'})).status,200);
    assert.equal((await staff.del('/assets/'+asset.body.id)).status,403);
    await grant('assets.delete');
    assert.equal((await staff.del('/assets/'+asset.body.id)).status,200);
    await grant('reports.read');
    assert.equal((await staff.get('/reports/summary')).status,200);
    assert.equal((await staff.get('/reports/headcount.csv')).status,403,'View does not imply Export');
    await grant('reports.export');
    assert.equal((await staff.get('/reports/headcount.csv')).status,200);
    await grant('leave.view');
    assert.equal((await staff.post('/leave/requests/999999/decision',{decision:'Approved'})).status,403);
    await grant('leave.approve');
    assert.equal((await staff.post('/leave/requests/999999/decision',{decision:'Approved'})).status,404);
    await grant('employees.manage');
    await grant('employees.edit',false);
    assert.equal((await staff.put('/employees/'+other.id,{about:'Broad grant cannot override denial'})).status,403);
    await grant('employees.edit',true,'accounts');
    await ceo.put('/users/'+person.id,{roleAssignments:[{role:'employee'},{role:'accounts'}]});
    assert.equal((await staff.put('/employees/'+other.id,{about:'Multiple roles combine grants'})).status,200);
    await grant('employees.edit',false,'accounts');
    assert.equal((await staff.put('/employees/'+other.id,{about:'Revoked on active session'})).status,403);
    assert.ok(!(await loadUser(ctx.db,person.id)).permissions.includes('employees.edit'));
    assert.equal((await staff.get('/permissions')).status,403);
    assert.equal((await staff.post('/payroll/runs')).status,403);
  } finally {await ctx.close();}
});
