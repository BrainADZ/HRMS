import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { today } from '../core.js';
import * as D from '../lib/dates.js';

test('public celebration feed includes every birthday and holiday without private employee fields', async () => {
  const ctx = await boot();
  try {
    const T = await today(ctx.db);
    const tomorrow = D.addDays(T, 1);
    for (let index = 0; index < 8; index++)
      await ctx.db.insert('employees', {
        code: `WISH${index}`,
        first_name: `Birthday${index}`,
        last_name: 'Check',
        email: `wish${index}@example.test`,
        dob: `1990-${T.slice(5)}`,
        join_date: '2020-01-01',
        status: 'Active',
      });
    await ctx.db.insert('employees', {
      code: 'WISHNEXT',
      first_name: 'Tomorrow',
      last_name: 'Check',
      email: 'wishnext@example.test',
      dob: `1992-${tomorrow.slice(5)}`,
      join_date: '2020-01-01',
      status: 'Active',
    });
    await ctx.db.insert('employees', {
      code: 'WISHEXIT',
      first_name: 'Exited',
      last_name: 'Check',
      email: 'wishexit@example.test',
      dob: `1990-${T.slice(5)}`,
      join_date: '2020-01-01',
      status: 'Exited',
    });
    await ctx.db.insert('holidays', { date: T, name: 'Wish test holiday', type: 'Restricted' });
    const response = await fetch(`${ctx.base}/auth/celebrations`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.today, T);
    assert.equal(data.birthdays.filter((item) => /^Birthday\d Check$/.test(item.name)).length, 8);
    assert.ok(
      data.birthdays.some((item) => item.name === 'Tomorrow Check' && item.date === tomorrow),
    );
    assert.ok(!data.birthdays.some((item) => item.name === 'Exited Check'));
    assert.ok(data.holidays.some((item) => item.name === 'Wish test holiday'));
    for (const item of data.birthdays) assert.deepEqual(Object.keys(item).sort(), ['date', 'name']);
  } finally {
    await ctx.close();
  }
});
