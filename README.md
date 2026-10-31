# BrainADZ HRMS

People operations for **BrainADZ Live, BrainADZ Marketing and BrainADZ Exhibits** in one web app: hiring, AI resume screening, employee records, attendance, leave, Indian payroll, performance, POSH, resignations and reports.

It is a complete application: a Node.js server with a PostgreSQL database, real logins with roles, file uploads, and a React interface that follows the BrainADZ HRMS designs.

Current verification: 91 PostgreSQL regressions and five Chrome role/workflow tests pass. See [REMEDIATION_STATUS.md](REMEDIATION_STATUS.md) for every item in the latest 81-point checklist, including remaining acceptance conditions. EXE/APK, mail and bank integrations are deferred; offline writes are not available.

## What's inside

| Module | What it does |
|---|---|
| **Dashboard** | Headcount, open positions, joiners, people on leave, vertical split, hiring funnel, upcoming interviews, leave approvals, payroll status, attrition trend, people analytics, policy and POSH compliance, notice board. Click a vertical logo in the top bar to filter by vertical. |
| **My Space** | Every employee's home: check in / check out (office or WFH), leave balances, apply leave, payslips, reimbursement claims, goals, team calendar, birthdays and work anniversaries, helpdesk requests. |
| **Hiring** | Job requisitions, a 7-stage candidate pipeline, interview scheduling, interviewer feedback and scorecards, offers, source performance, and "Convert to employee" with an onboarding checklist. |
| **Resume Screener AI** | Upload PDF, DOCX or TXT resumes against a job. Each resume is read, scored for match %, skill by skill, with matched and missing criteria, knockout answers and a summary. Shortlist, hold, reject or move to interview. Detect duplicates, compare up to 3 candidates, and "Ask AI" about any candidate. Uses Claude when an API key is set, otherwise rule-based scoring. |
| **Employees** | Directory with filters, full profiles (overview, documents, attendance, leave, performance, compensation, assets), org structure, logins, document uploads, asset tracking, helpdesk requests. |
| **Leave & Policies** | Leave balances (EL accrues monthly with carry forward; CL, SL, maternity, paternity, WFH, loss of pay), approvals, team leave calendar, holiday calendar, leave policy builder, policy library with versioned acknowledgements. |
| **Work clock** | A live timer at the right of the top bar (and in the browser tab title) from check-in. "Pop out clock" opens a small always-on-top window that stays visible when the app is minimised (Chrome and Edge on a computer; it can open automatically at check-in). A day can have several sessions: check out or sign out with "Pause clock" when stepping out, and on return the app asks the reason for the gap (client meeting, site visit, lunch, personal, medical, other). |
| **Attendance** | Today's board, check-in times with late flags, and a monthly register HR and managers can correct. Feeds loss-of-pay into payroll. **Short hours:** the morning after a working day under the required hours (8 by default, 15 minutes' grace), the employee is alerted to explain why; their reporting manager or the CEO approves (the day counts in full) or rejects (the day becomes a half day). HR can see every case. Clocks left running overnight are closed at the end of that workday. |
| **Office-only sign-in** | Sign-in and office check-in only from an office: within a set distance of the office's position (browser location), or from the office network. Administrators, staff HR allows to work from anywhere, and people on approved work from home or leave that day are exempt. Office-only sign-ins end at midnight, so each workday starts in the office. Locations are recorded at sign-in, at check-in and every 10 minutes while the work clock runs; HR sees everyone's log (Attendance → Location log), managers their team's, and employees their own. An optional strict rule also signs people out when they leave the office, pausing their clock. Off until HR sets it up. |
| **Documents** | Every employee's joining and HR documents in one place. HR gets a checklist of the required documents (Aadhaar, PAN, address proof, education, offer letter, appointment letter, bank proof) showing what is on file and what is missing, and can upload for anyone. Employees see and upload their own; managers do not see their team's ID documents. |
| **Holiday Calendar** | The year at a glance: company and restricted public holidays on twelve month grids, with weekly offs, today and your own leave marked, plus the list of holidays and the next one coming up. |
| **Payroll** | Monthly run: Basic / HRA / special allowance from CTC, PF (with wage ceiling), ESI, professional tax, LWF, TDS, loss of pay from attendance and leave, bonuses and reimbursements. Workflow: run → finance review → management approval → bank transfer → paid. Payslips (print / save as PDF), bank transfer CSV, payroll register, statutory dues, exceptions (missing attendance, KYC, bank details, pending claims). |
| **Performance** | Review cycles, weighted goals with progress, self review, manager review, rating distribution, top performers. |
| **POSH** | Internal Committee, confidential (optionally anonymous) complaints visible only to the ICC, case log with 90-day due dates, awareness training and policy acknowledgement tracking. |
| **Resignation** | Submit → manager approval → HR acceptance → offboarding checklist, clearance matrix, exit interview, full & final settlement, experience and relieving letters, rehire eligibility. |
| **Reports** | Headcount, attrition, payroll cost and leave trends, plus CSV downloads of every register. |
| **Settings** | Company rules (including working hours per day), weekly offs, payroll rules, verticals / departments / locations, leave types, users and roles, audit log, and data reset. |

### Roles

- **Employee**: self-service only.
- **Manager**: their team's leave, attendance, reviews and resignations, plus jobs they hire for.
- **HR**: everything except administrator-only actions.
- **Administrator**: everything, including the management approval step for payroll and data reset.

### Create a master admin during deployment

After `npm run db:setup` and the app's **first start** (which initializes the company), set `MASTER_ADMIN_EMAIL` and `MASTER_ADMIN_PASSWORD` in `.env`, then run:

```bash
npm run admin:create
```

Use an email that is not already assigned to another account. The password must be at least 12 characters and contain letters and numbers. Sign in through **Administrator** with that email; the app requires a password change on first login. The command creates only one account and does not seed or clear company data. Running it again with the same email leaves the existing account and password untouched. You can remove `MASTER_ADMIN_PASSWORD` from `.env` after creation. This account has administrator access and can approve expense advances. Personal employee actions still require linking an employee record.

## Run it on your computer

You need **Node.js 22.13 or newer** ([download](https://nodejs.org)) and **PostgreSQL 16+**. Copy `.env.example` to `.env`, set the PostgreSQL connection, then create the database and schema with `npm run db:setup`. The server uses PostgreSQL only.

```bash
npm install
npm run db:setup
npm run build
npm start
```

Open the URL printed in the terminal. The server tries port 3000 (or `PORT` from `.env`); if occupied, it automatically binds a free port. With `SEED=demo`, the first start creates a demo company with 50 fictional employees, a CEO-to-team reporting hierarchy, four completed months of attendance and payroll, and sample hiring, leave, performance and document records.

Demo logins (password `Brainadz@2026` for all). Only the administrator signs in by email; HR, managers and employees sign in by username. All four profiles and their credentials appear on the local demo sign-in screen.

| Profile | Sign-in ID |
|---|---|
| CEO, Administrator | `rajiv.malhotra@brainadz.com` |
| HR Manager | `PriyaBZ040` |
| Sales Manager | `VikramBZL005` |
| Marketing Executive | `AaravBZM021` |

Every team lead and vertical head also has a manager login with the same password; they use their generated username rather than their email.

For a disposable local demo, run `npm run demo` (no PostgreSQL setup needed). To populate an already configured, empty PostgreSQL company, run `npm run demo:seed` once; it refuses a database with employees. To reset a persistent demo database, stop the server and run `node --env-file=.env server/reset.js --confirm-reset`; the command refuses databases not marked as demo.

## Turn on Claude for resume screening

Set an Anthropic API key before starting the server:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

or put it in a `.env` file (copy `.env.example`). The screener then sends each resume (PDF files as documents, DOCX as text) and the job requirement to **Claude Opus 5.5** (`claude-opus-5-5`) and gets back a structured result: overall match, per-skill scores with evidence, matched and missing criteria, knockout answers, extracted contact and career details, and a summary. "Ask AI" answers questions about a candidate from their resume. Server-side refusal fallback is enabled (`fallbacks: "default"`), so if the model declines a request the API retries it on Anthropic's recommended fallback model.

Each screened resume is one API call billed to your Anthropic account. Without a key, the screener uses keyword and rule-based scoring and "Ask AI" quotes the matching lines of the resume. Set `HRMS_AI_MODEL` to use a different Claude model.

## Start using it with real data

Two ways:

1. **From the demo:** sign in as the administrator, go to **Settings → Data → Remove demo data** and choose the email and password you will sign in with. Everything fictional is deleted, including every demo login; your administrator account, verticals, departments, locations, leave types, holidays and policy library stay. Then add employees (**Employees → Add**, or convert hires from **Hiring**) and create their logins in **Settings → Users & Roles** ("Create missing logins" downloads a CSV of one-time passwords).
2. **Empty from day one:** start with `SEED=empty ADMIN_EMAIL=you@brainadz.com ADMIN_PASSWORD=ChooseAStrongOne1 npm start`. You'll be asked to change the password at first sign-in. Add yourself as an employee with the same email and your login is linked automatically.

Before the first real payroll, check **Settings → Payroll Rules** (Basic %, HRA %, PF, ESI, professional tax and LWF differ by state) and **Leave & Policies → Leave Management → Holidays** (festival dates change every year; only 2026 festivals are pre-filled). TDS is an estimate under the new tax regime; enter each employee's actual monthly TDS on their profile once they declare investments.

## Run it on the office network

One computer in the office runs the HRMS; everyone on the same Wi-Fi or LAN opens it in their browser. No hosting account needed.

1. On that computer, install **Node.js** (LTS version from [nodejs.org](https://nodejs.org)).
2. Copy this project folder onto it (download the ZIP from GitHub and unzip it).
3. Configure PostgreSQL in `.env` and run `npm run db:setup` once (see [DATABASE_SETUP.md](DATABASE_SETUP.md)), then double-click **`start-office.bat`** (Windows) or **`start-office.command`** (Mac; the first time, right-click → Open). The first run installs and builds, which takes a few minutes.
4. The window prints the address to share, for example:

   ```
   On the office Wi-Fi: http://192.168.1.25:3000
   ```

   Colleagues open that address in their browser. Keep the window open; closing it stops the HRMS.

Things to know:

- **Windows firewall:** the first time, Windows asks whether Node.js may use the network. Tick **Private networks** and click Allow. If you missed it, allow Node.js under Windows Security → Firewall → Allow an app.
- **Keep the computer on** and stop it from sleeping (Settings → Power → Sleep: Never). If it is off, nobody can use the HRMS.
- **Same address every day:** routers can hand the computer a new address after a restart. Ask whoever manages the router to reserve its address (DHCP reservation).
- **Working from home:** the address only works inside the office network. For remote access, use the office VPN, or a tunnel such as Tailscale or Cloudflare Tunnel, rather than opening a port on the router.
- **Backups:** back up PostgreSQL using `pg_dump` or provider backups, and back up the `data/uploads` folder separately. Restore them from a consistent point.

## Put it online

Build the client with `npm run build`, then run `npm start` on a Node.js host.
Provide a PostgreSQL connection through server environment variables and a
persistent folder for `DATA_DIR` uploads. Back up PostgreSQL and uploads
together. Deployment details depend on your host.

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Preferred port; automatically uses a free port if occupied. Set `0` to always ask the OS for a free port. |
| `HOST` | `0.0.0.0` | Network interface; `127.0.0.1` keeps it to this computer only |
| `DATABASE_URL` | | PostgreSQL connection URL (or use `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`) |
| `PGSSLMODE` | `disable` | Set to `require` for TLS with certificate verification |
| `PGPOOL_MAX` | `10` | Maximum pooled PostgreSQL connections |
| `DATA_DIR` | `./data` | Uploaded resumes, documents and photos. **Must be on a persistent disk.** |
| `SEED` | `empty` | `demo` or `empty` for the first start |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | First administrator when `SEED=empty` |
| `ANTHROPIC_API_KEY` | | Enables Claude resume screening |
| `HRMS_AI_MODEL` | `claude-opus-5-5` | Claude model for screening |
| `TRUST_PROXY` | | Set to `1` behind a load balancer / HTTPS proxy |
| `COOKIE_SECURE` | | Set to `true` when served over HTTPS |

**Backups:** back up PostgreSQL and the `DATA_DIR/uploads` folder separately. Test restoring both before using real company data.

## Turn on office-only sign-in

1. Go to **Settings → Office Locations** and edit each office. Stand inside the office and press **Use my current location**, or paste the coordinates from Google Maps (right-click the building). A radius of 200–500 m suits most buildings.
2. Add the office's network address too: the office's public IP for the cloud version (search "what is my IP" on the office Wi-Fi), or the LAN range such as `192.168.1.0/24` if the HRMS runs on an office computer. People on that network count as in the office even when their computer's location is rough.
3. Under **Allowed from anywhere**, add field staff who work at client sites.
4. Set the rule to **Sign in and check in only at an office** and save. Administrators can always sign in, so nobody gets locked out.

Things to know:

- Browsers share location only over **https**, so the location check works on the cloud version. On an office computer over plain http, rely on the office network addresses.
- Desktop computers estimate location from nearby Wi-Fi and can be off by a few hundred metres; the office network address avoids that.
- A determined person can fake browser location with developer tools; the office network check is much harder to fake. Use both.
- Tell employees their location is checked at sign-in and recorded while their work clock runs, and why (India's Digital Personal Data Protection Act expects notice). Everyone can see their own history under Attendance → Location log.

## Security notes

- Passwords are hashed with scrypt; sessions are HTTP-only cookies; repeated failed logins are throttled.
- Every state-changing request needs a custom header the browser can't send cross-site (CSRF protection), and the server sends a strict Content Security Policy.
- Access is enforced on the server for every endpoint: employees see only their own HR data, managers only their team's, and POSH complaints only the ICC and administrators.
- Uploaded files are stored with random names outside the web root and are only served to people allowed to see them.
- Change the demo password or remove demo data before inviting real users; the login page lists the demo accounts while demo data is loaded.

## For developers

Frontend/backend configuration and separate run commands are documented in [ENVIRONMENT.md](ENVIRONMENT.md). Private settings are in `.env`. The frontend needs no local env file. Use `npm run dev` for both.

See [CURRENT_AUDIT.md](CURRENT_AUDIT.md) for verified status and [OPERATIONS.md](OPERATIONS.md) for PostgreSQL tests, browser checks, backups and recovery.

```bash
npm run dev     # API + Vite select free ports automatically; open the Vite URL printed
npm test        # unit and API tests (node:test)
```

- `server/`: Express 5 API using PostgreSQL through an async `pg` connection pool
  - `lib/`: pure rules (payroll, leave, dates, resume scoring), covered by tests
  - `services/`: calendar/attendance derivation, payroll runs, leave balances, Claude client, resume text extraction
  - `routes/`: one file per module
  - `seed.js`: demo company
- `client/`: React 19 + Vite. `src/pages/` has one file per module; `src/components/` holds the UI kit and hand-drawn SVG charts.
- `server/scripts/`: development, database and maintenance commands.
- `server/tests/`: isolated PostgreSQL (PGlite) tests, API flows and browser role checks.
- `server/demo.js`: the single local demo launcher. Run `npm run demo`; it starts the real API and client with fictional data in a temporary embedded database. Press `q` and Enter to stop and remove its data.
