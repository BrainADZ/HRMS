import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';
import path from 'node:path';

let ctx;
test.beforeAll(async () => { ctx = await boot({ serveClient: true }); });
test.afterAll(async () => { await ctx?.close(); });

async function prepareClock(page, mockPip = true, origin = ctx.base.replace(/\/api$/, '')) {
  await page.route('**/api/auth/celebrations', route => route.fulfill({ json: { today: '2026-10-22', birthdays: [], holidays: [] } }));
  const login = await page.request.post(`${ctx.base}/auth/login`, {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, 'aarav.mehta@brainadz.com'), password: 'Brainadz@2026' },
  });
  expect(login.ok()).toBeTruthy();
  // A normal popup stands in for browser-owned PiP chrome in this headless test.
  if (mockPip) await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      async requestWindow(options) {
        window.__pipOptions = options;
        const popup = window.open('about:blank', 'test-work-clock', 'popup,width=300,height=245');
        popup.resizeBy = (width, height) => { popup.__requestedSize = { width: popup.innerWidth + width, height: popup.innerHeight + height }; };
        return popup;
      },
    } });
  });
  await page.route('**/api/attendance/workday', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const start = new Date(Date.now() - 60000).toISOString();
    await route.fulfill({ response, json: {
      ...data, toExplain: 0, toApprove: 0, dayStatus: 'P',
      workday: { ...data.workday, signedOutAway: false, requiredMinutes: 480, workedMinutes: 0, openSince: start, breakSince: null, awaySince: null, sessions: [{ start, end: null, mode: 'office' }] },
    } });
  });
  await page.goto(origin);
}

test('floating timer has a top-right size toggle, no custom back button, and fits without scrolling', async ({ page }) => {
  await prepareClock(page);
  await page.getByRole('button', { name: 'Work clock', exact: true }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop out clock', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('button', { name: 'Break', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__pipOptions.disallowReturnToOpener)).toBe(true);
  await expect(popup.getByRole('button', { name: 'Back to tab', exact: true })).toHaveCount(0);
  const layout = await popup.evaluate(() => {
    const button = document.querySelector('.pip-size-toggle').getBoundingClientRect();
    return { right: innerWidth - button.right, top: button.top, height: document.querySelector('.pip-clock').getBoundingClientRect().height, viewport: innerHeight, overflow: getComputedStyle(document.documentElement).overflowY };
  });
  expect(layout.right).toBeLessThanOrEqual(14);
  expect(layout.top).toBeLessThanOrEqual(10);
  expect(layout.height).toBeLessThanOrEqual(layout.viewport);
  expect(layout.overflow).toBe('hidden');
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.pip-clock { --clock-style-sync: updated; }';
    document.head.append(style);
  });
  await expect.poll(() => popup.locator('.pip-clock').evaluate((node) => getComputedStyle(node).getPropertyValue('--clock-style-sync').trim())).toBe('updated');
  await expect(popup.getByRole('button', { name: 'Minimize timer' }).locator('svg')).toHaveClass(/lucide-minus/);
  await popup.getByRole('button', { name: 'Minimize timer', exact: true }).click();
  await expect(popup.getByLabel('Time worked')).toBeVisible();
  await expect(popup.locator('.pip-state')).toHaveText('Working');
  await expect(popup.locator('.pip-state')).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Break', exact: true })).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'Check out', exact: true })).toHaveCount(0);
  const compact = await popup.evaluate(() => window.__requestedSize);
  const compactButton = await popup.getByRole('button', { name: 'Expand timer' }).evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { top: bounds.top, right: innerWidth - bounds.right, width: bounds.width, height: bounds.height };
  });
  expect(compactButton).toEqual({ top: layout.top, right: layout.right, width: 14, height: 14 });
  expect(compact.width).toBe(170);
  await popup.setViewportSize({ width: 170, height: 40 });
  const compactLayout = await popup.getByLabel('Time worked').evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { bottom: bounds.bottom, right: bounds.right, height: innerHeight, width: innerWidth, scrollHeight: document.documentElement.scrollHeight };
  });
  expect(compactLayout.bottom).toBeLessThanOrEqual(compactLayout.height);
  expect(compactLayout.right).toBeLessThanOrEqual(compactLayout.width);
  expect(compactLayout.scrollHeight).toBeLessThanOrEqual(compactLayout.height);
  expect(popup.isClosed()).toBe(false);
  await popup.getByRole('button', { name: 'Expand timer', exact: true }).click();
  await popup.setViewportSize({ width: 300, height: 245 });
  await expect(popup.getByRole('button', { name: 'Break', exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Check out', exact: true })).toBeVisible();
  const expanded = await popup.evaluate(() => window.__requestedSize);
  expect(expanded.width).toBeGreaterThan(compact.width);
  expect(expanded.height).toBeGreaterThan(compact.height);
  await popup.close();
});

test('pause clock and sign out closes the floating window after successful logout', async ({ page }) => {
  await prepareClock(page);
  await page.getByRole('button', { name: 'Work clock', exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop out clock', exact: true }).click();
  const popup = await opened;
  await expect(popup.getByLabel('Time worked')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const closed = popup.waitForEvent('close');
  const request = page.waitForRequest(request => request.url().endsWith('/api/auth/logout'));
  await page.getByRole('button', { name: 'Pause clock and sign out', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ pause: true });
  await closed;
  expect(popup.isClosed()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('development refresh reconnects the existing native timer window', async ({ browser }) => {
  const { createServer } = await import('vite');
  const dev = await createServer({
    configFile: path.resolve('client/vite.config.js'),
    server: { port: 0, proxy: { '/api': ctx.base.replace(/\/api$/, '') } },
  });
  const context = await browser.newContext({ viewport: null });
  try {
    await dev.listen();
    const page = await context.newPage();
    await prepareClock(page, false, dev.resolvedUrls.local[0]);
    await page.getByRole('button', { name: 'Work clock', exact: true }).click();
    await page.getByRole('button', { name: 'Pop out clock', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(window.documentPictureInPicture.window?.document.querySelector('.pip-time')))).toBe(true);
    await page.evaluate(() => { window.__originalClockWindow = window.documentPictureInPicture.window; });
    const modules = dev.moduleGraph.getModulesByFile(path.resolve('client/src/components/WorkClock.jsx').replaceAll('\\', '/'));
    expect(modules?.size).toBeGreaterThan(0);
    const refreshed = page.waitForEvent('console', { predicate: (message) => message.text().includes('hot updated: /src/components/Layout.jsx') });
    for (const module of modules) await dev.reloadModule(module);
    await refreshed;
    await expect.poll(() => page.evaluate(() => {
      const win = window.documentPictureInPicture.window;
      return Boolean(win && !win.closed && win === window.__originalClockWindow && win.document.querySelector('.pip-time')?.textContent);
    })).toBe(true);
    await page.evaluate(() => window.documentPictureInPicture.window.document.querySelector('.pip-size-toggle').click());
    await expect.poll(() => page.evaluate(() => window.documentPictureInPicture.window.document.querySelector('.pip-clock').classList.contains('minimized'))).toBe(true);
  } finally {
    await context.close();
    await dev.close();
  }
});

test('native Chrome PiP keeps the complete timer inside the minimized viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  try {
  await prepareClock(page, false);
  await page.getByRole('button', { name: 'Work clock', exact: true }).click();
  await page.getByRole('button', { name: 'Pop out clock', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.documentPictureInPicture?.window?.document.querySelector('.pip-clock')))).toBe(true);
  const inspect = () => page.evaluate(() => {
    const win = window.documentPictureInPicture.window;
    const time = win.document.querySelector('.pip-time');
    const range = win.document.createRange();
    range.selectNodeContents(time);
    const text = range.getBoundingClientRect();
    return { compact: win.document.querySelector('.pip-clock').classList.contains('minimized'), width: win.innerWidth, height: win.innerHeight, fits: text.top >= 0 && text.left >= 0 && text.right <= win.innerWidth && text.bottom <= win.innerHeight, breaks: Boolean(win.document.querySelector('.pip-clock .col')), text: time.textContent };
  });
  const expanded = await inspect();
  await page.evaluate(() => window.documentPictureInPicture.window.document.querySelector('.pip-size-toggle').click());
  await expect.poll(async () => (await inspect()).compact).toBe(true);
  await expect.poll(async () => (await inspect()).height).toBeLessThan(expanded.height);
  const compact = await inspect();
  expect(compact.fits).toBe(true);
  expect(compact.breaks).toBe(false);
  expect(compact.text).toMatch(/^\d+:\d{2}:\d{2}$/);
  await page.evaluate(() => window.documentPictureInPicture.window.document.querySelector('.pip-size-toggle').click());
  await expect.poll(async () => (await inspect()).compact).toBe(false);
  await expect.poll(async () => (await inspect()).height).toBeGreaterThan(compact.height);
  expect((await inspect()).fits).toBe(true);
  await page.evaluate(() => window.documentPictureInPicture.window.close());
  } finally {
    await context.close();
  }
});
