import { validateAbsenceReasons, saveAbsenceReasons } from './missed-attendance.js';
import { invalidatePayrollInputs } from './payroll-inputs.js';
import {
  fail,
  getSettings,
  today,
  scopeIds,
  str,
  notifyUsers,
  userIdForEmployee,
} from '../core.js';
import { isValidYmd, zonedIso } from '../lib/dates.js';
import { startSession, endSession } from './workday.js';

export async function currentWorkStatus(db, employeeId) {
  if (!employeeId) return null;
  return (
    (await db.get(
      'SELECT * FROM work_statuses WHERE employee_id=? AND end_at IS NULL',
      employeeId,
    )) || null
  );
}

export async function workStatusHistory(db, user) {
  const scope = await scopeIds(db, user);
  if (scope && !scope.length) return [];
  return db.all(
    `SELECT s.*, e.first_name || ' ' || e.last_name AS name FROM work_statuses s JOIN employees e ON e.id=s.employee_id ${scope ? 'WHERE s.employee_id IN (' + scope.map(() => '?').join(',') + ')' : ''} ORDER BY s.start_at DESC,s.id DESC LIMIT 100`,
    ...(scope || []),
  );
}

export async function startWorkStatus(db, user, body) {
  if (!user.employeeId || user.isOwner) fail(403, 'An employee profile is required');
  if (!['travel', 'on_site'].includes(body.kind)) fail(400, 'Choose Travelling or On-site duty');
  const day = await today(db);
  if (!isValidYmd(body.date) || body.date > day) fail(400, 'Choose today or an earlier date');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time || '')) fail(400, 'Choose a valid time');
  const absenceReasons = await validateAbsenceReasons(db, user, body);
  const settings = await getSettings(db);
  let startAt = zonedIso(body.date, body.time, settings.timezone);
  if (Date.parse(startAt) > Date.now() + 60000) fail(400, 'Start time cannot be in the future');
  if (Math.abs(Date.now() - Date.parse(startAt)) < 60000) startAt = new Date().toISOString();
  const reason = str(body.reason, { required: true, max: 2000, name: 'Reason' });
  const employee = await db.get(
    'SELECT join_date,exit_date,manager_id FROM employees WHERE id=?',
    user.employeeId,
  );
  if (body.date < employee.join_date || (employee.exit_date && body.date > employee.exit_date))
    fail(400, 'Choose a date within your employment');
  if (await currentWorkStatus(db, user.employeeId)) fail(409, 'Finish your current status first');
  const last = await db.get(
    'SELECT * FROM work_sessions WHERE employee_id=? ORDER BY start_at DESC,id DESC LIMIT 1',
    user.employeeId,
  );
  if (last && startAt < (last.end_at || last.start_at))
    fail(409, 'Choose a time after your last work activity');
  if (last && !last.end_at) {
    if (last.mode === 'on_duty') fail(409, 'Finish your existing duty first');
    await endSession(db, {
      employeeId: user.employeeId,
      date: last.date,
      now: startAt,
      userId: user.id,
    });
  }
  await invalidatePayrollInputs(db, body.date, body.date, { rejectLocked: true });
  const statusId = await db.insert('work_statuses', {
    employee_id: user.employeeId,
    kind: body.kind,
    start_at: startAt,
    reason,
    created_by: user.id,
  });
  if (body.kind === 'on_site') {
    const result = await startSession(db, {
      employeeId: user.employeeId,
      date: body.date,
      mode: 'on_duty',
      gapReason: 'Site / field visit',
      gapNote: reason,
      userId: user.id,
      now: startAt,
    });
    if (result.error) fail(409, result.error);
    await db.run(
      "UPDATE work_sessions SET mode='on_duty',activity_type='duty',work_status_id=? WHERE employee_id=? AND end_at IS NULL",
      statusId,
      user.employeeId,
    );
  } else {
    await db.run(
      "INSERT INTO attendance(employee_id,date,status,note,updated_by) VALUES (?,?,'P',?,?) ON CONFLICT(employee_id,date) DO UPDATE SET status=CASE WHEN attendance.auto_absent=1 THEN 'P' ELSE attendance.status END,auto_absent=0,note=excluded.note,updated_by=excluded.updated_by",
      user.employeeId,
      body.date,
      reason,
      user.id,
    );
  }
  const manager = employee.manager_id && (await userIdForEmployee(db, employee.manager_id));
  if (manager)
    await notifyUsers(
      db,
      [manager],
      user.name + (body.kind === 'travel' ? ': Travelling' : ': On-site duty'),
      '/attendance?tab=today',
    );
  await saveAbsenceReasons(db, user, absenceReasons);
  return db.get('SELECT * FROM work_statuses WHERE id=?', statusId);
}

export async function endWorkStatus(db, user, statusId) {
  const status = await db.get('SELECT * FROM work_statuses WHERE id=?', statusId);
  if (!status || status.employee_id !== user.employeeId)
    fail(403, 'You can only update your own status');
  if (status.end_at) fail(409, 'This status has already ended');
  const now = new Date().toISOString();
  if (status.kind === 'on_site') {
    const session = await db.get(
      'SELECT * FROM work_sessions WHERE work_status_id=? AND end_at IS NULL',
      status.id,
    );
    if (session)
      await endSession(db, {
        employeeId: user.employeeId,
        date: session.date,
        userId: user.id,
        now,
      });
  }
  await db.update('work_statuses', status.id, {
    end_at: now < status.start_at ? status.start_at : now,
  });
  return { ok: true };
}
