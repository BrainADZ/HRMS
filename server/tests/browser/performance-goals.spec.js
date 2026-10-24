import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';

let ctx, origin;
test.beforeAll(async () => {
  ctx = await boot({ serveClient: true });
  origin = ctx.base.replace(/\/api$/, '');
});
test.afterAll(async () => {
  await ctx?.close();
});

test('employee sets a goal from Performance and My Space opens the same form', async ({ page }) => {
  const login = await page.request.post(`${ctx.base}/auth/login`, {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, 'aarav.mehta@brainadz.com'), password: 'Brainadz@2026' },
  });
  expect(login.ok()).toBeTruthy();
  const me = await (await page.request.get(`${ctx.base}/auth/me`)).json();
  const cycle = await ctx.db.get(
    "SELECT * FROM review_cycles WHERE status = 'Active' ORDER BY start_date DESC LIMIT 1",
  );
  await ctx.db.run(
    'DELETE FROM goals WHERE employee_id = ? AND cycle_id = ?',
    me.user.employeeId,
    cycle.id,
  );
  await ctx.db.run(
    "UPDATE reviews SET status = 'Not Started' WHERE employee_id = ? AND cycle_id = ?",
    me.user.employeeId,
    cycle.id,
  );
  await page.route('**/api/attendance/workday', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), toExplain: 0, toApprove: 0 },
    });
  });
  await page.goto(origin + '/performance');
  await page.getByRole('button', { name: 'Set goal', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Set performance goal' });
  await form.getByPlaceholder('e.g. Launch 4 campaigns').fill('Launch October campaign');
  await form.locator('textarea').fill('Generate 100 qualified leads');
  await form.locator('input[type="number"]').fill('100');
  await form.getByRole('button', { name: 'Add goal', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: 'Update goals & self review' }).click();
  await expect(page.getByRole('dialog')).toContainText('Launch October campaign');
  await expect(page.getByRole('dialog')).toContainText('Generate 100 qualified leads');
  const saved = await ctx.db.get(
    'SELECT * FROM goals WHERE employee_id = ? AND cycle_id = ?',
    me.user.employeeId,
    cycle.id,
  );
  expect(saved.weight).toBe(100);
  expect(saved.due_date).toBe(cycle.end_date);
  await page.goto(origin + '/my');
  const reminder = page.getByRole('button', { name: 'Got it', exact: true });
  if (await reminder.isVisible()) await reminder.click();
  await page.getByRole('link', { name: 'Set goal', exact: true }).click();
  await expect(form).toBeVisible();
});
