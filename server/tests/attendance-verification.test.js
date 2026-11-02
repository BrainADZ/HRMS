import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { boot, as } from './helpers.js';
import { today } from '../core.js';

test('retired verification preserves marks and allows normal corrections', async () => {
  const ctx = await boot();
  try {
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const employee = await ctx.db.get("SELECT * FROM employees WHERE email='dev.saxena@brainadz.com'");
    const day = await today(ctx.db);
    await ctx.db.insert('attendance_verifications', {
      employee_id: employee.id, date: day, status: 'HD', note: 'Historical mark',
      verified_by: await ctx.db.value("SELECT id FROM users WHERE email='rajiv.malhotra@brainadz.com'"),
      verified_by_name: 'Rajiv', verified_at: new Date().toISOString(),
    });
    await ctx.db.exec(await fs.readFile(new URL('../database/029-retire-attendance-verification.sql', import.meta.url), 'utf8'));
    assert.equal(await ctx.db.value('SELECT status FROM attendance WHERE employee_id=? AND date=?', employee.id, day), 'HD');
    for (const path of ['/attendance/verification','/attendance/verification/history','/attendance/verification/export.csv'])
      assert.equal((await admin.get(path)).status, 404);
    assert.equal((await admin.put('/attendance/verification', {employee_id:employee.id,date:day,status:'A'})).status, 404);
    assert.ok(!(await admin.get('/permissions')).body.permissions.some(p=>p.key==='attendance.verify'));
    const changed=await admin.put('/attendance',{employee_id:employee.id,date:day,status:'P'});
    assert.equal(changed.status,200,JSON.stringify(changed.body));
    assert.equal(await ctx.db.value('SELECT status FROM attendance WHERE employee_id=? AND date=?', employee.id,day),'P');
    assert.equal(await ctx.db.value('SELECT COUNT(*) FROM attendance_verifications WHERE employee_id=?',employee.id),1);
    assert.equal((await admin.get('/attendance/register')).status,200);
  } finally {await ctx.close();}
});
