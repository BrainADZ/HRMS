import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';

let ctx;
test.beforeAll(async () => {
  ctx = await boot({ serveClient: true });
});
test.afterAll(async () => {
  await ctx?.close();
});

test('CEO saves a permission chart and assigns scoped multiple roles', async ({ page }) => {
  await page.route('**/api/auth/celebrations', (route) =>
    route.fulfill({ json: { today: '2026-11-02', birthdays: [], holidays: [] } }),
  );
  const origin = ctx.base.replace(/\/api$/, '');
  const result = await page.request.post(ctx.base + '/auth/login', {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, 'rajiv.malhotra@brainadz.com'), password: 'Brainadz@2026' },
  });
  expect(result.ok()).toBe(true);
  await page.goto(origin + '/access?tab=permissions');
  await page.getByRole('button', {name:'Head', exact:true}).click();
  const grant = page.getByRole('checkbox', {
    name: 'Head: View Reports',
    exact: true,
  });
  await expect(grant).not.toBeChecked();
  await grant.check();
  await expect(grant).toBeEnabled();
  await page.reload();
  await page.getByRole('button', {name:'Head', exact:true}).click();
  await expect(grant).toBeChecked();
  await page.getByRole('button',{name:'Additional controls for Employees',exact:true}).click();
  const sensitive=page.getByRole('checkbox',{name:'Head: View compensation and personal details',exact:true});
  await sensitive.check();
  await expect(sensitive).toBeEnabled();
  const create=page.getByRole('checkbox',{name:'Head: Create Employees',exact:true});
  await create.check();
  await expect(create).toBeEnabled();
  await expect(page.getByRole('checkbox',{name:'Head: Edit Employees',exact:true})).not.toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Head: Delete Employees',exact:true})).toHaveCount(0);
  await page.getByRole('tab', { name: 'People & roles', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Vikram Patel' });
  await row.getByRole('button', { name: 'Edit access', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Role 1', { exact: true }).selectOption('head');
  const employee = await ctx.db.get("SELECT * FROM employees WHERE first_name='Vikram'");
  await dialog
    .getByLabel('Role 1 vertical', { exact: true })
    .selectOption(String(employee.vertical_id));
  await dialog
    .getByLabel('Role 1 department', { exact: true })
    .selectOption(String(employee.department_id));
  const secondary = await ctx.db.get('SELECT * FROM verticals WHERE id!=? ORDER BY id LIMIT 1',employee.vertical_id);
  await dialog.getByRole('checkbox',{name:secondary.name,exact:true}).check();
  await dialog.getByRole('button', { name: 'Add responsibility', exact: true }).click();
  await dialog.getByLabel('Role 2', { exact: true }).selectOption('accounts');
  await dialog.getByRole('button', { name: 'Save access', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText('Head');
  await expect(row).toContainText('Accounts');
  await expect(row).toContainText(secondary.name);
  expect((await page.request.get(ctx.base + '/permissions')).ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/settings?tab=permissions');
  await expect(page).toHaveURL(/\/access\?tab=permissions/);
  await page.getByRole('button', {name:'Head',exact:true}).click();
  await expect(grant).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
