// Replace the configured local PostgreSQL company with fresh fictional demo data.
import { openDb } from '../db.js';
import { seed50Demo } from '../seed-50-demo.js';
import fs from 'node:fs';
import path from 'node:path';

let db;
const previousFiles = new Map();
try {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seeding is disabled in production');
  }
  db = await openDb();
  const tables = await db.all(
    "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename != 'schema_migrations'",
  );
  const dataDir = path.resolve(process.env.DATA_DIR || 'data');
  const saveFile = (kind, name, bytes) => {
    const directory = path.join(dataDir, 'uploads', kind);
    fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, path.basename(name));
    if (!previousFiles.has(target))
      previousFiles.set(target, fs.existsSync(target) ? fs.readFileSync(target) : null);
    fs.writeFileSync(target, bytes);
  };
  await db.tx(async () => {
    if (tables.length) {
      const names = tables
        .map(({ tablename }) => '"' + tablename.replaceAll('"', '""') + '"')
        .join(', ');
      await db.exec('TRUNCATE ' + names + ' RESTART IDENTITY');
    }
    await seed50Demo(db, { saveFile });
  });
  console.log('Old data cleared and 50 fresh fictional employees added with 4 completed payroll months.');
  console.log('Demo profiles are listed on the local login page.');
} catch (error) {
  for (const [file, previous] of previousFiles) {
    if (previous === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, previous);
  }
  console.error(`Demo seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db?.close();
}
