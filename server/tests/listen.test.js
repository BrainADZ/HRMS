import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { listenAvailable } from '../listen.js';

const app = { listen: (...args) => http.createServer((_req, res) => res.end('hrms')).listen(...args) };
const close = (server) => new Promise((resolve) => server.close(resolve));

test('occupied API port falls back without touching the existing server', async () => {
  const existing = await listenAvailable(app, { port: 0, host: '127.0.0.1' });
  let hrms;
  try {
    hrms = await listenAvailable(app, { port: existing.address().port, host: '127.0.0.1' });
    assert.notEqual(hrms.address().port, existing.address().port);
    assert.equal(existing.listening, true);
    assert.equal(await fetch(`http://127.0.0.1:${hrms.address().port}`).then(r => r.text()), 'hrms');
  } finally {
    if (hrms) await close(hrms);
    await close(existing);
  }
});

test('available preferred port is retained', async () => {
  const probe = await listenAvailable(app, { port: 0, host: '127.0.0.1' });
  const port = probe.address().port;
  await close(probe);
  const server = await listenAvailable(app, { port, host: '127.0.0.1' });
  try { assert.equal(server.address().port, port); }
  finally { await close(server); }
});
