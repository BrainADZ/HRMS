# HRMS status after fixes — 17 October 2026

> Historical verification record. For the current environment and run commands, use [ENVIRONMENT.md](ENVIRONMENT.md). Docker deployment files were later removed.

Latest web remediation and the disposition of all 81 requested items: [REMEDIATION_STATUS.md](REMEDIATION_STATUS.md). This supersedes historical scope and test figures below. EXE/APK, mail and actual payment integrations are deferred by the user. Offline writes remain unsupported; live AI, office GPS/IP and statutory payroll acceptance remain conditional.

## Latest verification

| Check | Result |
|---|---|
| Actual PostgreSQL full regression suite | **91 passed, 0 failed, 0 skipped**, 220 seconds |
| Chrome role/photo/correction-form/report checks | **5 passed**, admin, HR, manager, employee and standalone admin |
| Production frontend build | Passed |
| Dependency audit | 0 reported vulnerabilities |
| Mixed-role local smoke load | 48 concurrent reads, 351 ms total, no HTTP errors; not a production capacity benchmark |
| PostgreSQL upgrade | Migration 4 applied to local `hrms`; original company counts retained |
| Backup and real restore | Passed; 105 employees, 24 users, 10997 attendance, 115 candidates, 603 payslips, 682 documents; all 682 document files present |
| Source inventory | [API_UI_MAP.md](API_UI_MAP.md): 167 route registrations and 172 literal client API references; not exhaustive interaction acceptance |

Logs: `.test-results/final-postgres.txt`, `final-browser.txt`, `final-build.txt`, `final-audit.json`, `final-db-setup.txt`, `final-backup.txt`, `final-restore.txt`. Later sections retain the preceding audit for history.

This report covers the local working tree, including uncommitted changes. It replaces the previous open-defect status. `AUDIT.md` is historical. Remote GitHub parity and a hosted deployment were not assessed.

Environment separation update: backend settings now reside in `server/.env` and frontend settings in `client/.env`, each with its own example. Root run/database/test commands and development proxy configuration were updated. The configuration change passed 11 focused PostgreSQL/CORS/session tests, a production client build, a backend-secret bundle check and a live Chrome sign-in/employee-page check through separate frontend/API ports. The full-suite figures below describe the preceding profile-photo verification. See `ENVIRONMENT.md` for the new commands.

## Verification

| Check | Result |
|---|---|
| Full regression suite on actual PostgreSQL | **78 passed, 0 failed, 0 skipped** |
| Chrome photo/role checks | **5 verified flows passed across runs**: admin, HR, manager, employee and standalone admin; upload, replacement, refresh and persistence |
| Restarted live server | **49/49 static read/export APIs passed**; all four imported role logins and payroll permissions verified |
| Production client build | Passed |
| Independent browser-demo build | Passed; browser behavior not fully accepted |
| Dependency scan, including development dependencies | **0 vulnerabilities reported** |
| Database-and-uploads backup | Created successfully |
| Restore into a temporary database | Passed; record counts match and 682 document files verified |
| Local application | Restarted on `http://127.0.0.1:3001` with existing PostgreSQL data |

The full suite ran with `npm run test:postgres`. Disposable schemas kept test mutations separate from the imported company's public tables. Default embedded-PostgreSQL runs encountered Windows memory allocation failures; the same full suite passed against the real service. Browser checks cover login, permitted screens, restricted navigation, server failures and JavaScript errors; they do not cover every interaction, device or accounting scenario.

## Resolved findings

| Finding | Fix |
|---|---|
| H1: HR could deactivate administrators via employee/offboarding endpoints | Central guards protect employee edits, access revocation and completion. HR cannot edit administrator accounts; self/last-administrator deactivation is rejected. |
| H2: Non-ICC HR could appoint itself and access confidential cases | Only administrators appoint ICC members. Employee references are validated; before/after membership changes are audited. |
| H3: Rejected uploads left orphan files | Employee, policy and resume uploads authorize before writing. Basic content signatures and limits are checked; failed, rejected and cancelled uploads are cleaned up. |
| M1: Invalid settings partly persisted | Settings updates and validation share one transaction; failures restore every prior value. |
| M2: Approved payroll holds remained editable | Approved runs are locked. Holds changed after finance review invalidate the review and return the run to In Review. |
| M3: Exit completion bypassed clearance/settlement | All checklist items, four approved clearances, settlement payment date, returned assets and the reached last working day are required. Employee/account changes commit together. |
| M4: Salary components could exceed CTC | Combined Basic/HRA/employer-PF allocation is validated; rounded components remain within monthly CTC. |

Short API writes now share a PostgreSQL advisory transaction lock, covering cross-module read/check/write invariants. Responses wait for commit. Sessions and roles are checked again inside the lock. Concurrent HTTP regressions verify unique employee codes, a single accepted overlapping leave request and a single leave decision.

Profile photos now support administrator, HR, manager and employee accounts, including administrators without an employee record. The account menu offers preview/upload, employee profiles expose Change photo, and avatars refresh after replacement. Initials have been replaced with a default profile illustration when no photo exists. Migration 3 adds nullable account-photo storage without modifying existing employees or credentials. New regressions cover upload permissions, invalid files, standalone accounts and replacement cleanup.

Background jobs no longer reuse a released transaction connection. Jobs start after commit and are discarded on rollback. Statements within a reserved connection are serialized. Resume jobs are deduplicated locally, recovered on restart, protected by a PostgreSQL worker lease across connections and recorded as failed on unexpected errors. AI calls have a timeout and limited retries. Lease exclusion/release and post-commit behavior have regression tests.

Hired candidates cannot be moved back, rejected, given revised offers or have offer acceptance reversed through recruitment actions. Offboarding clearances, settlements and exit interviews cannot be edited after completion.

The vulnerable parser chain was resolved through an `argparse` override; Mammoth CLI help still works and the dependency scan is clean. Login-throttle memory is bounded. Docker runs as `node`. GitHub Actions defines PostgreSQL tests, both builds, browser tests and a dependency scan; its first remote execution is pending.

## Feature and role coverage

| Role / module | Covered workflows |
|---|---|
| Admin | Email login, administrator lifecycle, management payroll approval, settings, ICC appointment, static read/export APIs, browser pages |
| HR | Username login, employee/logins, documents, offers/conversion, payroll preparation/review, policies, assets, helpdesk and exits |
| Manager | Username login, team leave/short-hours decisions, hiring/interview permissions, performance review gates, permitted browser pages |
| Employee | Username login, first-password change, work clock/breaks, leave, own documents/payslips/claims, policy acknowledgement, complaints and resignation |
| Attendance/location | Office/WFH/remote rules, exemptions, strict-mode sign-out, return reasons, short hours and overnight closure |
| Payroll | Calculation tests, approvals, adjustment recalculation, hold locks, manual bank batch, payment reference, payslips, notifications and CSVs |
| Performance / POSH | Self-before-manager and closed-cycle protection; complaint anonymity, ICC confidentiality and appointment permissions |
| PostgreSQL/import | Migrations, usernames, identities, foreign keys, rollback, SQLite import and retained password hashes |

These are verified paths, not a claim that every possible combination was exercised.

## Preserved company data

| Records | Count |
|---|---:|
| Employees | 105 |
| Logins | 24 |
| Attendance | 10,997 |
| Candidates | 115 |
| Payslips | 603 |
| Employee documents | 682 |

Configured and imported credentials were retained. The original SQLite snapshot and pre-import dump remain under `data/backups/`. New backups include uploads, record counts and a completion manifest. `npm run db:verify-backup` restores into a generated temporary database, verifies counts/files and removes that temporary database.

## External configuration and production acceptance

- Banking is an explicit manual CSV workflow. Recording payment requires a bank reference; no bank API transfer or automatic reconciliation is integrated.
- Offers are shared externally and recorded in HRMS. SMTP/SMS delivery is not configured; notifications are in-app.
- Rule-based screening and keyword answers work without an AI key. Provider requests are mock-tested; live credentials/provider/model acceptance remains pending.
- Demo credentials remain visible intentionally for localhost. Public hosting needs disabled demo exposure, changed shared passwords, HTTPS/secure cookies and a restricted application database role. The saved local connection retains the existing PostgreSQL account.
- Login throttling is per process. Multi-instance public hosting needs a shared gateway/rate limiter. The global workflow lock favors correctness for a small HRMS; load acceptance remains pending.
- Backup creation and restore verification are implemented/tested. Automatic scheduling, retention and off-machine storage are not configured.
- Current-year/state payroll rules need finance acceptance. The TDS function remains a labelled estimate. GPS/device behavior and hosted HTTPS need environment acceptance.
- Docker, remote CI and hosted deployment have not been exercised here. Changes are local and uncommitted.

See `OPERATIONS.md` for commands and workflow details.
