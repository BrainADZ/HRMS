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

async function signIn(page) {
  await page.route('**/api/auth/celebrations', (route) =>
    route.fulfill({ json: { today: '2026-10-22', birthdays: [], holidays: [] } }),
  );
  const response = await page.request.post(`${ctx.base}/auth/login`, {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, 'rajiv.malhotra@brainadz.com'), password: 'Brainadz@2026' },
  });
  expect(response.ok()).toBeTruthy();
}

test('compact sidebar persists and calendar holiday actions keep the pausable themed notification', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(origin + '/calendar');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '70px');
  await expect(page.locator('.sidebar-brand-icon')).toBeVisible();
  await expect(page.locator('.sidebar-brand-icon')).toHaveAttribute('src', /icon\.png$/);
  await expect(page.locator('.sidebar .company-logo')).toBeHidden();
  const toggleInside = await page.locator('.sidebar .collapse-btn').evaluate((button) => {
    const toggle = button.getBoundingClientRect();
    const sidebar = button.closest('.sidebar').getBoundingClientRect();
    return (
      toggle.left >= sidebar.left && toggle.right <= sidebar.right && toggle.top >= sidebar.top
    );
  });
  expect(toggleInside).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.locator('.sidebar .company-logo')).toBeVisible();
  await expect(page.locator('.sidebar-brand-icon')).toBeHidden();
  await page.getByRole('button', { name: 'Add holiday', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=date]').fill('2026-12-29');
  await dialog.locator('input[maxlength="80"]').fill('Migration check holiday');
  await dialog.getByRole('button', { name: 'Add holiday', exact: true }).click();
  await expect(
    page.locator('.hol-row').filter({ hasText: 'Migration check holiday' }),
  ).toBeVisible();
  const toast = page.locator('.toast').filter({ hasText: 'Migration check holiday added' });
  await expect(toast.locator('.toast-module')).toHaveAttribute('title', 'Holiday Calendar');
  await toast.hover();
  await expect(toast).toContainText('Auto-close paused');
  await page.getByRole('button', { name: 'Delete Migration check holiday', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.hol-row').filter({ hasText: 'Migration check holiday' })).toHaveCount(
    0,
  );
});

test('phone tabs and searchable More menu retain all current modules and install instructions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(origin);
  const bar = page.locator('.bnav');
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('link', { name: 'Attendance & Leave', exact: true })).toBeVisible();
  await bar.getByRole('button', { name: 'More', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'All modules' });
  await sheet.getByRole('textbox', { name: 'Search modules' }).fill('POSH');
  await sheet.getByRole('button', { name: 'POSH', exact: true }).click();
  await expect(page).toHaveURL(/\/posh$/);
  await expect(page.locator('.sheet')).toHaveCount(0);
  await bar.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: /Install the app.*Open BrainADZ/ }).click();
  await expect(page.getByRole('dialog', { name: 'Install the app' })).toBeVisible();
});

test('hiring drag and drop persists a stage change and prevents bypassing employee conversion', async ({
  page,
}) => {
  const jobId = await ctx.db.value('SELECT id FROM jobs ORDER BY id LIMIT 1');
  const name = 'Migration Pipeline Candidate';
  await ctx.db.insert('candidates', {
    job_id: jobId,
    name,
    stage: 'Applied',
    applied_on: '2026-10-22',
    updated_at: new Date().toISOString(),
  });
  await signIn(page);
  await page.goto(origin + '/hiring');
  const applied = page
    .locator('.kcol')
    .filter({ has: page.locator('h4', { hasText: /^Applied/ }) });
  const target = page
    .locator('.kcol')
    .filter({ has: page.locator('h4', { hasText: /^Shortlisted/ }) });
  const card = applied.locator('.kcard').filter({ hasText: name });
  const saved = page.waitForResponse(
    (response) =>
      /\/api\/candidates\/\d+\/move$/.test(response.url()) &&
      response.request().method() === 'POST',
  );
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent('dragstart', { dataTransfer: transfer });
  await expect(target).toHaveClass(/drop-ok/);
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
  expect((await saved).ok()).toBeTruthy();
  await expect(target.locator('.kcard').filter({ hasText: name })).toBeVisible();
  await page.reload();
  await expect(target.locator('.kcard').filter({ hasText: name })).toBeVisible();
  await expect(
    page
      .locator('.kcol')
      .filter({ has: page.locator('h4', { hasText: /^Hired/ }) })
      .locator('.kcard[draggable=true]'),
  ).toHaveCount(0);
});
