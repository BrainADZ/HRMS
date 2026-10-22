Source: `C:\Users\lenovo\Downloads\BrainADZ-HRMS`
Destination: `D:\HRMS`

Merged additions:

- Hiring pipeline drag and drop, optimistic movement, refresh and the existing employee-conversion gate.
- Holiday Calendar add/delete controls for HR; holiday management in Leave is retained.
- Module colours and icons on notifications, with a 3-second countdown, pause/resume, dismiss and click actions. The visible "Click to stop" instruction has been removed.
- Desktop compact sidebar with persisted preference and `[` shortcut; current Policies submenu and company logos are retained.
- Role-aware phone tabs, searchable More menu and install instructions.
- PWA manifest, app icons, QR code, local network address discovery, offline banner and reconnection handling.
- Offline caching for public app files only, plus a page error boundary. API responses, uploads and password-reset URLs are excluded from caching.

Existing attendance and break timers, native floating clock controls, profile photos, password reset, usernames, vertical filters, document permissions, PostgreSQL implementation and other workflows are retained. Shared source API routes are already present; the only missing route was `/api/meta/addresses`.

No source `.env`, database, uploads, seed files, demo login accounts, demo app, credentials or `node_modules` were copied. Tests use isolated temporary databases and existing test fixtures.

Validation: production build succeeds. Full API suite: 95 pass, 3 fail, 1 skip. Two failures expect schema version 9 while the unchanged database currently uses version 10; one existing geofence assertion expects `location_required` but receives no error code. These unrelated implementations were not changed.

Browser checks use installed Chrome through `HRMS_BROWSER_PATH` because the Playwright package's expected browser revision is absent from the machine.

The three added browser scenarios passed: compact sidebar plus holiday management/themed pausable notification, phone navigation plus install instructions, and persisted hiring stage movement. Eight existing browser scenarios passed, including all floating clock checks, daily attendance, admin password recovery, admin page coverage and standalone-admin photos. Three existing role scenarios stop at the unchanged Username field: the test expects an accessible label, but the shared Field component renders an unassociated label. Login and Field were left unchanged.

Policy navigation update:

- POSH, Performance & Appraisal, and Attendance & Leave are now direct main-menu entries. The Policies parent group has been removed; the floating and phone menus retain the same three direct entries.
- Attendance and Leave share one section while `/attendance` and `/leave` deep links, query parameters, notifications and bookmarks continue to work. The former embedded POSH tab redirects to the standalone POSH section.
- Leave overview uses the source layout: balances, request workflow, team calendar, policy library and acknowledgements. Existing corrections, leave reports, holiday management, approval rules and document/privacy permissions remain available.
- Performance content matches the source, with the requested heading. POSH retains the source content and existing stricter ICC management permissions. Source policy titles, summaries and text match the current project's policy library; no database or employee data was replaced.
- Validation: production build passes; all five targeted browser scenarios and all three focused leave/performance/POSH API workflow checks pass.

Performance and appraisal update:

- Performance & Appraisal now has Performance and Appraisal Policy tabs. Existing review deep links continue to open the Performance workflow.
- Appraisal Policy starts with clearly marked sample text. Admin/HR can edit and save it through the existing shared policy API; employees can read the saved policy. The sample itself does not insert demo records or change review ratings.
- Sidebar rows use the original rounded highlight and right margin again, while long labels wrap within the row.

Home and notification update:

- My Space has a full-width Today Attendance card, followed by one row of Quick Actions (scrollable within the row on narrow phones).
- Personal monthly attendance uses a seven-column calendar with daily status and check-in/out times. HR/manager team register and marking controls are retained.
- Team Monthly Register now displays employee calendar cards: name/code above the month's daily statuses, with monthly totals below. Desktop uses four cards per row; narrower layouts use two or one. Month navigation, search, department/vertical filters and CSV export remain available. Clicking an editable day opens the existing attendance-marking actions in a dialog.
- Home and login show today's birthday/holiday wishes, including every birthday on the same date. Upcoming reminders appear only in a popup on the user's first home visit of the day; a local per-user/date marker prevents repeats after refresh or sign-in. Login never renders upcoming reminders. The feed exposes names and celebration dates only, with no employee IDs, emails or birth years, and is not cached.
- Notification countdown remains three seconds of unpaused time. Hover and keyboard focus pause it; clicking opens the source. The timer no longer acts as a pause/resume button.

My Space density update:

- Today Attendance uses compact spacing in My Space, retaining every metric, action and activity detail. Other dashboards retain the normal card spacing.
- Only employee accounts show the greeting in the topbar beside search and the account controls; My Space no longer repeats it below. Admin/HR/manager greetings remain in their existing locations.
- Wave emojis have been removed from all greetings. Account-menu actions now share full-width, borderless button styling and consistent spacing, including Get the mobile app.

Clock and sidebar update:

- Successful sign-out closes the floating timer before clearing authenticated workday state, avoiding an empty timer window. Unauthorized-session events also close it, and an outstanding pop-out request cannot reopen it after sign-out. The existing pause/keep-running choice is still sent to the server.
- The collapse toggle is inside the sidebar's brand area. Desktop collapsed mode shows `icon.png`; expanded mode and the mobile drawer show the full company logo.
