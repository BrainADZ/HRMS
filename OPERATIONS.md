# Local operation and verification

The imported company uses local PostgreSQL. Run `npm start` after `npm run build`, or use `npm run dev` while editing. Preserve the current `server/.env`; it contains the local connection credentials.

## Verification commands

- `npm run test:postgres` runs every automated regression against disposable schemas in the configured PostgreSQL database. It needs permission to create/drop schemas. It does not reset the imported company's public tables.
- `npm test` runs the same suite using embedded PostgreSQL by default. On a Windows machine under memory pressure, use `test:postgres` instead.
- `npm run build` builds the normal web client.
- `npm run build:demo` builds the independent browser demo.
- `npm run test:browser` runs Playwright role checks. First install Chromium with `npx playwright install chromium`. To use an existing Chrome installation on Windows, set `HRMS_BROWSER_PATH` to its executable path. Set `HRMS_TEST_POSTGRES=1` to use disposable PostgreSQL schemas for browser checks.

GitHub Actions runs the PostgreSQL suite, both builds, browser checks and the dependency scan. The workflow has been added locally; its first remote run is pending.

## Backup and recovery verification

Run `npm run db:backup`. It writes `data/backups/postgres-<timestamp>/database.dump`, an `uploads` directory, and `manifest.json`. The dump contains the application's public schema; disposable test schemas are excluded. API writes coordinate with the backup lock. Keep other database writers stopped during backup. A backup is complete only when its manifest contains `completed: true`.

Run `npm run db:verify-backup` to restore the latest backup into a newly generated temporary database, compare the main record counts to the manifest and check every employee-document file. The command removes only that generated temporary database after verification. It requires a PostgreSQL role allowed to create databases. You can pass an explicit backup folder after `--`.

PostgreSQL client tools must be installed. The commands find Windows PostgreSQL installations automatically; elsewhere they use `PATH`. Override discovery using `PG_DUMP_PATH` and `PG_RESTORE_PATH`. Use matching PostgreSQL client/server versions. TLS certificate configuration for client tools should follow their native PostgreSQL environment settings.

For an actual recovery, stop HRMS, create an empty destination database, restore `database.dump` using `pg_restore --clean --if-exists --exit-on-error --no-owner --no-privileges`, restore the matching `uploads` directory, and point `server/.env` at that destination before restarting. Restore into a separate destination first and inspect it before switching the application.

Automatic scheduling, retention and an off-machine backup destination are deployment choices and are not configured on this laptop. A Windows Task Scheduler action can run `npm run db:backup` with this repository as its working directory.

## Role workflows

Every account can change its profile photo from the top-right account menu → Change photo. Choose a JPG, PNG or WebP image up to 3 MB, preview it and save. HR/admin can also change an employee's photo from their employee profile. Uploaded photos appear in profile cards, the directory and account avatars; accounts without an uploaded image show a default profile illustration. Standalone administrator photos are supported without creating employee records. Replacing a photo refreshes avatars immediately and removes the previous stored image after commit.

Administrators sign in with email; HR, managers and employees use first name + employee code usernames. New/reset credentials require a password change. Administrators appoint ICC members. An HR account outside ICC cannot access committee cases by appointing itself.

Payroll follows draft, finance review, management approval, bank-batch preparation and payment recording. Approved runs are locked; send back for review to change holds. Download the bank CSV, arrange payment externally, and record the bank payment reference to release payslips. The application does not initiate a bank API transfer.

Share offer letters externally, then record the sent offer and candidate acceptance. Accepted candidates convert into employee records, onboarding tasks and optional logins. Recruitment actions cannot reverse a hired candidate's state.

Offboarding completion requires every checklist item, all four clearances, a recorded settlement payment date, returned assets and a reached last working day. Settlement and clearance records cannot be edited after completion.

AI screening uses rule-based scoring and resume keyword answers when no provider credential is configured. With credentials, provider calls have a timeout and limited retries. Queue jobs are deduplicated, dispatched after commit, recovered after restart, and protected by a PostgreSQL worker lock across processes. Each active worker uses one additional PostgreSQL connection, up to three per application process.

## Production acceptance still required

Before public hosting, disable demo credential exposure without deleting records that should be retained, replace shared demo passwords, configure HTTPS and secure cookies, and use a restricted application database role with a separate migration/maintenance role. The local app still uses the existing PostgreSQL account so the saved local setup keeps working.

Login throttling is bounded in memory per process. A multi-instance public deployment needs a shared gateway/rate limiter. The global workflow lock favors correctness for a small HRMS; representative load testing is needed before scaling.

Bank payments and offer sharing are explicit manual workflows. In-app notifications work; SMTP/SMS delivery is not configured. Live AI credentials/provider acceptance, deployed HTTPS, device GPS accuracy and finance acceptance of current-year/state payroll rules require the respective external configuration or review. Docker runs as `node`; the image and hosted deployment have not been exercised here.
