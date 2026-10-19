# PostgreSQL setup

Migration 4 adds attendance correction requests with pending-request uniqueness and foreign keys. Apply it with `npm run db:setup`, or let normal server startup apply migrations before serving routes. It does not reimport or erase employee, attendance or payroll records. The current web remediation checklist is in [REMEDIATION_STATUS.md](REMEDIATION_STATUS.md).

The running server uses PostgreSQL only and does not read or modify the old SQLite database. The optional migration command below can explicitly import it. PostgreSQL 16 or newer is recommended. Uploaded files remain in `DATA_DIR/uploads`; the database is stored by PostgreSQL separately.

An explicit one-time import is available for the old SQLite data: `node --env-file=server/.env server/scripts/import-sqlite.js --confirm-import`. It requires an initial empty PostgreSQL company, creates a consistent SQLite snapshot (including WAL changes) and a PostgreSQL custom-format backup under `data/backups/`, imports records in one transaction, preserves record IDs and existing password hashes, regenerates usernames, advances identity sequences, and keeps the configured administrator credentials. Old sessions are excluded. Uploaded files stay at their existing paths. A populated PostgreSQL company cannot be overwritten with this command. `SQLITE_IMPORT_FILE` overrides the default `data/hrms.db`; `PG_DUMP_PATH` can override the PostgreSQL backup executable. Keep the app idle during import; account sessions are cleared and users should sign in again afterward.

Local testing import completed on 17 October 2026: 105 employees, 10,997 attendance records, 115 candidates, 603 payslips, 682 documents and 24 logins including the preserved administrator. Live login, document download and 23 module APIs were verified. The backup directory contains `source-sqlite.db`, `postgres-before.dump`, `import-report.json`, `verification.json` and `login-usernames.csv`. The username list contains no passwords. Imported users keep their old passwords; for example, the existing demo employee `aaravbz030` still uses the documented demo password. The import retains source office-access settings, so location rules may still apply. PostgreSQL remains the application's database; the old SQLite file is used only by this explicit migration command.

For administrator email login and employee username login, see [LOGIN_SETUP.md](LOGIN_SETUP.md). Migration 2 adds/backfills employee usernames automatically.

## Local Windows setup

Your installed PostgreSQL service must be running. In the project's `server/.env`, leave `DATABASE_URL` empty and set:

```env
DATABASE_URL=
PGHOST=localhost
PGPORT=5432
PGDATABASE=hrms
PGUSER=postgres
PGPASSWORD="your PostgreSQL installation password"
PGSSLMODE=disable
PGPOOL_MAX=10
SEED=empty
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD="your new HRMS administrator password"
COOKIE_SECURE=false
TRUST_PROXY=
```

The PostgreSQL password and HRMS administrator password are separate. Quotes in `server/.env` are useful when a password contains `#`; use a quote style that does not occur inside your password. Never commit `server/.env` or paste passwords into chat. `DATABASE_URL`, when nonempty, takes precedence over the separate connection fields.

Then run in a terminal inside this folder:

```powershell
npm install
npm run db:setup
node --env-file=server/.env server/scripts/db-check.js
npm run build
npm start
```

`db:setup` connects to the maintenance database `postgres`, creates the named database if it does not exist, and applies versioned schema migrations. It never drops an existing database. The PostgreSQL user needs database-creation permission for that step. Optionally set `DATABASE_ADMIN_URL` for a separate database-creation account. For hosted databases that are already provisioned, start the app directly; migrations run at startup without needing database-creation permission.

The first app start with `SEED=empty` creates the administrator from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. These settings do not overwrite existing accounts on subsequent starts. `SEED=demo` intentionally creates fictional data instead, only in a database without users or employees.

If you do not remember the PostgreSQL installation password, use the credentials from your PostgreSQL administrator or restore access through your own PostgreSQL installation. The app cannot infer that password from the HRMS administrator credentials.

## Connection URL alternative

```env
DATABASE_URL=postgresql://postgres:URL_ENCODED_PASSWORD@localhost:5432/hrms
```

With separate `PGPASSWORD`, write the raw password; no URL encoding is needed. For remote TLS connections set `PGSSLMODE=require`; certificate verification remains enabled. A private certificate authority can be supplied through `PGSSLROOTCERT` as PEM text with literal `\n` between lines. Do not put SSL override options in the connection URL; use the documented SSL fields.

## Schema and application behavior

- `server/database/schema.sql` defines the PostgreSQL tables, identities, indexes, constraints and text-format date/JSON fields expected by the existing UI.
- `schema_migrations` records applied migration versions. `002-usernames.sql` adds employee usernames and their synchronization triggers; `003-profile-photos.sql` adds photos for standalone administrator accounts. Employee-linked accounts continue using employee profile photos. Schema initialization and first company initialization use PostgreSQL transaction advisory locks.
- `server/db.js` provides async CRUD operations and a bounded `pg` connection pool. Each transaction uses one checked-out client, including nested service calls; failures roll back changes.
- Application routes, permissions, services, seeders and background screening await database operations. SQL parameters remain bound values rather than string interpolation.
- `node --env-file=server/.env server/reset.js --confirm-reset` only resets a database already marked as demo. Stop the server before running it. It refuses unmarked company databases and retains uploaded files.

## Backups and deployment

Back up PostgreSQL with your provider's backup service or `pg_dump`, and back up `DATA_DIR/uploads` separately. Restore both from a consistent point. Copying the application `data` folder alone does not back up PostgreSQL.

The Node server needs a reachable PostgreSQL instance and connection settings. Provide `DATABASE_URL` through `server/.env` or your host environment. Retain a persistent uploads disk. On HTTPS deployments set `COOKIE_SECURE=true` and configure `TRUST_PROXY` to match your reverse proxy.

## Verification

`npm test` runs API integration tests against isolated embedded PostgreSQL engines (PGlite), plus database tests for constraints, rollback, parameter binding and transaction client isolation. No tests connect to your company database. `node --env-file=server/.env server/scripts/db-check.js` verifies the actual configured PostgreSQL server and migrations without printing its connection password. `npm run demo` uses temporary PGlite data; production uses the `pg` driver against an external PostgreSQL server.

Validation on 17 October 2026: all 55 automated tests passed; production client and optional standalone demo builds passed. A separate temporary PostgreSQL 18.6 server also passed database creation, migration, empty-company seeding, administrator login, ten module read APIs, transaction writes and numeric-result checks through the real `pg` driver. That test server was stopped. The permanent `hrms` database has now also been created on the local PostgreSQL 18.6 service. Migrations 1 and 2 are applied. The initial clean-company verification passed for administrator login and 23 module APIs. The original SQLite dataset was subsequently imported for local testing as described above, retaining the configured administrator. The PostgreSQL password was reset with authorization, saved privately in `server/.env`, and the original authentication rules were restored.
