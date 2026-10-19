// Start a disposable local demo with the real API, React client, and sample data.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

import { createApp } from './app.js';
import { openDb } from './db.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrms-demo-'));
process.env.NODE_ENV = 'development';
process.env.HRMS_AI = 'off';
process.env.EXPOSE_DEMO_LOGINS = 'true';
let runtime;
let server;
let vite;
let stopping = false;

process.on('exit', () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  vite?.kill();
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
  await runtime?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(code);
}

process.on('SIGINT', () => { stop().catch(console.error); });
process.on('SIGTERM', () => { stop().catch(console.error); });
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim().toLowerCase() === 'q') stop().catch(console.error);
});

try {
  const db = await openDb({ queryClient: new PGlite() });
  try {
    runtime = await createApp({ database: db, dataDir, seed: 'demo', serveClient: false });
  } catch (error) {
    await db.close();
    throw error;
  }

  server = await new Promise((resolve, reject) => {
    const listener = runtime.app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });

  const apiPort = server.address().port;
  const clientEnv = { ...process.env };
  for (const key of [
    'DATABASE_URL',
    'DATABASE_ADMIN_URL',
    'PGPASSWORD',
    'PGSSLROOTCERT',
    'ADMIN_PASSWORD',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
  ]) delete clientEnv[key];

  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'client/vite.config.js'], {
    cwd: root,
    env: {
      ...clientEnv,
      HRMS_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      VITE_API_BASE_URL: '/api',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });

  vite.on('error', (error) => {
    console.error(`Demo client could not start: ${error.message}`);
    stop(1).catch(console.error);
  });
  vite.on('exit', (code) => {
    if (!stopping) stop(code || 1).catch(console.error);
  });

  console.log('\n  Demo data is temporary. Open the Vite URL printed below. Press q + Enter to stop.\n');
} catch (error) {
  console.error(`Demo could not start: ${error.message}`);
  await stop(1);
}
