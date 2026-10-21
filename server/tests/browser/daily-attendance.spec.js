import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';

let ctx;
test.beforeAll(async () => { ctx = await boot({ serveClient: true }); });
test.afterAll(async () => { await ctx?.close(); });

for (const [role, email, path] of [['employee', 'aarav.mehta@brainadz.com', '/my'], ['manager', 'vikram.patel@brainadz.com', '/']]) {
  test(`${role} sees the full day attendance and live break status on their dashboard`, async ({ page }) => {
    const origin = ctx.base.replace(/\/api$/, '');
    const login = await page.request.post(`${ctx.base}/auth/login`, { headers: { 'X-Requested-With': 'hrms' }, data: { ...credentials(ctx.base, email), password: 'Brainadz@2026' } });
    expect(login.ok()).toBe(true);
    const now = Date.now();
    const at = (minutes) => new Date(now - minutes * 60000).toISOString();
    const workday = {
      sessions: [{ start: at(120), end: at(90), mode: 'office', endedBy: 'break' }, { start: at(75), end: null, mode: 'office', endedBy: null }],
      gaps: [{ from: at(90), to: at(75), minutes: 15, leftBy: 'break', reason: 'Break' }],
      workedMinutes: 30, openSince: at(75), mode: 'office', awaySince: null, breakSince: null, breakMinutes: 15, requiredMinutes: 480,
    };
    await page.route('**/api/attendance/workday', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({ response, json: { ...data, serverNow: new Date().toISOString(), toExplain: 0, toApprove: 0, dayStatus: 'P', workday } });
    });
    await page.route('**/api/attendance/check-out', async (route) => {
      expect(route.request().postDataJSON().action).toBe('break');
      const end = new Date().toISOString();
      workday.sessions.at(-1).end = end;
      workday.sessions.at(-1).endedBy = 'break';
      workday.workedMinutes = 105;
      workday.openSince = null;
      workday.breakSince = end;
      workday.awaySince = end;
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(origin + path);
    const card = page.getByRole('region', { name: "Today's attendance", exact: true });
    await expect(card).toBeVisible();
    await expect(card.locator('.daily-attendance-status')).toHaveText('Working');
    for (const label of ['First check-in', 'Last check-out', 'Worked today', 'Break time', 'Daily target', "Today's activity"]) await expect(card.getByText(label, { exact: true })).toBeVisible();
    await expect(card.getByText('Break 0:15:00', { exact: true })).toBeVisible();
    await expect(card.getByText('8h 00m', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Break', exact: true }).click();
    await expect(card.locator('.daily-attendance-status')).toHaveText('On break');
    await expect(card.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(card).toBeVisible();
    expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  });
}
