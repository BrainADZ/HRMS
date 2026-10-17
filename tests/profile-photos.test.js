import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, as, client } from './helpers.js';
import { hashPassword } from '../server/auth.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const form = (bytes = png, name = 'portrait.png') => {
  const body = new FormData(); body.append('photo', new Blob([bytes], { type: 'image/png' }), name); return body;
};
let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx?.close(); });

test('admin, manager and employee upload their own photo; auth, profile and protected image agree', async () => {
  for (const email of ['rajiv.malhotra@brainadz.com', 'vikram.patel@brainadz.com', 'aarav.mehta@brainadz.com']) {
    const c = await as(ctx.base, email);
    const user = (await c.get('/auth/me')).body.user;
    assert.equal((await c.post('/profile/photo', undefined, { form: form() })).status, 200);
    const updated = (await c.get('/auth/me')).body.user;
    assert.equal(updated.hasPhoto, true);
    assert.match(updated.photoUrl, new RegExp(`/files/photo/${user.employeeId}\\?v=`));
    assert.equal((await c.get(`/employees/${user.employeeId}`)).body.employee.has_photo, true);
    assert.equal((await c.get(updated.photoUrl.replace('/api', ''))).status, 200);
    const filename = await ctx.db.value('SELECT photo FROM employees WHERE id=?', user.employeeId);
    assert.deepEqual(fs.readFileSync(path.join(ctx.dir, 'uploads', 'photos', filename)), png);
  }
});

test('standalone administrators can save a photo without creating an employee', async () => {
  const uid = await ctx.db.insert('users', { email: 'portrait.admin@example.com', role: 'admin', password_hash: hashPassword('Portrait2026') });
  const c = await as(ctx.base, 'portrait.admin@example.com', 'Portrait2026');
  assert.equal((await c.post('/profile/photo', undefined, { form: form() })).status, 200);
  const user = (await c.get('/auth/me')).body.user;
  assert.equal(user.employeeId, null);
  assert.equal(user.hasPhoto, true);
  assert.match(user.photoUrl, new RegExp(`/files/avatar/${uid}\\?v=`));
  assert.equal((await c.get(user.photoUrl.replace('/api', ''))).status, 200);
  const emp = await as(ctx.base, 'aarav.mehta@brainadz.com');
  assert.equal((await emp.get(`/files/avatar/${uid}`)).status, 403);
});

test('rejected uploads preserve the current photo and cannot change another employee', async () => {
  const emp = await as(ctx.base, 'aarav.mehta@brainadz.com');
  const me = (await emp.get('/auth/me')).body.user;
  const before = await ctx.db.value('SELECT photo FROM employees WHERE id=?', me.employeeId);
  const folder = path.join(ctx.dir, 'uploads', 'photos');
  const count = fs.readdirSync(folder).length;
  assert.equal((await emp.post('/profile/photo', undefined, { form: form('fake image') })).status, 400);
  assert.equal((await emp.post('/profile/photo')).status, 400);
  const ceo = await ctx.db.value("SELECT employee_id FROM users WHERE role='admin' AND employee_id IS NOT NULL LIMIT 1");
  assert.equal((await emp.post(`/employees/${ceo}/photo`, undefined, { form: form() })).status, 403);
  assert.equal((await client(ctx.base).post('/profile/photo', undefined, { form: form() })).status, 401);
  assert.equal(await ctx.db.value('SELECT photo FROM employees WHERE id=?', me.employeeId), before);
  assert.equal(fs.readdirSync(folder).length, count);
});

test('HR photo replacement updates the profile URL and removes the obsolete image after commit', async () => {
  const hr = await as(ctx.base, 'priya.sharma@brainadz.com');
  const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
  const before = (await employee.get('/auth/me')).body.user;
  const old = await ctx.db.value('SELECT photo FROM employees WHERE id=?', before.employeeId);
  assert.equal((await hr.post(`/employees/${before.employeeId}/photo`, undefined, { form: form() })).status, 200);
  const after = (await employee.get('/auth/me')).body.user;
  assert.notEqual(after.photoUrl, before.photoUrl);
  for (let retry = 0; retry < 20 && fs.existsSync(path.join(ctx.dir, 'uploads', 'photos', old)); retry++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fs.existsSync(path.join(ctx.dir, 'uploads', 'photos', old)), false);
});
