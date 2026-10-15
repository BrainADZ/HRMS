import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { listenAvailable } from './listen.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(here, '..', 'data');
const { app } = createApp({
  dbFile: process.env.DB_FILE || path.join(dataDir, 'hrms.db'),
  dataDir,
  seed: process.env.SEED === 'empty' ? 'empty' : 'demo',
});

// Addresses other computers on the same network (office Wi-Fi) can open.
function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

const preferredPort = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
const host = process.env.HOST || '0.0.0.0';
try {
  const server = await listenAvailable(app, { port: preferredPort, host });
  const port = server.address().port;
  process.send?.({ type: 'hrms:ready', port });
  console.log('\n  BrainADZ HRMS is running.\n');
  console.log(`  On this computer:   http://127.0.0.1:${port}`);
  for (const ip of lanAddresses()) console.log(`  On the office Wi-Fi: http://${ip}:${port}`);
  console.log('\n  Keep this window open. Press Ctrl+C to stop.\n');
} catch (error) {
  console.error(`\n  API could not start: ${error.message}\n`);
  process.exitCode = 1;
}
