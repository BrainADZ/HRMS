import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';
import { today, setSetting } from '../../core.js';
import { addDays, dow } from '../../lib/dates.js';

let ctx, origin, employeeId, missed, day;
test.beforeAll(async () => {
  ctx = await boot({ serveClient: true });
  origin = ctx.base.replace(/\/api$/, '');
  employeeId = await ctx.db.value(
    "SELECT id FROM employees WHERE email='aarav.mehta@brainadz.com'",
  );
  day = await today(ctx.db);
  missed = Array.from({ length: 7 }, (_, i) => addDays(day, -i - 1)).find(
    (date) => ![0, 6].includes(dow(date)),
  );
  await setSetting(ctx.db, 'weeklyOffs', [0, 6]);
  await ctx.db.run("UPDATE payroll_runs SET status='In Review'");
  await ctx.db.run('DELETE FROM holidays WHERE date=?', missed);
  await ctx.db.run(
    'DELETE FROM leave_requests WHERE employee_id=? AND from_date<=? AND to_date>=?',
    employeeId,
    missed,
    missed,
  );
  for (const table of ['work_sessions', 'attendance', 'hour_shortfalls'])
    await ctx.db.run(
      'DELETE FROM ' + table + ' WHERE employee_id=? AND date>=?',
      employeeId,
      missed,
    );
});
test.afterAll(async () => {
  await ctx?.close();
});

test('check-in asks for yesterday’s missing attendance and cannot start until a reason is supplied', async ({
  page,
}, testInfo) => {
  await page.request.post(ctx.base + '/auth/login', {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, 'aarav.mehta@brainadz.com'), password: 'Brainadz@2026' },
  });
  await page.route('**/api/auth/celebrations', (route) =>
    route.fulfill({ json: { today: day, birthdays: [], holidays: [] } }),
  );
  await page.route('**/api/notices', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/attendance/workday', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), toExplain: 0, toApprove: 0 },
    });
  });
  await page.goto(origin + '/my');
  const card = page.getByRole('region', { name: "Today's attendance", exact: true });
  await card.getByRole('button', { name: 'Check in', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Explain missing attendance', exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Continue check-in' })).toBeDisabled();
  expect(
    await ctx.db.value(
      'SELECT COUNT(*) FROM work_sessions WHERE employee_id=? AND date=?',
      employeeId,
      day,
    ),
  ).toBe(0);
  await modal.getByRole('button', { name: 'Cancel check-in' }).click();
  await card.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(modal).toBeVisible();
  await modal
    .getByLabel('Reason for ' + missed)
    .fill('I was unwell yesterday and missed recording attendance.');
  await page.screenshot({
    path: testInfo.outputPath('required-absence-reason.png'),
    fullPage: true,
  });
  await modal.getByRole('button', { name: 'Continue check-in' }).click();
  await expect(modal).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Check out', exact: true })).toBeVisible();
  expect(
    await ctx.db.value(
      'SELECT status FROM attendance WHERE employee_id=? AND date=?',
      employeeId,
      missed,
    ),
  ).toBe('A');
  expect(
    await ctx.db.value(
      'SELECT status FROM hour_shortfalls WHERE employee_id=? AND date=?',
      employeeId,
      missed,
    ),
  ).toBe('Pending approval');
  await page.goto(origin + '/attendance?tab=month');
  await expect(page.getByRole('button', { name: missed + ': Absent', exact: true })).toBeVisible();
});
