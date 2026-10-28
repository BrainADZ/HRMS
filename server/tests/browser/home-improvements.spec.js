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
async function login(page, email) {
  const response = await page.request.post(`${ctx.base}/auth/login`, {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, email), password: 'Brainadz@2026' },
  });
  expect(response.ok()).toBeTruthy();
  await page.route('**/api/attendance/workday', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, toExplain: 0, toApprove: 0 } });
  });
}
test('Add employee opens as a full page rather than a scrolling dialog', async ({ page }) => {
  await login(page, 'rajiv.malhotra@brainadz.com');
  await page.goto(origin + '/employees');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page).toHaveURL(/\/employees\/new$/);
  await expect(page.locator('.employee-form-page')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Add employee' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Add employee' })).toBeVisible();
  const role = await page.locator('.employee-login-row .select').boundingBox();
  const cancel = await page
    .locator('.employee-login-row')
    .getByRole('button', { name: 'Cancel' })
    .boundingBox();
  const done = await page
    .locator('.employee-login-row')
    .getByRole('button', { name: 'Done' })
    .boundingBox();
  expect(Math.abs(role.y - cancel.y)).toBeLessThan(4);
  expect(Math.abs(role.y - done.y)).toBeLessThan(4);
});
test('employee profile shows career timeline and recorded salary totals', async ({ page }) => {
  await login(page, 'aarav.mehta@brainadz.com');
  const employeeId = await ctx.db.value(
    "SELECT employee_id FROM users WHERE email='aarav.mehta@brainadz.com'",
  );
  await page.goto(`${origin}/employees/${employeeId}`);
  await page.getByRole('tab', { name: 'Career Growth', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Career timeline' })).toBeVisible();
  await expect(page.getByText('Recorded net salary paid')).toBeVisible();
  await expect(page.getByText('Recorded increments')).toBeVisible();
});
test('login shows only daily wishes; first home visit shows reminders once without permanent cards', async ({
  page,
}) => {
  await page.route('**/api/auth/celebrations', (route) =>
    route.fulfill({
      json: {
        today: '2026-10-22',
        birthdays: [
          { name: 'Birthday One', date: '2026-10-22' },
          { name: 'Birthday Two', date: '2026-10-22' },
          { name: 'Birthday Soon', date: '2026-10-23' },
          { name: 'Birthday Later', date: '2026-10-24' },
        ],
        holidays: [
          { name: 'Today Holiday', date: '2026-10-22', type: 'Company' },
          { name: 'Next Holiday', date: '2026-10-23', type: 'Restricted' },
          { name: 'Later Holiday', date: '2026-10-25', type: 'Company' },
        ],
      },
    }),
  );
  await page.goto(origin);
  const board = page.getByRole('region', { name: 'Birthdays and holidays' });
  for (const text of ['Birthday One', 'Birthday Two', 'Today Holiday'])
    await expect(board).toContainText(text);
  await expect(page.getByText('Birthday Soon', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Next Holiday', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await login(page, 'aarav.mehta@brainadz.com');
  await page.goto(origin + '/my');
  await expect(board).toContainText('Birthday Two');
  const reminder = page.getByRole('dialog', { name: 'Upcoming birthdays & holidays' });
  await expect(reminder).toContainText('Birthday Soon');
  await expect(reminder).toContainText('Next Holiday');
  await expect(reminder).not.toContainText('Birthday Later');
  await expect(reminder).not.toContainText('Later Holiday');
  await expect(board).not.toContainText('Birthday Soon');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page.reload();
  await expect(board).toContainText('Birthday Two');
  await page.waitForTimeout(700);
  await expect(reminder).toHaveCount(0);
  await expect(page.locator('.employee-greeting')).not.toContainText('👋');
  await expect(page.getByRole('heading', { name: 'Upcoming holidays', exact: true })).toHaveCount(
    0,
  );
  const attendance = await page.locator('.daily-attendance').boundingBox();
  const actions = await page.locator('.quick-actions').boundingBox();
  expect(actions.y).toBeGreaterThanOrEqual(attendance.y + attendance.height);
  expect(Math.abs(attendance.width - actions.width)).toBeLessThan(2);
  const tops = await page
    .locator('.quick-actions-row button')
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);
  await page.goto(origin + '/attendance?tab=month');
  await expect(page.locator('.attendance-calendar')).toBeVisible();
  await expect(page.locator('table.reg')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.attendance-calendar')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('account menu uses matching full-width buttons without the default browser border', async ({
  page,
}) => {
  await login(page, 'rajiv.malhotra@brainadz.com');
  await page.goto(origin + '/calendar');
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  const menu = page.locator('.account-menu');
  const install = menu.getByRole('button', { name: 'Get the mobile app', exact: true });
  await expect(install).toBeVisible();
  await expect(install).toHaveCSS('border-top-width', '0px');
  const widths = await menu
    .locator('button.item')
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
  expect(new Set(widths).size).toBe(1);
  await expect(menu.getByRole('button', { name: 'Change photo', exact: true })).toBeVisible();
});

test('notification hover pauses the three-second countdown and click opens its source', async ({
  page,
}) => {
  let announce = false;
  await page.route('**/api/notifications', (route) =>
    route.fulfill({
      json: {
        items: announce
          ? [{ id: 123456, read: false, text: 'Open the holiday calendar', link: '/calendar' }]
          : [],
        unread: announce ? 1 : 0,
      },
    }),
  );
  await login(page, 'rajiv.malhotra@brainadz.com');
  const firstNotifications = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/notifications',
  );
  await page.goto(origin + '/calendar');
  await firstNotifications;
  announce = true;
  await page.locator('.sidebar a[href="/performance"]').click();
  const toast = page.locator('.toast').filter({ hasText: 'Open the holiday calendar' });
  await toast.hover();
  await expect(toast).toContainText('Auto-close paused');
  // Wait longer than its normal lifetime to prove hovering actually stops expiry.
  await page.waitForTimeout(3300);
  await expect(toast).toBeVisible();
  await toast.locator('.toast-message').click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(toast).toHaveCount(0);
});
