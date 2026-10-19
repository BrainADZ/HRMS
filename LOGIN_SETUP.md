# Login setup

Only the `admin` role signs in with email and password. Employees, managers and HR sign in with their generated username and password. The sign-in screen has separate **Employee login** and **Admin login** choices. Server-side checks enforce the distinction, including direct API calls.

## Username format

The username is the employee's first-name field followed by their visible employee code, all lowercase, with spaces and punctuation removed. For example, first name `Aarav` and employee ID `BZ030` produce `aaravbz030`. This uses the employee code shown in the directory, not the internal database row number.

Names without any ASCII letters/digits use `employee` as the prefix. Employee code and username uniqueness are enforced by the database. Changing the first name or employee code updates the username; passwords stay the same. Administrator accounts have no employee username. Changing an account's role also changes its permitted login method and signs out its existing sessions.

## Existing and new accounts

Migration 2 creates usernames for existing linked accounts without changing password hashes. It runs automatically at startup or with `npm run db:setup`. No demo/company records are deleted. A non-admin account must be linked to an employee.

New employee creation, candidate conversion, individual login creation and bulk login creation all use the same database generation rules. Settings → Users & Roles and employee profiles display the login username. Temporary-password dialogs and the bulk login CSV include it so HR can distribute credentials privately.

Employees can be converted from candidates after an offer is recorded as accepted. Offer delivery remains an externally recorded/manual workflow; recording an offer does not send an email.

## API examples

Administrator:

```json
{ "loginType": "admin", "email": "admin@yourcompany.com", "password": "your-password" }
```

Employee, manager or HR:

```json
{ "loginType": "employee", "username": "aaravbz030", "password": "your-password" }
```

Both use `POST /api/auth/login`. Usernames and administrator emails are matched case-insensitively. Non-admin email login and administrator username login are rejected. Existing test fixture helpers translate fixture emails to usernames internally; the production API does not offer an email-to-username lookup.

## Password and session behavior

Accounts created/reset with a temporary password must change it before accessing protected APIs. Only authentication status, password change and logout are available until then. The UI opens the required password-change dialog before loading protected pages. Changing a password revokes old sessions and rotates the current cookie while preserving its previous expiry, including office-only midnight expiry.

## PostgreSQL credentials

PostgreSQL connection credentials are separate from every HRMS login. If `password authentication failed for user "postgres"` appears, PostgreSQL has rejected the connection password; changing an HRMS user's password will not fix it.

For passwords containing special characters, leave `DATABASE_URL` empty and use these fields in `server/.env`:

```env
DATABASE_URL=
PGHOST=localhost
PGPORT=5432
PGDATABASE=hrms
PGUSER=postgres
PGPASSWORD="your PostgreSQL installation password"
```

Then run `npm run db:setup`, `node --env-file=server/.env server/scripts/db-check.js`, and `npm start`. See [DATABASE_SETUP.md](DATABASE_SETUP.md) for deployment and backup instructions.

## API workflow fixes included

- Closed/planned review cycles reject self and manager submissions; manager completion requires a submitted self review.
- HR adjustment edits rebuild draft payroll snapshots and clear finance review. Approved/scheduled/completed payroll inputs cannot be changed or deleted.
- Interview times are validated on create and edit. Only the assigned interviewer, hiring manager or HR can edit an interview.
- Candidate conversion requires an accepted offer and rejects duplicate hiring.
- Employee/account changes and demo reset operations use database transactions to avoid partial updates.

Bank transfers remain a manual CSV/reconciliation workflow; no live bank API is configured. Live AI screening, deployment and browser/device acceptance still require their own configured services and verification.

API regression coverage includes every one of the 49 static GET/export routes discovered from the route files, plus cross-role write workflows for employee accounts, hiring/interviews, payroll, performance, policies/POSH, assets and helpdesk. Existing attendance, leave, document and resignation tests continue to run. This is automated API coverage, not a claim that every browser action or external integration has been exercised.

Validation: 63/63 tests passed; the final demo-session revocation and administrator-role protection regressions also passed in a focused rerun. Production and standalone demo builds passed. Large demo WASM/data binaries are now embedded after bundling, avoiding compiler failures on oversized base64 input. The local PostgreSQL password was subsequently reset with authorization and saved privately in `server/.env`; original authentication rules were restored. Permanent database `hrms` is initialized with migrations 1 and 2. Live administrator login and 23 module APIs passed. That clean-company setup was verified first. The original SQLite dataset was later imported at the user's request for local testing; imported employees use generated usernames and their original passwords, while the configured administrator credentials are preserved.
