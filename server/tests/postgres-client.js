import pg from 'pg';
import crypto from 'node:crypto';
import { postgresConfig } from '../db.js';

// An actual PostgreSQL connection in its own throwaway schema, or embedded
// PostgreSQL by default. Neither mode touches the imported company's tables.
export async function createTestClient() {
  if (process.env.HRMS_TEST_POSTGRES !== '1') {
    const { PGlite } = await import('@electric-sql/pglite');
    return new PGlite();
  }
  const config = postgresConfig();
  const owner = new pg.Client(config);
  await owner.connect();
  const schema = `hrms_test_${crypto.randomBytes(8).toString('hex')}`;
  await owner.query(`CREATE SCHEMA ${schema}`);
  const connection = new pg.Client({ ...config, options: `-c search_path=${schema}` });
  try {
    await connection.connect();
  } catch (error) {
    await owner.query(`DROP SCHEMA ${schema} CASCADE`);
    await owner.end();
    throw error;
  }
  return {
    query: (...args) => connection.query(...args),
    exec: (sql) => connection.query(sql),
    async close() {
      try {
        await connection.end();
        await owner.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        await owner.end();
      }
    },
  };
}
