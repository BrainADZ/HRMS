import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

let ctx;
const origin = 'http://127.0.0.1:5173';
before(async () => {
  ctx = await boot({ clientOrigin: origin });
});
after(async () => {
  await ctx?.close();
});

test('separate frontend origin can preflight credentialed API requests; other origins cannot', async () => {
  for (const [requestOrigin, expected] of [
    [origin, 204],
    ['https://untrusted.example', 403],
  ]) {
    const response = await fetch(ctx.base + '/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: requestOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-requested-with',
      },
    });
    assert.equal(response.status, expected);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      expected === 204 ? origin : null,
    );
    assert.equal(
      response.headers.get('access-control-allow-credentials'),
      expected === 204 ? 'true' : null,
    );
    assert.match(response.headers.get('vary'), /Origin/);
  }
});

test('separate frontend login retains the normal cookie session and CSRF protection', async () => {
  const login = await fetch(ctx.base + '/auth/login', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Requested-With': 'hrms',
    },
    body: JSON.stringify({
      loginType: 'admin',
      email: 'rajiv.malhotra@brainadz.com',
      password: 'Brainadz@2026',
    }),
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('access-control-allow-origin'), origin);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const me = await fetch(ctx.base + '/auth/me', { headers: { Origin: origin, Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.role, 'admin');
  const blocked = await fetch(ctx.base + '/auth/logout', {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie },
  });
  assert.equal(blocked.status, 403);
});

test('API-only app does not serve the frontend HTML', async () => {
  const response = await fetch(ctx.base.replace(/\/api$/, '') + '/');
  assert.equal(response.status, 404);
});
