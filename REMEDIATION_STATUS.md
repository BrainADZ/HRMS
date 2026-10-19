# Web HRMS remediation — 17 October 2026

Scope: PostgreSQL web app for admin, HR, manager and employee. Windows EXE, Android APK, mail integration and payment integration are deferred by the user. In-app notifications and existing manual payment records remain available. No external messages or payments were sent.

Tested means the named local regression passed, not universal production acceptance. Conditional items still require business inputs, external credentials or field testing. Offline writes are not implemented in this web app.

## Changes in this pass

- Migration 4: employee attendance-correction requests, manager/HR decisions, self-approval denial, duplicate/stale-record checks, audit records and in-app notifications. Attendance → Corrections uses these APIs. Requests correct status; they do not invent missing clock times.
- Attendance, approved leave, salary/eligibility and relevant policy changes invalidate prepared payroll. Finance must rerun it. Approved/paid payroll blocks direct historical attendance/leave corrections; use later-period adjustments. Approved payslip snapshots remain unchanged.
- Overnight clocks use the shift-start date and following-day end. Late cutoffs and location-bound session expiry also account for overnight shifts.
- Session expiry clears frontend work-clock state. Revocation is checked every minute. Malformed hashes fail safely. Production hides demo logins and rejects the shared demo password.
- Manager responses hide employee document metadata, exit settlements, exit interviews and rehire eligibility. HR cannot link an orphan administrator account through employee creation. New manager assignments cannot select exited employees.
- Letters require completed offboarding and explicit HR issuance. Print APIs enforce HR/self access and stored issue dates. UI issuance no longer races printing. Company names come from settings.
- F&F supports server-calculated totals from HR-approved salary, encashment, gratuity, earnings and recovery components, with validation and before/after auditing. Eligibility and tax inputs remain HR/finance responsibilities.
- Report department, employee, vertical and as-of filters are wired to the backend. Relevant exports apply filters. Headcount uses consistent employment dates; leave reports split cross-year elapsed days correctly.
- Resume extraction limits PDF pages, file size, extracted text and expanded DOCX size, and releases PDF resources. Actual PDF/DOCX extraction and oversized-file rejection are tested.

## Disposition of the original 81 items

| # | Item | Evidence / remaining condition |
|---|---|---|
| 1 | PostgreSQL initialization | Awaited before app readiness; database tests. |
| 2 | Async DB calls | Call-site scan found no suspicious unhandled calls; API regressions exercise handlers. |
| 3 | Async attendance | Work-clock, break, shortfall and correction tests. |
| 4 | Server readiness | App construction awaits DB before listen; connection errors propagate. |
| 5 | SQLite integrity | Import tests and real restored backup counts match; original SQLite retained. |
| 6 | Login/logout | Four roles and token invalidation tested. |
| 7 | Session expiry | Multiple-device expiry denial tested; frontend timer/cache clearing implemented. |
| 8 | Role permissions | Main allowed and denied flows tested for all four roles. |
| 9 | Confidentiality | Cross-employee denial, own payslips/documents and manager redaction tested. |
| 10 | Recovery | HR/admin temporary-password reset and compulsory change tested; email recovery deferred. |
| 11 | Demo logins | Production config hiding and shared-password refusal tested; configure real deployment credentials. |
| 12 | PII/salary | HR/self access and sensitive manager response redaction tested. General directory information is available to signed-in users. |
| 13 | Uploads | Permission-before-upload, type/signature/size checks, cleanup and protected downloads tested. Malware scanning is not implemented. |
| 14 | Employee CRUD | Create/read/update/exit tested. Historical employee records are retained; destructive deletion is not exposed. |
| 15 | Profiles/departments | Update workflows and foreign keys tested. |
| 16 | Hierarchy | Cycle rejection, active-manager assignment and scoped manager workflows covered. |
| 17 | Documents | Upload/download/removal and own/HR restrictions covered; image preview tested in browser. |
| 18 | Status | Active/Notice/Exited and login disabling covered. There is no separate Inactive employment status; accounts can be disabled. |
| 19 | Onboarding | Generated username, temporary password, first change and check-in tested. |
| 20 | Check-in/out | API/service workflows tested. |
| 21 | Breaks/timer | Persisted sessions, return reasons and excluded break duration tested. |
| 22 | Overnight shifts | Deterministic shift-date/end/late-cutoff tests; API clock dates corrected. |
| 23 | Restart recovery | PostgreSQL stores clock state; API/browser reload recovery covered. Abrupt machine-failure chaos testing is pending. |
| 24 | GPS/IP | Server geofence/IP/exemption/strict-mode tests pass. Real office/device field acceptance is conditional. |
| 25 | Spoofing | Invalid coordinates/accuracy and server IP checks covered. Browser GPS cannot prove physical presence or defeat a compromised device. |
| 26 | Short/late hours | Shortfall decision/payroll impact tested; overnight late cutoff corrected. |
| 27 | Corrections | UI/API added; duplicate, stale, own-approval, scope and payroll-lock tests pass. |
| 28 | Balances/accrual | Annual/monthly/pro-rata/carry-forward arithmetic tests. |
| 29 | Leave decisions | Approval/rejection/cancellation and derived calendar covered; prepared payroll now invalidated. |
| 30 | Overlaps/calendar | Holiday/weekend arithmetic and concurrent overlap rejection tested. |
| 31 | LOP | Shared calendar feeds payroll; deduction arithmetic tested. |
| 32 | Jobs | Job endpoints and permissions covered; exhaustive individual UI action acceptance remains pending. |
| 33 | Pipeline | Stage changes and hired-candidate lock tested. |
| 34 | Interviews | Interviewer permissions and workflow covered. |
| 35 | Offers | Recorded offer/acceptance gates tested. |
| 36 | Offer email | Deferred by user; externally shared offer records do not send mail. |
| 37 | Candidate conversion | Employee/account creation, username and repeat-conversion protection tested. |
| 38 | Resume extraction | Real PDF/DOCX and size/resource limits tested. Scanned image PDFs need OCR, not implemented. |
| 39 | Claude | Local API stand-in verifies contract; timeout/retry configured. Live credentials/model availability remain conditional. |
| 40 | Fallback | Rules operate without AI credentials. Configured provider failures are recorded, not reported as successful AI. |
| 41 | Screening concurrency | Local dedupe and PostgreSQL lease exclusion/release tested. |
| 42 | Salary structure | Basic/HRA/special/employer-PF and CTC allocation arithmetic tested. |
| 43 | Statutory deductions | Configurable PF/ESI/PT/LWF and estimated TDS arithmetic tested. State/category exemptions, declarations and statutory certification require finance acceptance. |
| 44 | Attendance deductions | Calendar-based proration, LOP and stale-input invalidation tested. |
| 45 | Adjustments/holds | Recalculation, review invalidation and approved-run freeze tested. |
| 46 | Approvals | HR finance review and admin management permission tested. |
| 47 | Bank integration | Deferred; CSV/manual batch is not actual transfer execution. |
| 48 | References | Existing manual reference/confirmation flow tested; real settlement deferred. |
| 49 | Failed/partial transfers | Provider execution/reconciliation deferred; online workflow state/duplicate guards tested separately. |
| 50 | Payslips | Generation, print view and protected employee/HR access covered. |
| 51 | Reruns/history | Draft rerun and approved snapshots/locks tested. |
| 52 | Goals/cycles | Main endpoints and cycle-state tests. |
| 53 | Reviews/ratings | Self-before-manager and closed-cycle protection tested. |
| 54 | Review permissions | Role/team access covered. |
| 55 | POSH | Submission and confidential case access tested. |
| 56 | ICC/evidence | Admin-only appointments, nonmember denial and upload controls tested; not an exhaustive forensic evidence audit. |
| 57 | Resignations | Submit/manager/HR acceptance, rejection and withdrawal covered. |
| 58 | Clearance | Assets returned, required checklist and four clearances gate completion. |
| 59 | F&F | Component net and server-authoritative amount tested; eligibility/tax supplied by HR/finance. |
| 60 | Exit letters | Completed/issued gates, HR/self permission, issue date and print view covered. |
| 61 | Email delivery | Deferred by user. |
| 62 | Notifications | In-app leave/correction/hiring/payroll/exit triggers covered; external mail deferred. |
| 63 | Helpdesk/assets | Resolution/return endpoint workflows tested. |
| 64 | Dashboard KPIs | Main reads covered; report headcount/vertical reconciliation tested. Every KPI has not had independent accounting reconciliation. |
| 65 | Exports | Static CSV endpoints exercised; scoped employee/headcount/attendance filters covered. Spreadsheet-specific acceptance is not exhaustive. |
| 66 | Analytics filters | Department/employee/vertical/date implemented. Classification uses current master data, not historical department snapshots. Candidate reports use job vertical/department, not employee selection. |
| 67 | Settings | Rollback and draft payroll invalidation tested; approved snapshots unchanged. |
| 68 | PG compatibility | Real PostgreSQL isolation, nested transactions, keys, identities and rollback tests. |
| 69 | Migrations | Fresh schemas/upgrades through migration 4 tested; applied to local `hrms`. |
| 70 | Backup/restore | Real pg_dump/upload backup restored in a generated temporary DB; all six main counts and 682 document files match. |
| 71 | Concurrency/load | Concurrent creation/overlap/approval tests and 48-request mixed-role local smoke load. Production capacity testing remains conditional. |
| 72 | Errors | Auth, validation, conflicts, not-found and transaction rollback responses covered. |
| 73 | Automated tests | Final outcomes in CURRENT_AUDIT.md; rerun with `node server/scripts/test-postgres.js`. |
| 74 | UI/API mapping | Chrome covers role pages/photos and correction forms/report filters. Every button/form combination is not exhaustively browser-tested. |
| 75 | Environment | Separate server/client env, ignored secrets, CORS and production build checks. Production hosting/TLS still require configuration. |
| 76 | Documentation | Environment/database/operations documentation and this checklist updated. |
| 77 | Windows EXE | Deferred by user. |
| 78 | Android APK | Deferred by user. |
| 79 | Offline writes/sync | Not implemented; web writes require connectivity. Native platform work is deferred. |
| 80 | Offline conflicts | No offline queue exists. Online transaction/concurrency guards tested separately. |
| 81 | Multiple devices | Separate simultaneous sessions and shared expiry denial tested; transactions coordinate online writes. |

## Data and verification

Tests use disposable schemas rather than the imported company's public tables. Restore verification creates and removes only a generated temporary database. Before migration 4, backup `data/backups/postgres-2026-10-17T12-21-34-543Z` restored with: employees 105, users 24, attendance 10997, candidates 115, payslips 603, documents 682, files verified 682. Migration 4 adds a new empty correction table and does not reset this data.

Local run logs are under ignored `.test-results/`. Final command outcomes are recorded in CURRENT_AUDIT.md. These results support local web testing and a controlled pilot; conditional checks above remain explicit.

Final verification: **91/91 PostgreSQL tests**, **5/5 Chrome tests**, production build passed and dependency audit reported **0 vulnerabilities**. The 48-request mixed-role local read smoke test completed in 351 ms without errors. [API_UI_MAP.md](API_UI_MAP.md) inventories 167 backend route registrations and 172 distinct literal client references; it is a review aid, not proof of complete button coverage.
