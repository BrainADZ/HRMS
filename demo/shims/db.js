// Browser-only demo: PostgreSQL compiled to WASM, with no external database.
import { PGlite } from '@electric-sql/pglite';
import schema from '../../server/database/schema.sql?raw';
import usernames from '../../server/database/002-usernames.sql?raw';
import profilePhotos from '../../server/database/003-profile-photos.sql?raw';
import { identifier, prepareQuery } from '../../server/database/query.js';
import postgresWasm from '../../node_modules/@electric-sql/pglite/dist/pglite.wasm?url';
import initWasm from '../../node_modules/@electric-sql/pglite/dist/initdb.wasm?url';
import dataBundle from '../../node_modules/@electric-sql/pglite/dist/pglite.data?url';

export async function openDb() {
  const [postgresBytes, initBytes, bundle] = await Promise.all([
    fetch(postgresWasm).then((r) => r.arrayBuffer()),
    fetch(initWasm).then((r) => r.arrayBuffer()),
    fetch(dataBundle).then((r) => r.blob()),
  ]);
  const engine = await PGlite.create({
    pgliteWasmModule: await WebAssembly.compile(postgresBytes),
    initdbWasmModule: await WebAssembly.compile(initBytes), fsBundle: bundle,
  });
  await engine.exec(schema);
  await engine.exec(usernames);
  await engine.exec(profilePhotos);
  let depth = 0;
  const query = (sql, ...params) => {
    const { text, values } = prepareQuery(sql, params);
    return engine.query(text, values);
  };
  const db = {
    async all(sql, ...params) { return (await query(sql, ...params)).rows; },
    async get(sql, ...params) { return (await db.all(sql, ...params))[0]; },
    async value(sql, ...params) { const row = await db.get(sql, ...params); return row ? Object.values(row)[0] : undefined; },
    async run(sql, ...params) { return { changes: (await query(sql, ...params)).affectedRows || 0 }; },
    exec: (sql) => engine.exec(sql),
    async insert(table, row) {
      const keys = Object.keys(row);
      const hasId = !['settings', 'sessions', 'attendance', 'policy_acks', 'posh_training'].includes(table);
      const result = await query(`INSERT INTO ${identifier(table)} (${keys.map(identifier)}) VALUES (${keys.map(() => '?')})${hasId ? ' RETURNING id' : ''}`, ...keys.map((key) => row[key]));
      return hasId ? result.rows[0].id : null;
    },
    async update(table, id, row) {
      const keys = Object.keys(row);
      if (keys.length) await query(`UPDATE ${identifier(table)} SET ${keys.map((key) => `${identifier(key)} = ?`)} WHERE id = ?`, ...keys.map((key) => row[key]), id);
    },
    async tx(fn) {
      if (depth) return fn();
      depth++;
      try {
        await engine.exec('BEGIN');
        const result = await fn();
        await engine.exec('COMMIT');
        return result;
      } catch (error) { await engine.exec('ROLLBACK'); throw error; }
      finally { depth--; }
    },
    close: () => engine.close(),
  };
  return db;
}
export function json(value, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
