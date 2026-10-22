import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';

let ctx, origin;
test.beforeAll(async () => { ctx = await boot({ serveClient: true }); origin = ctx.base.replace(/\/api$/, ''); });
test.afterAll(async () => { await ctx?.close(); });

async function signIn(page, email) {
  const result = await page.request.post(`${ctx.base}/auth/login`, {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, email), password: 'Brainadz@2026' },
  });
  expect(result.ok()).toBeTruthy();
  await page.route('**/api/attendance/workday', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, toExplain: 0, toApprove: 0 } });
  });
}

test('policy workflows are top-level menu links and preserve attendance and leave deep links', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await signIn(page, 'rajiv.malhotra@brainadz.com');
  await page.goto(origin + '/attendance?tab=corrections');
  const menu = page.locator('.sidebar .nav');
  await expect(menu.getByRole('button', { name: 'Policies', exact: true })).toHaveCount(0);
  await expect(menu.locator('.nav-group')).toHaveCount(0);
  const links = menu.locator('a[href="/posh"], a[href="/performance"], a[href="/attendance"]');
  await expect(links).toHaveText(['POSH', 'Performance & Appraisal', 'Attendance & Leave']);
  await expect(page.getByRole('heading', { name: 'Attendance & Leave', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Request an attendance correction' })).toBeVisible();
  await page.getByRole('tab', { name: 'Leave & Policies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leave Balance Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Leave Request Workflow' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Who's on Leave" })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'POSH', exact: true })).toHaveCount(0);
  await expect(links.filter({ hasText: 'Attendance & Leave' })).toHaveClass(/active/);
  await page.getByRole('tab', { name: 'Policy Management', exact: true }).click();
  await expect(page).toHaveURL(/\/leave\?tab=policies$/);
  await expect(page.locator('main .alert.error')).toHaveCount(0);
  await page.goto(origin + '/leave?tab=manage#holidays');
  await expect(page.getByRole('tab', { name: 'Leave Management', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#holidays')).toBeVisible();
  await page.goto(origin + '/leave?tab=posh');
  await expect(page).toHaveURL(/\/posh$/);
  await expect(page.getByRole('heading', { name: 'POSH', exact: true })).toBeVisible();
  await links.filter({ hasText: 'Performance & Appraisal' }).click();
  await expect(page.getByRole('heading', { name: 'Performance & Appraisal', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New cycle', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('employee phone navigation uses the three policy sections and keeps confidential POSH access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'aarav.mehta@brainadz.com');
  await page.goto(origin + '/leave?tab=policies');
  await expect(page.locator('.bnav a[href="/attendance"]')).toHaveClass(/on/);
  await page.locator('.bnav').getByRole('button', { name: 'More', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'All modules' });
  await expect(sheet.getByRole('button', { name: 'Attendance & Leave', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Performance & Appraisal', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Leave Policy', exact: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'POSH', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'POSH awareness training', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cases (ICC only)' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Raise a concern', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Read policy', exact: true }).click();
  const policy = page.getByRole('dialog');
  await expect(policy).toContainText('Confidentiality and non-retaliation');
  await expect(policy).toContainText('Internal Committee (ICC)');
});

test('appraisal sample can be edited, persists for employees and the sidebar highlight fits its text', async ({ page }) => {
  await signIn(page, 'rajiv.malhotra@brainadz.com');
  await page.goto(origin + '/performance');
  await expect(page.getByRole('tab', { name: 'Performance', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'New cycle', exact: true })).toBeVisible();
  const selected = page.locator('.sidebar .nav a[href="/performance"]');
  await expect(selected).toHaveClass(/active/);
  await expect(selected).toHaveCSS('border-top-right-radius', '12px');
  const geometry = await selected.evaluate(link => {
    const label = link.querySelector('.nav-label');
    return { rowWidth: link.getBoundingClientRect().width, menuWidth: link.parentElement.clientWidth, textWidth: label.scrollWidth, labelWidth: label.clientWidth };
  });
  expect(Math.abs(geometry.rowWidth - (geometry.menuWidth - 12))).toBeLessThanOrEqual(1);
  expect(geometry.textWidth).toBeLessThanOrEqual(geometry.labelWidth);
  await page.getByRole('tab', { name: 'Appraisal Policy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evaluation criteria', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New cycle', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit policy', exact: true }).click();
  const draft = page.getByRole('textbox', { name: 'Appraisal policy content', exact: true });
  await draft.fill('## Updated appraisal policy\nManager feedback and development plans are discussed at each review.');
  await page.getByRole('button', { name: 'Save policy', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Updated appraisal policy', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Updated appraisal policy', exact: true })).toBeVisible();
  await signIn(page, 'aarav.mehta@brainadz.com');
  await page.goto(origin + '/performance?tab=appraisal');
  await expect(page.getByRole('heading', { name: 'Updated appraisal policy', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit policy', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Performance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Performance', exact: true })).toBeVisible();
  await expect(page.locator('main .alert.error')).toHaveCount(0);
});
