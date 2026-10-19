import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openDb, postgresConfig } from '../db.js';
import { workflow } from '../database/workflows.js';
import { pgTool, pgEnvironment } from './pg-tools.js';

const data = path.resolve(process.env.DATA_DIR || 'data');
const destination = path.join(data, 'backups', `postgres-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const config = postgresConfig();
const env = pgEnvironment(config);
let db;
try {
  const binary = await pgTool('pg_dump');
  await fs.mkdir(destination, { recursive: true });
  db = await openDb({ migrate: false });
  await workflow(db, async () => {
    // Coordinating API writers remain paused while the database and files are copied.
    await db.run('SET LOCAL statement_timeout = 0');
    await new Promise((resolve, reject) => {
      const child = spawn(binary, ['--format=custom', '--schema=public', '--no-owner', '--no-privileges', '--file', path.join(destination, 'database.dump')], { env, timeout: 300000, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      child.stderr.on('data', (chunk) => { error += chunk; });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`pg_dump failed (${code}): ${error}`)));
    });
    await fs.cp(path.join(data, 'uploads'), path.join(destination, 'uploads'), { recursive: true, errorOnExist: true });
    const counts = {};
    for (const table of ['employees', 'users', 'attendance', 'candidates', 'payslips', 'documents']) counts[table] = await db.value(`SELECT COUNT(*) FROM public.${table}`);
    await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ completed: true, createdAt: new Date().toISOString(), database: env.PGDATABASE, schema: 'public', counts, migrations: await db.all('SELECT version FROM schema_migrations ORDER BY version'), format: 'pg_dump custom + uploads' }, null, 2));
  });
  console.log(`Backup completed: ${destination}`);
} catch (error) {
  console.error(`Backup incomplete (do not restore it): ${error.message}`);
  process.exitCode = 1;
} finally { await db?.close(); }
