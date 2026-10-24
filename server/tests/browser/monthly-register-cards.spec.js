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
test('monthly register has four employee calendars per desktop row and retains marking and filters', async ({
  page,
}) => {
  await ctx.db.insert('employees', {
    code: 'CALCHECK',
    first_name: 'Calendar',
    last_name: 'Check',
    email: 'calendar-check@example.test',
    join_date: '2020-01-01',
    status: 'Active',
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const result = await page.request.post(`${ctx.base}/auth/login`, {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, 'rajiv.malhotra@brainadz.com'), password: 'Brainadz@2026' },
  });
  expect(result.ok()).toBeTruthy();
  await page.route('**/api/attendance/workday', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, toExplain: 0, toApprove: 0 } });
  });
  const loaded = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/attendance/register',
  );
  await page.goto(origin + '/attendance?tab=month');
  const register = await (await loaded).json();
  const cards = page.locator('.employee-register-card');
  await expect(cards.nth(4)).toBeVisible();
  const initialCount = await cards.count();
  const firstRow = await cards.evaluateAll(
    (items) =>
      items.filter(
        (item) => item.getBoundingClientRect().top === items[0].getBoundingClientRect().top,
      ).length,
  );
  expect(firstRow).toBe(4);
  await expect(cards.first().locator('.employee-register-heading .person')).toBeVisible();
  await expect(cards.first().locator('.employee-register-day')).toHaveCount(register.days.length);
  await expect(page.locator('table.reg')).toHaveCount(0);
  const day = cards
    .filter({ hasText: 'Calendar Check' })
    .locator('.employee-register-day:not(:disabled)')
    .last();
  await day.click();
  const dialog = page.getByRole('dialog', { name: /^Mark attendance/ });
  await expect(dialog).toBeVisible();
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/attendance' &&
      response.request().method() === 'PUT',
  );
  await dialog.getByRole('button', { name: 'Present', exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(dialog).toHaveCount(0);
  await page.getByPlaceholder('Search employee', { exact: true }).fill('Calendar Check');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Calendar Check');
  await page.getByPlaceholder('Search employee', { exact: true }).fill('');
  await expect(cards).toHaveCount(initialCount);
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  const [year, month] = register.month.split('-').map(Number);
  await expect(cards.first().locator('.employee-register-day')).toHaveCount(
    new Date(Date.UTC(year, month - 1, 0)).getUTCDate(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(cards.first()).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
