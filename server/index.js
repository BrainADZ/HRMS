import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

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

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, (error) => {
  // Express calls this callback on listen errors as well as successful startup.
  if (error) {
    console.error(error.code === 'EADDRINUSE'
      ? `\n  API port ${port} is already in use. Stop the existing server with Ctrl+C, then try again.\n`
      : `\n  API could not start: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  console.log('\n  BrainADZ HRMS is running.\n');
  console.log(`  On this computer:   http://localhost:${port}`);
  for (const ip of lanAddresses()) console.log(`  On the office Wi-Fi: http://${ip}:${port}`);
  console.log('\n  Keep this window open. Press Ctrl+C to stop.\n');
});
