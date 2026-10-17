import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';
import { hashPassword } from '../../server/auth.js';

let ctx, origin;
test.beforeAll(async () => { ctx = await boot({ serveClient: true }); origin = ctx.base.replace(/\/api$/, ''); });
test.afterAll(async () => { await ctx?.close(); });

const common = ['/my', '/employees', '/documents', '/leave', '/calendar', '/performance', '/attendance', '/posh', '/resignation'];
for (const [role, email, routes] of [
  ['admin', 'rajiv.malhotra@brainadz.com', ['/', '/hiring', '/screener', '/payroll', '/reports', '/settings', ...common]],
  ['hr', 'priya.sharma@brainadz.com', ['/', '/hiring', '/screener', '/payroll', '/reports', '/settings', ...common]],
  ['manager', 'vikram.patel@brainadz.com', ['/', '/hiring', ...common]],
  ['employee', 'aarav.mehta@brainadz.com', common],
]) {
  test(`${role}: sign in and render permitted pages`, async ({ page }) => {
    const errors = [], failures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    await page.goto(origin);
    const login = credentials(ctx.base, email);
    if (role === 'admin') {
      await page.getByRole('button', { name: 'Admin login', exact: true }).click();
      await page.locator('input[type=email]').fill(email);
    } else await page.getByPlaceholder('aaravbz030').fill(login.username);
    await page.locator('input[type=password]').fill('Brainadz@2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    // Seeded employees may first receive the normal short-hours reminder.
    for (let prompt = 0; prompt < 2; prompt++) {
      const later = page.getByRole('button', { name: /^(Later|Not now, I'm done for today)$/ });
      if (!await later.isVisible()) break;
      await later.click();
      await page.waitForLoadState('networkidle');
    }
    // Every role can replace its initials/default image with an uploaded photo.
    await expect(page.locator('.user-chip svg[role=img]')).toBeVisible();
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await page.getByRole('button', { name: 'Change photo', exact: true }).click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    await page.getByLabel('Profile image', { exact: true }).setInputFiles({ name: 'profile.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Save photo', exact: true }).click();
    await expect(page.locator('.user-chip img')).toBeVisible();
    await expect.poll(() => page.locator('.user-chip img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    const oldSrc = await page.locator('.user-chip img').getAttribute('src');
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await page.getByRole('button', { name: 'Change photo', exact: true }).click();
    await page.getByLabel('Profile image', { exact: true }).setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Save photo', exact: true }).click();
    await expect(page.locator('.user-chip img')).not.toHaveAttribute('src', oldSrc);
    for (const route of routes) {
      await page.goto(origin + route);
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main .alert.error')).toHaveCount(0);
      await expect(page.locator('.user-chip img')).toBeVisible();
    }
    if (role === 'employee' || role === 'manager') {
      await page.goto(origin + '/payroll');
      await expect(page).not.toHaveURL(/\/payroll$/);
    }
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
  });
}

test('standalone admin uploads an account photo and it persists after reload', async ({ page }) => {
  await ctx.db.insert('users', { email: 'browser.admin@example.com', role: 'admin', password_hash: hashPassword('BrowserPhoto2026') });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Admin login', exact: true }).click();
  await page.locator('input[type=email]').fill('browser.admin@example.com');
  await page.locator('input[type=password]').fill('BrowserPhoto2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('main')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('button', { name: 'Change photo', exact: true }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('Profile image', { exact: true }).setInputFiles({ name: 'admin.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.locator('.user-chip img')).toHaveAttribute('src', /\/api\/files\/avatar\//);
  await expect.poll(() => page.locator('.user-chip img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('.user-chip img')).toBeVisible();
  await expect.poll(() => page.locator('.user-chip img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
});
