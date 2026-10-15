// Runs the API (with auto-restart) and the Vite dev server together.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
// Vite starts only after the API reports the port it actually bound.
const options = { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: process.env.PORT || '3000' } };

let api;
let vite;
let timer;
let stopping = false;
let restarting = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  process.exitCode = code;
  api?.kill();
  vite?.kill();
}

function launch(args, name, extra = {}) {
  const child = spawn(process.execPath, args, { ...options, ...extra });
  child.on('error', (error) => {
    console.error(`${name} could not start: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    // A replaced API process is expected to exit during a code reload.
    if (!stopping && (child === api || child === vite)) {
      console.error(`${name} stopped (exit ${code}).`);
      stop(code || 1);
    }
  });
  return child;
}

const startApi = () => {
  const child = launch(['--disable-warning=ExperimentalWarning', 'server/index.js'], 'API', { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
  child.on('message', async (message) => {
    if (message.type !== 'hrms:ready' || stopping || child !== api) return;
    const changed = options.env.PORT !== String(message.port);
    options.env.PORT = String(message.port);
    if (vite && changed) {
      const old = vite;
      vite = undefined;
      await new Promise((resolve) => { old.once('exit', resolve); old.kill(); });
    }
    if (!vite && !stopping) vite = launch(['node_modules/vite/bin/vite.js', '--config', 'client/vite.config.js'], 'Vite');
  });
  return child;
};

// Check source content rather than filesystem notifications: on Windows the
// native Node watcher can repeatedly restart even when no source has changed.
function sourceHash() {
  const hash = createHash('sha256');
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.(?:[cm]?js|json)$/.test(entry.name)) {
        hash.update(file).update('\0').update(fs.readFileSync(file)).update('\0');
      }
    }
  }
  visit(path.join(root, 'server'));
  return hash.digest('hex');
}

let previous = sourceHash();
api = startApi();
timer = setInterval(async () => {
  if (stopping || restarting) return;
  let current;
  try { current = sourceHash(); } catch { return; } // An editor may be replacing a file.
  if (current === previous) return;
  previous = current;
  restarting = true;
  console.log('\n  Server source changed. Restarting API...');
  const old = api;
  api = undefined;
  await new Promise((resolve) => {
    old.once('exit', resolve);
    old.kill();
  });
  if (!stopping) api = startApi();
  restarting = false;
}, 1000);

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
