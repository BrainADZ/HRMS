import test from 'node:test';
import assert from 'node:assert/strict';
import { globalLoginRequest } from '../services/global-login.js';

const secret = 'test_gateway_012345678901234567890123456789';
function request(identifier, headers = {}) {
  return {
    body: { identifier },
    get: (name) =>
      ({ 'X-BrainADZ-Gateway-Key': secret, 'X-BrainADZ-Client-IP': '203.0.113.8', ...headers })[
        name
      ],
  };
}
function configured(t) {
  const old = process.env.GLOBAL_GATEWAY_SECRET;
  process.env.GLOBAL_GATEWAY_SECRET = secret;
  t.after(() => {
    if (old === undefined) delete process.env.GLOBAL_GATEWAY_SECRET;
    else process.env.GLOBAL_GATEWAY_SECRET = old;
  });
}

test('Global gateway must authenticate before identity lookup or client-IP forwarding', async (t) => {
  configured(t);
  const db = {
    all: async () => {
      throw new Error('Must not query without gateway authentication');
    },
  };
  await assert.rejects(
    globalLoginRequest(db, request('employee', { 'X-BrainADZ-Gateway-Key': 'wrong' })),
    /gateway authentication required/,
  );
  await assert.rejects(
    globalLoginRequest(db, request('employee', { 'X-BrainADZ-Client-IP': 'not-an-ip' })),
    /Valid client IP required/,
  );
});

test('ambiguous email/username matches cannot choose or merge an account', async (t) => {
  configured(t);
  const result = await globalLoginRequest(
    { all: async () => [{ id: 1 }, { id: 2 }] },
    request('person@example.com'),
  );
  assert.equal(result.user, null);
});

test('Global identity resolution preserves the single existing account', async (t) => {
  configured(t);
  const user = { id: 123, active: 1 };
  const result = await globalLoginRequest({ all: async () => [user] }, request(' PERSON '));
  assert.equal(result.user, user);
  assert.equal(result.identifier, 'person');
  assert.equal(result.ip, '203.0.113.8');
});

test('Global connector is disabled without a configured server secret', async (t) => {
  configured(t);
  process.env.GLOBAL_GATEWAY_SECRET = '';
  await assert.rejects(globalLoginRequest({}, request('person')), /not configured/);
});
