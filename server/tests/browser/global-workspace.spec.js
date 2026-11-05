import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';
let ctx, origin, previous;
const launcher = 'http://127.0.0.1:8130/apps';
test.beforeAll(async () => {
  previous = process.env.GLOBAL_PORTAL_URL;
  process.env.GLOBAL_PORTAL_URL = 'http://127.0.0.1:8130';
  ctx = await boot({ serveClient: true });
  origin = ctx.base.replace(/\/api$/, '');
});
test.afterAll(async () => {
  await ctx?.close();
  if (previous === undefined) delete process.env.GLOBAL_PORTAL_URL;
  else process.env.GLOBAL_PORTAL_URL = previous;
});
async function enter(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const response = await page.request.post(ctx.base + '/auth/login', {
    headers: { 'X-Requested-With': 'hrms' },
    data: { ...credentials(ctx.base, 'rajiv.malhotra@brainadz.com'), password: 'Brainadz@2026' },
  });
  expect(response.ok()).toBeTruthy();
  const native = (await page.context().cookies(origin)).find((c) => c.name === 'hrms_session');
  await page.context().addCookies([
    {
      name: 'brainadz_global_session',
      value: native.value,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/auth/celebrations', (route) =>
    route.fulfill({ json: { today: '2026-11-05', birthdays: [], holidays: [] } }),
  );
  await page.route(launcher, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Choose your app</h1>' }),
  );
  await page.goto(origin + '/calendar');
  return native.value;
}
test('sidebar Switch App opens launcher without logging out of HRMS', async ({ page }) => {
  await enter(page);
  await page.locator('.sidebar').getByRole('link', { name: 'Switch App', exact: true }).click();
  await expect(page).toHaveURL(launcher);
  await expect(page.getByRole('heading', { name: 'Choose your app' })).toBeVisible();
  expect((await page.request.get(ctx.base + '/auth/me')).ok()).toBeTruthy();
});
test('HRMS Sign out clears app cookie and returns to tiles with Global login retained', async ({
  page,
}) => {
  const token = await enter(page);
  const exitFrames = [];
  await page.exposeFunction('recordExitFrame', (text) => exitFrames.push(text));
  await page.evaluate(() => {
    new MutationObserver(() => window.recordExitFrame(document.body.innerText)).observe(
      document.body,
      { childList: true, subtree: true, characterData: true },
    );
  });
  let releaseNavigation;
  const navigationHeld = new Promise((resolve) => {
    releaseNavigation = resolve;
  });
  await page.route(launcher, async (route) => {
    await navigationHeld;
    await route.fulfill({ contentType: 'text/html', body: '<h1>Choose your app</h1>' });
  });
  await page.getByRole('button', { name: 'Account menu' }).click();
  const exit = page.waitForResponse(
    (r) => r.url().endsWith('/auth/exit') && r.request().method() === 'POST',
  );
  const click = page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await exit).ok()).toBeTruthy();
  try {
    await expect
      .poll(() => exitFrames.some((text) => text.includes('Opening your workspace...')))
      .toBe(true);
    expect(exitFrames.some((text) => text.includes('Work email or username'))).toBe(false);
  } finally {
    releaseNavigation();
  }
  await click;
  await expect(page).toHaveURL(launcher);
  const cookies = await page.context().cookies(origin);
  expect(cookies.find((c) => c.name === 'hrms_session')).toBeUndefined();
  expect(cookies.find((c) => c.name === 'brainadz_global_session')?.value).toBe(token);
});
