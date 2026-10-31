import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';
import { today } from '../../core.js';

let ctx, origin;
test.beforeAll(async () => {
  ctx = await boot({ serveClient: true });
  origin = ctx.base.replace(/\/api$/, '');
  const employeeId = await ctx.db.value(
    "SELECT id FROM employees WHERE email='aarav.mehta@brainadz.com'",
  );
  const day = await today(ctx.db);
  await ctx.db.run('DELETE FROM work_sessions WHERE employee_id=? AND date=?', employeeId, day);
  await ctx.db.run('DELETE FROM attendance WHERE employee_id=? AND date=?', employeeId, day);
});
test.afterAll(async () => {
  await ctx?.close();
});

test('simple status popup saves travelling and on-site duty without trip forms or timers', async ({
  page,
}, testInfo) => {
  const login = await page.request.post(ctx.base + '/auth/login', {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, 'aarav.mehta@brainadz.com'), password: 'Brainadz@2026' },
  });
  expect(login.ok()).toBeTruthy();
  await page.route('**/api/auth/celebrations', (route) =>
    route.fulfill({ json: { today: '2026-10-30', birthdays: [], holidays: [] } }),
  );
  await page.route('**/api/notices', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/attendance/workday', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), toExplain: 0, toApprove: 0 },
    });
  });
  await page.goto(origin + '/travel');
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole('link', { name: 'Travel & On Duty', exact: true })).toHaveCount(0);
  const card = page.getByRole('region', { name: "Today's attendance", exact: true });
  await expect(page.getByRole('button', { name: 'Request a trip', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Travelling', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Status date')).toBeVisible();
  await expect(dialog.getByLabel('Status time')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save status' })).toBeDisabled();
  await dialog.getByLabel('Status reason').fill('Flight to the client office');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('status-popup-mobile.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByRole('button', { name: 'Reached', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Break', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check out', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reached', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reached', exact: true }).click();
  await card.getByRole('button', { name: 'On-site duty', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Status reason').fill('Working at the client site');
  await page.getByRole('dialog').getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByRole('button', { name: 'Finish duty', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('site-duty-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish duty', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Travelling', exact: true })).toBeVisible();
});
