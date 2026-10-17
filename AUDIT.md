# HRMS audit and completion plan

Current re-audit: see [CURRENT_AUDIT.md](CURRENT_AUDIT.md) for the latest verified status and newly reproduced defects. This file retains the original audit history.

Audit date: 17 October 2026. Local checkout: `1d62558`, origin `https://github.com/BrainADZ/HRMS.git`.

Implementation follow-up: the findings below describe the original audited code. PostgreSQL replaced SQLite; administrator email login and employee/HR/manager username login are implemented. Temporary-password API restrictions, session rotation/revocation, closed-cycle review checks, draft payroll adjustment recalculation and approved-input locking are now fixed. Interview edit permissions and date validation were tightened, candidate conversion requires an accepted offer, and reset operations are transactional. See [LOGIN_SETUP.md](LOGIN_SETUP.md) and [DATABASE_SETUP.md](DATABASE_SETUP.md). Live bank transfers, offer email delivery, live AI and deployment acceptance remain separate configuration/integration work. The permanent local `hrms` PostgreSQL database is now configured and live: migrations 1 and 2, administrator login and 23 module APIs passed verification; the initial demo cleanup was verified. Subsequently, at the user's request, the original SQLite dataset was imported for local testing with backups, preserving the configured administrator. See DATABASE_SETUP.md for imported counts and verification.

## Scope and evidence

Reviewed the local repository structure, README, backend authentication and middleware, database setup, workflow routes, selected React screens, deployment files, and existing automated tests. This audit concerns the local checkout; remote branch parity was not checked.

- `npm test`: **51 passed, 0 failed**.
- `npm run build`: **passed**, 1962 modules transformed.
- Initial sandbox executions failed with process-spawn EPERM; permitted reruns succeeded. These were environment restrictions, not application test failures.
- Additional probes used disposable demo databases, not the existing company database.
- No application behavior or company configuration was changed. No `.env` secret values were read or included.
- No browser interaction, mobile/device testing, live AI call, real bank transfer, deployment smoke test, restore drill, or dependency advisory check was completed. Passing tests do not establish that every feature works in production.

## Findings and priorities

### High: temporary-password restriction is not enforced by the API

Evidence: `server/app.js` checks whether a user is authenticated, but does not block protected APIs when `mustChangePassword` is true. `server/routes/auth.js` exposes the flag and clears it after a password change. An isolated probe set `must_change_password=1`; the existing session still received HTTP 200 from `/api/meta`.

Required: add a server-side restriction with a small allowlist for password change, current-user status, and logout. Verify both new temporary-password logins and existing sessions. Retain an accessible password-change UI.

### High: closed performance cycles still accept review submissions

Evidence: `server/routes/performance.js` checks cycle status in review-detail capabilities and goal mutation helpers, but its self-review and manager-review POST handlers do not. In a disposable database, a Not Started review in a Closed cycle accepted self submission with HTTP 200.

The manager handler also permits completion before the employee self-review is submitted, because it rejects only Completed reviews. Whether HR may intentionally override this needs an explicit product rule.

Required: centralize cycle and review transition checks, reject closed/planned cycles, define any HR override, and cover both submission paths with regression tests.

### High: payroll adjustments can diverge from approved payslip snapshots

Evidence: `server/routes/payroll.js` prevents creation of new adjustments for approved runs, but adjustment update/delete handlers do not apply the same run-state restriction. `server/services/payroll.js` snapshots approved adjustments into payslips when processing the run; later changes do not automatically recalculate those snapshots.

Required: freeze consumed adjustments, or explicitly reopen and recompute payroll before accepting changes. Keep an adjustment-to-run trail and show when an in-review run requires recomputation. Regression tests must cover approve, reject, and delete after approval/payment.

### Medium: voluntary password changes retain existing sessions

Evidence: `/auth/change-password` updates the password hash but does not revoke or rotate sessions. Administrator password reset does revoke sessions.

Required: decide the session policy; normally revoke other sessions and rotate the current session when a password changes. Test reuse of the old cookies.

### Medium: payroll payment state is manual, not bank confirmation

Evidence: `/payroll/runs/:id/transfer` creates a bank-batch JSON record and changes status. `/complete` marks Processed payslips Paid. These handlers make no bank request. A bank CSV export exists.

Required: choose either a documented manual process with bank reference, evidence, reconciliation and failed-payment handling, or a real bank integration with authenticated callbacks and idempotency. A live bank API is not required if manual payment is the intended scope; the interface must accurately explain the action.

### Medium: hiring offer delivery is recorded without sending an offer

Evidence: `/candidates/:id/offer` sets `offer_status='Sent'` and logs activity. The handler does not generate or deliver an email/document.

Required: support an explicit externally-sent offer record, or implement offer generation and delivery with an auditable send result. Define candidate acceptance evidence. The hire handler does not require a previously Accepted offer; formalize whether HR override is allowed.

### Medium: payroll configuration needs company-specific acceptance

Evidence: `server/lib/payroll.js` uses global configurable rates and a TDS estimate explicitly described as FY 2025-26. `unmarkedAs` defaults to `present`. Missing salary employees are skipped when generating payslips; invalid bank details cause holds. Finance approval is available to HR/admin; there is no separate finance role.

Required: finance sign-off on current financial-year rules, state/location applicability, CTC treatment, absence policy, joiner/leaver calculations, reimbursement and rounding examples. Define approval separation and treatment of holds/omissions before declaring a run completed. This report does not independently certify statutory correctness.

### Medium: production startup can expose public demo credentials

Evidence: `server/app.js` defaults to demo seeding, and `render.yaml` explicitly selects `SEED=demo`. `/auth/config` exposes demo credentials while demo mode is enabled, as documented.

Required: use an explicit production bootstrap with empty data and private administrator credentials; fail safely if production initialization is incomplete. Preserve demo mode for intentional demonstrations.

### Reliability and verification gaps

- Resume screening has an in-memory queue with database status recovery at startup. Verify duplicate enqueue behavior, provider timeouts, crashes after status changes, corrupted files, and repeated retries. Live AI/model availability was not verified; existing AI tests use a local stand-in.
- File extension checks and randomized storage exist. Verify content validation, upload cleanup after rejected operations, safe rendering/download headers, and document access using browser tests.
- SQLite WAL and foreign keys are enabled. Establish consistent database-plus-upload backups, restore drills, migration versioning, retention, and disk-capacity alerts. PostgreSQL is not automatically necessary; capacity must be measured against intended usage.
- Docker and Render files exist. Automated CI, dependency advisory checks, non-root container operation, operational monitoring and realistic health/readiness checks need review/completion.

## Module completion checklist

These are remaining acceptance checks, not claims that each listed feature is broken.

| Module | Required verification before completion |
|---|---|
| Authentication/settings | Temporary-password restriction, session revocation, role changes, reset flows, last-admin protection, brute-force limits, production bootstrap |
| Dashboard/reports | Every KPI reconciles to source registers; vertical/date filters agree; empty data and CSV exports work |
| Employees/documents/assets/helpdesk | Create/edit/profile, manager scope, self versus HR permissions, upload/download/delete, document checklist, assignments and ticket lifecycle |
| My Space | Attendance, own balances/claims/payslips/goals/calendar and links work for employee and manager accounts |
| Attendance/work clock | Check-in/out, break/resume, reload, multiple tabs, midnight, forgotten checkout, shortfall decision, correction permissions and payroll effect |
| Office access/location | HTTPS, denied location, office IP/proxy configuration, assigned branches, remote/WFH exemptions, strict signout, log visibility and retention |
| Leave/holidays/policies | Accrual, carry-forward, cross-year requests, half-days, overlap, cancellation, pending balances, holidays and versioned acknowledgements |
| Hiring/onboarding | Requisition and pipeline transitions, interview validation and feedback access, offer evidence, duplicate hiring, employee conversion and onboarding |
| AI screening | Real PDF/DOCX/TXT, unreadable files, provider unavailable, accurate fallback labels, duplicate resumes, compare/Ask AI, authorization and spend controls |
| Payroll | Locked adjustments, independently checked calculations, approval transitions, held staff, reruns, bank CSV/manual reconciliation, paid-state evidence and payslip access |
| Performance | Closed-cycle guards, self-before-manager rule, goal weights/progress, scoped visibility, notifications and report reconciliation |
| POSH | ICC-only cases, anonymous submission behavior, committee access changes, confidential notifications, case transitions, training evidence and retention |
| Resignation | Manager/HR stages, withdrawal/rejection, checklist and clearance consistency, settlement evidence, letters, last working date and disabled login |
| Deployment | Empty-data bootstrap, HTTPS/cookies/proxy, restart persistence, backup restoration, monitoring, supported browsers and realistic concurrent use |

## Recommended implementation sequence

1. Fix confirmed authorization and workflow gaps: temporary-password gate, closed-cycle review handlers, payroll adjustment locking, session policy. Add targeted regression tests.
2. Complete module acceptance flows across employee, manager, HR, admin and ICC accounts. Record each defect with reproduction and expected behavior; fix and retest.
3. Agree operational scope: manual versus integrated banking, externally delivered versus emailed offers, notification channels, finance approval ownership. Implement the selected behavior.
4. Validate payroll/leave with company-approved examples; validate real resume files and the configured AI provider without exposing credentials.
5. Add browser end-to-end coverage for hire-to-payroll and leave-to-attendance-to-LOP, confidential POSH access, and resignation-to-login-deactivation.
6. Harden and rehearse deployment, backups, restore, upgrades and realistic load; run UAT with real roles on a staging environment.

## Definition of done

Every existing UI action has a working API or a clearly described manual workflow; backend permissions and transitions hold even for direct requests; source data reconciles with reports and payslips; errors preserve data and explain recovery; critical regression/browser tests pass; restart and restore preserve data; HR/finance owners accept the business rules.

Do not assign an overall completion percentage or fixed delivery date from this code review alone. Browser acceptance, integration scope and business-rule decisions are still needed for a credible estimate.
