import { test, expect } from '@playwright/test';
import { boot } from '../helpers.js';

let ctx;
const emails = [];
const mailer = {
  appUrl: 'http://localhost',
  send: async (message) => {
    emails.push(message);
  },
};
test.beforeAll(async () => {
  ctx = await boot({ serveClient: true, passwordResetMailer: mailer });
  mailer.appUrl = ctx.base.replace(/\/api$/, '');
});
test.afterAll(async () => {
  await ctx?.close();
});

test('admin follows the emailed link, confirms a new password and signs in', async ({ page }) => {
  await page.goto(mailer.appUrl);
  await page.getByRole('button', { name: 'Admin login', exact: true }).click();
  await page.locator('input[type=email]').fill('rajiv.malhotra@brainadz.com');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await expect(page.getByText(/a password reset link has been sent/)).toBeVisible();
  expect(emails).toHaveLength(1);
  await page.goto(emails[0].resetUrl);
  await expect(page.getByRole('heading', { name: 'Reset admin password' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await page.getByLabel('New password', { exact: true }).fill('BrowserReset2026');
  await page.getByLabel('Confirm password', { exact: true }).fill('Different2026');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  await page.getByLabel('Confirm password', { exact: true }).fill('BrowserReset2026');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Admin login', exact: true }).click();
  await page.locator('input[type=email]').fill('rajiv.malhotra@brainadz.com');
  await page.locator('input[type=password]').fill('BrowserReset2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Account menu', exact: true })).toBeVisible();
});
