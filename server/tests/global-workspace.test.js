import test from 'node:test';
import assert from 'node:assert/strict';
import { globalAppsUrl, isGlobalAppSession } from '../services/global-workspace.js';

test('Global workspace accepts only configured same-host destinations and matching session cookies', () => {
  const previous = process.env.GLOBAL_PORTAL_URL;
  const token = 'a'.repeat(64);
  const req = {
    hostname: '127.0.0.1',
    headers: { cookie: `hrms_session=${token}; brainadz_global_session=${token}` },
  };
  try {
    process.env.GLOBAL_PORTAL_URL = 'http://127.0.0.1:8130';
    assert.equal(globalAppsUrl(req), 'http://127.0.0.1:8130/apps');
    assert.equal(isGlobalAppSession(req), true);
    for (const cookies of [
      `hrms_session=${token}`,
      `hrms_session=${token}; brainadz_global_session=${'b'.repeat(64)}`,
      `hrms_session=${token}; brainadz_global_session=${token}; brainadz_global_session=${token}`,
    ]) {
      assert.equal(isGlobalAppSession({ ...req, headers: { cookie: cookies } }), false);
    }
    for (const url of [
      '',
      'javascript:alert(1)',
      'http://elsewhere.example',
      'http://user@127.0.0.1',
      'http://127.0.0.1/?returnTo=elsewhere',
      'http://127.0.0.1/other',
    ]) {
      process.env.GLOBAL_PORTAL_URL = url;
      assert.equal(globalAppsUrl(req), null);
      assert.equal(isGlobalAppSession(req), false);
    }
  } finally {
    if (previous === undefined) delete process.env.GLOBAL_PORTAL_URL;
    else process.env.GLOBAL_PORTAL_URL = previous;
  }
});
