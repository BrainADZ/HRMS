import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { postgresConfig } from '../db.js';
import { pgTool, pgEnvironment } from './pg-tools.js';

const run = promisify(execFile),
  config = postgresConfig();
const owner = new pg.Pool(config);
const name = `hrms_restore_${crypto.randomBytes(8).toString('hex')}`;
let restored,
  created = false;
try {
  const backups = path.resolve(process.env.DATA_DIR || 'data', 'backups');
  const latest = (await fs.readdir(backups))
    .filter((entry) => entry.startsWith('postgres-'))
    .sort()
    .at(-1);
  const folder = process.argv[2]
    ? path.resolve(process.argv[2])
    : latest && path.join(backups, latest);
  if (!folder) throw Error('No backup found. Run npm run db:backup first.');
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
  if (!manifest.completed || manifest.schema !== 'public' || !manifest.counts)
    throw Error('Backup manifest is incomplete or unsupported');
  await owner.query(`CREATE DATABASE ${name}`);
  created = true;
  await run(
    await pgTool('pg_restore'),
    [
      '--clean',
      '--if-exists',
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      name,
      path.join(folder, 'database.dump'),
    ],
    { env: pgEnvironment(config, name), windowsHide: true, timeout: 300000 },
  );
  const url = new URL(config.connectionString);
  url.pathname = '/' + name;
  restored = new pg.Pool({ ...config, connectionString: url.toString() });
  const counts = {};
  for (const table of ['employees', 'users', 'attendance', 'candidates', 'payslips', 'documents']) {
    counts[table] = (
      await restored.query(`SELECT COUNT(*)::int AS n FROM public.${table}`)
    ).rows[0].n;
    if (counts[table] !== manifest.counts[table])
      throw Error('Restored record count differs: ' + table);
  }
  const documents = (await restored.query('SELECT file FROM public.documents')).rows;
  for (const document of documents)
    await fs.access(path.join(folder, 'uploads', 'documents', path.basename(document.file)));
  const report = {
    passed: true,
    verifiedAt: new Date().toISOString(),
    counts,
    documentsVerified: documents.length,
  };
  await fs.writeFile(
    path.join(folder, 'restore-verification.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(`Restore verified: ${JSON.stringify(report)}`);
} catch (error) {
  console.error(`Backup verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await restored?.end();
  try {
    if (created) await owner.query(`DROP DATABASE ${name}`);
  } finally {
    await owner.end();
  }
}
