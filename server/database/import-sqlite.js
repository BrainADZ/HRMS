import { identifier } from './query.js';

// The source is a consistent, read-only SQLite backup. Production continues
// to use PostgreSQL; SQLite is needed only for this explicit migration.
export async function importSqlite(source, db) {
  const sourceTables = source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
  if (source.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Source SQLite database has foreign-key violations');
  if (!sourceTables.includes('employees') || !sourceTables.includes('users')) throw new Error('Source is not an HRMS database');
  const columns = await db.all("SELECT table_name, column_name, is_identity FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY ordinal_position");
  const targetTables = [...new Set(columns.map((c) => c.table_name))].filter((t) => t !== 'schema_migrations');
  for (const table of sourceTables) if (!targetTables.includes(table)) throw new Error(`Unsupported SQLite table: ${table}`);
  const parents = ['verticals', 'departments', 'locations', 'employees', 'users'];
  const ordered = [...parents.filter((t) => sourceTables.includes(t)), ...sourceTables.filter((t) => !parents.includes(t))];
  return db.tx(async () => {
    await db.exec(`LOCK TABLE ${targetTables.map(identifier).join(',')} IN ACCESS EXCLUSIVE MODE`);
    if ((await db.value('SELECT COUNT(*) FROM employees')) !== 0 || (await db.value('SELECT COUNT(*) FROM users')) > 1) throw new Error('Import refused: target must be the initial empty company. Existing populated companies cannot be overwritten.');
    const admin = await db.get("SELECT * FROM users WHERE role = 'admin' AND active = 1");
    if (!admin) throw new Error('Import needs the configured active administrator in the target');
    await db.exec('SET CONSTRAINTS ALL DEFERRED');
    // DELETE is transactional and leaves schema/migrations/triggers intact.
    for (const table of targetTables) await db.run(`DELETE FROM ${identifier(table)}`);
    const counts = {};
    for (const table of ordered) {
      if (table === 'sessions') { counts.sessions = { source: source.prepare('SELECT COUNT(*) n FROM sessions').get().n, imported: 0 }; continue; }
      const allowed = columns.filter((c) => c.table_name === table).map((c) => c.column_name);
      const rows = source.prepare(`SELECT * FROM ${identifier(table)}`).all();
      const sourceColumns = source.prepare(`PRAGMA table_info(${identifier(table)})`).all().map((c) => c.name);
      for (const column of sourceColumns) if (!allowed.includes(column)) throw new Error(`Unmapped source column: ${table}.${column}`);
      // Username comes from the PostgreSQL trigger, not historical login data.
      const keys = sourceColumns.filter((column) => !(table === 'users' && column === 'username'));
      for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100);
        await db.run(`INSERT INTO ${identifier(table)} (${keys.map(identifier).join(',')}) VALUES ${batch.map(() => `(${keys.map(() => '?').join(',')})`).join(',')}`,
          ...batch.flatMap((row) => keys.map((key) => row[key])));
      }
      counts[table] = { source: rows.length, imported: await db.value(`SELECT COUNT(*) FROM ${identifier(table)}`) };
      if (counts[table].source !== counts[table].imported) throw new Error(`Row count mismatch: ${table}`);
    }
    const matchingAdmin = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', admin.email);
    if (matchingAdmin) {
      await db.update('users', matchingAdmin.id, { role: 'admin', password_hash: admin.password_hash, active: 1, must_change_password: admin.must_change_password });
    } else {
      const next = (await db.value('SELECT COALESCE(MAX(id),0) + 1 FROM users'));
      const { id: _id, employee_id: _employeeId, ...account } = admin;
      await db.insert('users', { ...account, id: next, employee_id: null });
    }
    // PostgreSQL identity sequences do not advance for imported explicit IDs.
    // ALTER SEQUENCE ... RESTART rolls back along with the import on failure.
    for (const column of columns.filter((c) => c.is_identity === 'YES')) {
      const sequence = await db.value('SELECT pg_get_serial_sequence(?, ?)', column.table_name, column.column_name);
      const next = await db.value(`SELECT COALESCE(MAX(${identifier(column.column_name)}),0) + 1 FROM ${identifier(column.table_name)}`);
      await db.exec(`ALTER SEQUENCE ${sequence.split('.').map((part) => identifier(part.replaceAll('"', ''))).join('.')} RESTART WITH ${Number(next)}`);
    }
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
    return { tables: counts, usersAfterPreservingAdmin: await db.value('SELECT COUNT(*) FROM users'), employees: await db.value('SELECT COUNT(*) FROM employees'), sessionsImported: 0 };
  });
}
