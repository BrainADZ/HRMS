import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openDb, postgresConfig } from '../server/db.js';
import { importSqlite } from '../server/database/import-sqlite.js';

if (!process.argv.includes('--confirm-import')) throw new Error('Run npm run db:import-sqlite -- --confirm-import to replace the initial empty company with SQLite data.');
const sourceFile = path.resolve(process.env.SQLITE_IMPORT_FILE || path.join(process.env.DATA_DIR || 'data', 'hrms.db'));
const backupDir = path.resolve(process.env.DATA_DIR || 'data', 'backups', `sqlite-import-${new Date().toISOString().replace(/[:.]/g, '-')}`);
let source;
let snapshot;
let db;
try {
  source = new DatabaseSync(sourceFile, { readOnly: true });
  await fs.mkdir(backupDir, { recursive: true });
  const snapshotFile = path.join(backupDir, 'source-sqlite.db');
  await backup(source, snapshotFile);
  source.close(); source = null;
  snapshot = new DatabaseSync(snapshotFile, { readOnly: true });
  const config = postgresConfig();
  const url = new URL(config.connectionString);
  const dump = process.env.PG_DUMP_PATH || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe' : 'pg_dump');
  await promisify(execFile)(dump, ['--format=custom', '--no-password', '--file', path.join(backupDir, 'postgres-before.dump')], {
    windowsHide: true,
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) },
  });
  db = await openDb();
  const report = await importSqlite(snapshot, db);
  const logins = await db.all('SELECT e.code, e.first_name, u.username, u.email, u.role FROM users u LEFT JOIN employees e ON e.id = u.employee_id ORDER BY u.id');
  const esc = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = ['Employee ID,First name,Username,Email,Role', ...logins.map((row) => [row.code, row.first_name, row.username, row.email, row.role].map(esc).join(','))].join('\r\n');
  await fs.writeFile(path.join(backupDir, 'login-usernames.csv'), csv);
  await fs.writeFile(path.join(backupDir, 'import-report.json'), JSON.stringify(report, null, 2));
  console.log(`Import complete: ${report.employees} employees, ${report.usersAfterPreservingAdmin} logins. Old sessions excluded; configured administrator preserved.`);
  console.log(`Backups, import report and username list: ${backupDir}`);
} catch (error) {
  console.error(`Import failed: ${error.message}`);
  console.error(`Backup directory: ${backupDir}`);
  process.exitCode = 1;
} finally { source?.close(); snapshot?.close(); await db?.close(); }
