import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, client } from './helpers.js';

test('local quick login selects registered roles, checks tokens and is disabled in production', async () => {
  const previous = process.env.LOCAL_QUICK_LOGIN;
  const previousMode = process.env.NODE_ENV;
  process.env.LOCAL_QUICK_LOGIN = 'true';
  process.env.NODE_ENV = 'development';
  let ctx;
  try {
    ctx = await boot();
    const anon = client(ctx.base);
    const config = (await anon.get('/auth/config')).body;
    assert.deepEqual(config.quickAccounts.map((a) => a.label), ['Admin', 'Manager', 'Employee']);
    for (const account of config.quickAccounts) {
      const credentials = { loginType: account.loginType, ...(account.loginType === 'admin' ? { email: account.email } : { username: account.username }), quickLoginToken: account.quickLoginToken };
      assert.equal((await anon.post('/auth/login', { ...credentials, quickLoginToken: 'invalid' })).status, 401);
      const session = client(ctx.base);
      assert.equal((await session.post('/auth/login', credentials)).status, 200);
      assert.equal((await session.get('/auth/me')).body.user.role, account.label.toLowerCase());
    }
    process.env.NODE_ENV = 'production';
    assert.deepEqual((await anon.get('/auth/config')).body.quickAccounts, []);
    const account = config.quickAccounts[0];
    assert.equal((await anon.post('/auth/login', { loginType: 'admin', email: account.email, quickLoginToken: account.quickLoginToken })).status, 401);
    process.env.NODE_ENV = 'development';
    process.env.LOCAL_QUICK_LOGIN = 'false';
    assert.deepEqual((await anon.get('/auth/config')).body.quickAccounts, []);
  } finally {
    await ctx?.close();
    if (previous === undefined) delete process.env.LOCAL_QUICK_LOGIN; else process.env.LOCAL_QUICK_LOGIN = previous;
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
  }
});
