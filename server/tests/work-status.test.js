import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';
import { getSettings, today } from '../core.js';
import { nowTimeIn, addDays } from '../lib/dates.js';

test('simple travelling and site duty need only date, time and reason and respect attendance scope', async () => {
  const ctx = await boot();
  try {
    const employee = await ctx.db.get(
      "SELECT * FROM employees WHERE email='aarav.mehta@brainadz.com'",
    );
    const user = await as(ctx.base, employee.email);
    const manager = await as(ctx.base, 'nandini.joshi@brainadz.com');
    const outsider = await as(ctx.base, 'vikram.patel@brainadz.com');
    const ceo = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const settings = await getSettings(ctx.db);
    const day = await today(ctx.db);
    await ctx.db.run('DELETE FROM work_sessions WHERE employee_id=? AND date=?', employee.id, day);
    await ctx.db.run('DELETE FROM attendance WHERE employee_id=? AND date=?', employee.id, day);
    const form = {
      date: day,
      time: nowTimeIn(settings.timezone),
      reason: 'Flight to client office',
    };
    const tripsBefore = await ctx.db.value('SELECT COUNT(*) FROM travel_trips');
    assert.equal(
      (await user.post('/work-status', { ...form, kind: 'travel', reason: '' })).status,
      400,
    );
    assert.equal(
      (await user.post('/work-status', { ...form, kind: 'travel', date: addDays(day, 1) })).status,
      400,
    );
    let response = await user.post('/work-status', { ...form, kind: 'travel' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const travelId = response.body.id;
    assert.equal(await ctx.db.value('SELECT COUNT(*) FROM travel_trips'), tripsBefore);
    assert.equal(
      await ctx.db.value(
        'SELECT COUNT(*) FROM work_sessions WHERE employee_id=? AND date=?',
        employee.id,
        day,
      ),
      0,
    );
    assert.equal((await user.get('/attendance/today')).body.me.status.travelRunning, true);
    assert.ok((await manager.get('/work-status')).body.items.some((row) => row.id === travelId));
    assert.ok((await ceo.get('/work-status')).body.items.some((row) => row.id === travelId));
    assert.ok(!(await outsider.get('/work-status')).body.items.some((row) => row.id === travelId));
    assert.equal((await outsider.post('/work-status/' + travelId + '/end')).status, 403);
    assert.equal((await user.post('/attendance/check-in', { mode: 'office' })).status, 409);
    assert.equal((await user.post('/work-status', { ...form, kind: 'on_site' })).status, 409);
    const back = await as(ctx.base, employee.email);
    assert.equal((await back.get('/attendance/workday')).body.currentWorkStatus.kind, 'travel');
    const activity = (await back.get('/attendance/activity?from=' + day + '&to=' + day)).body.items;
    assert.equal(
      activity.find((row) => row.employeeId === employee.id).workStatuses[0].reason,
      form.reason,
    );
    assert.equal((await back.post('/work-status/' + travelId + '/end')).status, 200);
    assert.equal((await back.post('/work-status/' + travelId + '/end')).status, 409);
    response = await back.post('/work-status', {
      ...form,
      time: nowTimeIn(settings.timezone),
      reason: 'Client site installation',
      kind: 'on_site',
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const siteId = response.body.id;
    assert.equal((await back.get('/attendance/today')).body.me.status.onDuty, true);
    assert.ok((await back.get('/attendance/workday')).body.workday.openSince);
    await back.post('/auth/logout', { pause: true });
    const resumed = await as(ctx.base, employee.email);
    assert.ok((await resumed.get('/attendance/workday')).body.workday.openSince);
    assert.equal((await resumed.post('/work-status/' + siteId + '/end')).status, 200);
    const after = (await resumed.get('/attendance/workday')).body;
    assert.equal(after.currentWorkStatus, null);
    assert.equal(after.workday.openSince, null);
    const register = (await resumed.get('/attendance/register?month=' + day.slice(0, 7))).body;
    const recorded = register.rows
      .find((row) => row.id === employee.id)
      .days.find((row) => row.date === day);
    assert.equal(recorded.onDuty, true);
    assert.equal(recorded.travelled, true);
  } finally {
    await ctx.close();
  }
});
