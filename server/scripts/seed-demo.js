// Populate only a clean local PostgreSQL company. Never overwrite existing staff.
import { openDb } from '../db.js';
import { getSettings } from '../core.js';
import { seed50Demo } from '../seed-50-demo.js';
import fs from 'node:fs';
import path from 'node:path';

let db;
const writtenFiles = [];
try {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seeding is disabled in production');
  }
  db = await openDb();
  const settings = await getSettings(db);
  if (settings.demo || Number(await db.value('SELECT COUNT(*) FROM employees')) !== 0) {
    throw new Error('Only a clean, non-demo company can be populated');
  }
  const dataDir = path.resolve(process.env.DATA_DIR || 'data');
  const saveFile = (kind, name, bytes) => {
    const directory = path.join(dataDir, 'uploads', kind);
    fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, path.basename(name));
    if (fs.existsSync(target)) throw new Error(`Existing file would be overwritten: ${name}`);
    fs.writeFileSync(target, bytes);
    writtenFiles.push(target);
  };
  await seed50Demo(db, { saveFile });
  const count = await db.value('SELECT COUNT(*) FROM employees');
  console.log(`Seeded ${count} fictional employees with 4 completed payroll months.`);
  console.log('Demo profiles are listed on the local login page.');
} catch (error) {
  for (const file of writtenFiles) fs.rmSync(file, { force: true });
  console.error(`Demo seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db?.close();
}
