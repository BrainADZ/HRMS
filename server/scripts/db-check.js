import { openDb } from '../db.js';

let db;
try {
  db = await openDb({ migrate: false });
  const result = await db.get('SELECT current_database() AS database, version() AS version');
  console.log(`Connected to PostgreSQL database: ${result.database}`);
  console.log(result.version);
  const migrations = await db.all(
    'SELECT version, applied_at FROM schema_migrations ORDER BY version',
  );
  console.log(`Applied migrations: ${migrations.map((row) => row.version).join(', ') || 'none'}`);
} catch (error) {
  console.error(`Database check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db?.close();
}
