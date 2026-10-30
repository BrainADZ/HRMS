import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('journey is a persistent status and duty ends through a completed update', async () => {
  const ctx = await boot();
  try {
    const email = 'aarav.mehta@brainadz.com';
    const employee = await ctx.db.get('SELECT * FROM employees WHERE email=?', email);
    const account = await ctx.db.get('SELECT * FROM users WHERE employee_id=?', employee.id);
    const approver = await ctx.db.get("SELECT * FROM users WHERE role='admin' LIMIT 1");
    const user = await as(ctx.base, email);
    const day = (await user.get('/attendance/workday')).body.today;
    await ctx.db.run('DELETE FROM work_sessions WHERE employee_id=?', employee.id);
    await ctx.db.run('DELETE FROM attendance WHERE employee_id=?', employee.id);
    const tripId = await ctx.db.insert('travel_trips', {
      project: 'Journey test',
      city: 'Mumbai',
      site: 'Expo',
      purpose: 'Site work',
      from_date: day,
      to_date: day,
      status: 'Approved',
      requested_by: account.id,
      approver_id: approver.id,
    });
    await ctx.db.insert('travel_members', { trip_id: tripId, employee_id: employee.id });
    const path = '/travel/' + tripId;
    assert.equal((await user.post(path + '/journey', { action: 'reached' })).status, 409);
    assert.equal((await user.post(path + '/journey', { action: 'travel' })).status, 200);
    assert.equal((await user.post(path + '/journey', { action: 'travel' })).status, 409);
    assert.equal(
      await ctx.db.value('SELECT COUNT(*) FROM work_sessions WHERE employee_id=?', employee.id),
      0,
    );
    const back = await as(ctx.base, email);
    let snapshot = (await back.get('/attendance/workday')).body;
    assert.equal(snapshot.workday.openSince, null);
    assert.equal(snapshot.travelTrips.find((t) => t.id === tripId).current_status, 'Travelling');
    assert.equal((await back.post('/attendance/check-in', { mode: 'office' })).status, 409);
    const manager = await as(ctx.base, approver.email);
    assert.equal((await manager.get(path)).body.members[0].latestUpdate.status, 'Travelling');
    const directory = await manager.get('/employees');
    assert.equal(
      directory.body.items.find((e) => e.id === employee.id).travel_status,
      'Travelling',
    );
    const location = { lat: 19.076, lng: 72.8777, accuracy: 20 };
    assert.equal(
      (await back.post(path + '/start', { activity_type: 'duty', location })).status,
      409,
    );
    assert.equal((await back.post(path + '/journey', { action: 'reached' })).status, 200);
    assert.equal(
      await ctx.db.value('SELECT COUNT(*) FROM work_sessions WHERE employee_id=?', employee.id),
      0,
    );
    assert.equal(
      (await back.post(path + '/start', { activity_type: 'duty', location })).status,
      200,
    );
    assert.equal(
      (await back.post('/attendance/check-out', { action: 'break', location })).status,
      409,
    );
    assert.equal((await back.post('/attendance/check-out', { location })).status, 409);
    const form = new FormData();
    form.append('status', 'Work completed');
    form.append('note', 'Site work finished');
    assert.equal((await back.post(path + '/updates', undefined, { form })).status, 200);
    snapshot = (await back.get('/attendance/workday')).body;
    assert.equal(snapshot.workday.openSince, null);
    assert.ok(snapshot.workday.checkedOutAt);
    assert.equal((await manager.get(path)).body.members[0].latestUpdate.status, 'Work completed');
    assert.equal((await manager.get(path)).body.members[0].running, false);
    assert.equal((await manager.post(path + '/journey', { action: 'travel' })).status, 403);
    assert.equal((await back.post(path + '/journey', { action: 'travel' })).status, 200);
    assert.equal((await back.post(path + '/submit', { summary: 'Still travelling' })).status, 400);
    assert.equal((await back.post(path + '/journey', { action: 'reached' })).status, 200);
  } finally {
    await ctx.close();
  }
});
