// This command deliberately resets DEMO data only, never an unmarked company.
import { openDb } from './db.js';
import { getSettings } from './core.js';
import { seed50Demo } from './seed-50-demo.js';
import fs from 'node:fs';
import path from 'node:path';

if (!process.argv.includes('--confirm-reset')) {
  console.error(
    'To reset a demo PostgreSQL database, run: node --env-file=.env server/reset.js --confirm-reset',
  );
  process.exitCode = 1;
} else {
  let db;
  try {
    db = await openDb();
    if (!(await getSettings(db)).demo)
      throw new Error('Reset refused: this database is not marked as demo data');
    const tables = await db.all(
      "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename != 'schema_migrations'",
    );
    const dataDir = path.resolve(process.env.DATA_DIR || 'data');
    const saveFile = (kind, name, bytes) => {
      const dir = path.join(dataDir, 'uploads', kind);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, path.basename(name)), bytes);
    };
    await db.tx(async () => {
      await db.exec(
        `TRUNCATE ${tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(', ')} RESTART IDENTITY`,
      );
      await seed50Demo(db, { saveFile });
    });
    console.log('PostgreSQL demo data reset. Existing uploaded files were retained.');
  } catch (error) {
    console.error(`Demo reset failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db?.close();
  }
}
