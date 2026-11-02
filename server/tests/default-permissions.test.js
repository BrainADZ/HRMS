import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { boot, as } from './helpers.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../../shared/default-permissions.js';
import { permissionMatrix } from '../services/access.js';

test('default roles are seeded, scoped and preserve explicit CEO choices', async () => {
  const ctx = await boot();
  try {
    let matrix = await permissionMatrix(ctx.db);
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS))
      assert.deepEqual(new Set(matrix[role]), new Set(keys));
    assert.ok(matrix.ceo.includes('users.assign'));
    assert.ok(matrix.ceo.includes('system.manage'));
    assert.ok(!matrix.admin.includes('system.manage'));
    assert.ok(!matrix.admin.includes('posh.view'));
    assert.ok(matrix.head.includes('employees.team'));
    assert.ok(!matrix.head.includes('employees.view'));
    assert.ok(!matrix.manager.includes('employees.edit'));
    assert.ok(!matrix.accounts.includes('users.assign'));
    assert.ok(!matrix.employee.includes('employees.sensitive'));
    const ceo = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const staff = await as(ctx.base, 'dev.saxena@brainadz.com');
    const person = await ctx.db.get("SELECT * FROM users WHERE email='dev.saxena@brainadz.com'");
    assert.equal((await ceo.put('/users/' + person.id, {roleAssignments:[{role:'employee'}]})).status,200);
    assert.equal((await staff.post('/employees', {})).status,403);
    assert.equal((await staff.get('/payroll')).status,403);
    const state=(await ceo.get('/permissions')).body;
    assert.equal((await ceo.put('/permissions',{role:'admin',permission:'employees.edit',allowed:false,revision:state.revision})).status,200);
    await ctx.db.exec(await fs.readFile(new URL('../database/030-default-role-permissions.sql',import.meta.url),'utf8'));
    matrix=await permissionMatrix(ctx.db);
    assert.ok(!matrix.admin.includes('employees.edit'),'explicit denial survives seeding');
    assert.ok(matrix.admin.includes('employees.create'));
  } finally { await ctx.close(); }
});
