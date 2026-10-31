import {
  fail,
  getSettings,
  fullName,
  notifyUsers,
  userIdForEmployee,
  str,
  today,
} from '../core.js';
import { addDays, nowTimeIn } from '../lib/dates.js';
import { dayStatuses } from './calendar.js';
import { workflow } from '../database/workflows.js';
import { invalidatePayrollInputs } from './payroll-inputs.js';

// Complete past working days only. Calendar/leave/work-status rules stay shared
// with the register; never replace an existing attendance mark or a real session.
export async function reconcileMissedAttendance(db, options = {}) {
  return workflow(db, async () => {
    const settings = options.settings || (await getSettings(db));
    const currentDay = options.today || (await today(db));
    const shiftDay =
      settings.workdayEnd < settings.workdayStart &&
      nowTimeIn(settings.timezone) <= settings.workdayEnd
        ? addDays(currentDay, -1)
        : currentDay;
    const through = options.through || addDays(shiftDay, -1);
    const from = options.from || addDays(currentDay, -31);
    if (from > through || options.employeeIds?.length === 0) return;
    const ids = options.employeeIds;
    const employees = await db.all(
      'SELECT * FROM employees WHERE join_date<=? AND (exit_date IS NULL OR exit_date>=?)' +
        (ids ? ' AND id IN (' + ids.map(() => '?').join(',') + ')' : ''),
      through,
      from,
      ...(ids || []),
    );
    if (!employees.length) return;
    const states = await dayStatuses(db, employees, from, through, currentDay, settings);
    const sessions = new Set(
      (
        await db.all(
          'SELECT DISTINCT employee_id,date FROM work_sessions WHERE date BETWEEN ? AND ?',
          from,
          through,
        )
      ).map((s) => s.employee_id + ':' + s.date),
    );
    const lockedMonths = new Set(
      (
        await db.all(
          "SELECT month FROM payroll_runs WHERE month BETWEEN ? AND ? AND status NOT IN ('In Review','Finance Reviewed')",
          from.slice(0, 7),
          through.slice(0, 7),
        )
      ).map((r) => r.month),
    );
    for (const employee of employees)
      for (const [day, state] of states.get(employee.id)) {
        if (
          !state.automaticAbsent ||
          state.onDuty ||
          state.travelled ||
          sessions.has(employee.id + ':' + day)
        )
          continue;
        if (!lockedMonths.has(day.slice(0, 7))) {
          const result = await db.run(
            "INSERT INTO attendance(employee_id,date,status,note,auto_absent) VALUES (?,?,'A','Automatically marked absent: no attendance recorded',1) ON CONFLICT(employee_id,date) DO NOTHING",
            employee.id,
            day,
          );
          if (result.changes) await invalidatePayrollInputs(db, day, day);
        }
        const inserted = await db.run(
          "INSERT INTO hour_shortfalls(employee_id,date,worked_minutes,required_minutes,kind) VALUES (?,?,0,?,'absence') ON CONFLICT(employee_id,date) DO NOTHING",
          employee.id,
          day,
          Math.round(Number(settings.workHours || 8) * 60),
        );
        if (inserted.changes && options.notify !== false)
          await notifyUsers(
            db,
            [await userIdForEmployee(db, employee.id)],
            'No attendance recorded on ' + day + '. Add a reason before your next check-in.',
            '/attendance?tab=short',
          );
      }
  });
}

export async function pendingAbsences(db, employeeId) {
  if (!employeeId) return [];
  const rows = await db.all(
    "SELECT id,date FROM hour_shortfalls WHERE employee_id=? AND kind='absence' AND status='Awaiting explanation' ORDER BY date",
    employeeId,
  );
  if (!rows.length) return [];
  const employee = await db.get('SELECT * FROM employees WHERE id=?', employeeId);
  const days = (
    await dayStatuses(db, [employee], rows[0].date, rows.at(-1).date, await today(db))
  ).get(employeeId);
  return rows.filter((row) => {
    const state = days.get(row.date);
    return state.code === 'A' && state.automaticAbsent && !state.onDuty && !state.travelled;
  });
}

export async function validateAbsenceReasons(db, user, body) {
  if (!user.employeeId || user.isOwner) return [];
  await reconcileMissedAttendance(db, { employeeIds: [user.employeeId] });
  const pending = await pendingAbsences(db, user.employeeId);
  const submitted = Array.isArray(body.absenceReasons) ? body.absenceReasons : [];
  return pending.map((row) => {
    const value = submitted.find((entry) => Number(entry?.id) === row.id);
    if (typeof value?.reason !== 'string' || !value.reason.trim())
      fail(409, 'Add a reason for missing attendance on ' + row.date + ' before checking in');
    return {
      ...row,
      reason: str(value.reason, { required: true, max: 1000, name: 'Absence reason' }),
    };
  });
}

export async function saveAbsenceReasons(db, user, reasons) {
  if (!reasons.length) return;
  for (const row of reasons)
    await db.run(
      "UPDATE hour_shortfalls SET reason=?,status='Pending approval',explained_at=? WHERE id=? AND employee_id=? AND status='Awaiting explanation'",
      row.reason,
      new Date().toISOString(),
      row.id,
      user.employeeId,
    );
  const employee = await db.get(
    'SELECT first_name,last_name,manager_id FROM employees WHERE id=?',
    user.employeeId,
  );
  const manager = employee.manager_id && (await userIdForEmployee(db, employee.manager_id));
  const recipients = manager
    ? [manager]
    : (await db.all("SELECT id FROM users WHERE role='admin' AND active=1")).map((row) => row.id);
  await notifyUsers(
    db,
    recipients,
    fullName(employee) + ' submitted missing-attendance reasons for review',
    '/attendance?tab=short',
  );
}
