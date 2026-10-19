import pg from 'pg';
import { openDb, postgresConfig } from '../db.js';

let admin;
let db;
try {
  const config = postgresConfig();
  const target = new URL(config.connectionString);
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(name)) throw new Error('Choose a valid PostgreSQL database name in DATABASE_URL');
  const adminUrl = new URL(process.env.DATABASE_ADMIN_URL || config.connectionString);
  if (!process.env.DATABASE_ADMIN_URL) adminUrl.pathname = '/postgres';
  admin = new pg.Client({ ...config, connectionString: adminUrl.toString() });
  await admin.connect();
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount) {
    await admin.query(`CREATE DATABASE "${name}"`);
    console.log(`Created PostgreSQL database: ${name}`);
  } else console.log(`PostgreSQL database already exists: ${name}`);
  await admin.end();
  admin = null;
  db = await openDb();
  console.log('PostgreSQL schema is ready. Run npm start to initialize the company.');
} catch (error) {
  console.error(`Database setup failed: ${error.message}`);
  process.exitCode = 1;
} finally { await db?.close(); await admin?.end(); }
