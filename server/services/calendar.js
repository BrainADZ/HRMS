// Working-calendar context (weekly offs + company holidays) and the derived
// day-by-day attendance status that leave, attendance and payroll all share.
import { getSettings } from '../core.js';
import { isCompanyOwner } from '../lib/employee-policy.js';
import { dow, eachDay, monthStart, monthEnd, zonedIso, addDays } from '../lib/dates.js';
import { isWorkingDay } from '../lib/leave.js';

export async function calendarCtx(db, settings) {
  settings ??= await getSettings(db);
  const holidays = new Set(
    (await db.all("SELECT date FROM holidays WHERE type = 'Company'")).map((r) => r.date),
  );
  return { weeklyOffs: settings.weeklyOffs, holidays };
}

export async function holidayNames(db, from, to) {
  const map = new Map();
  for (const h of await db.all(
    'SELECT date, name, type FROM holidays WHERE date BETWEEN ? AND ?',
    from,
    to,
  )) {
    if (h.type === 'Company' || !map.has(h.date)) map.set(h.date, h);
  }
  return map;
}

// Approved leave for the given employees over [from, to], expanded per day.
// Returns Map(employeeId -> Map(date -> { code, name, paid, kind, half }))
export async function approvedLeaveDays(db, employeeIds, from, to, ctx) {
  const out = new Map();
  if (!employeeIds.length) return out;
  const rows = await db.all(
    `
    SELECT r.employee_id, r.from_date, r.to_date, r.half_day, t.code, t.name, t.paid, t.kind, t.calendar_days, t.color
    FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
    WHERE r.status = 'Approved' AND r.from_date <= ? AND r.to_date >= ?
      AND r.employee_id IN (${employeeIds.map(() => '?').join(',')})`,
    to,
    from,
    ...employeeIds,
  );
  for (const r of rows) {
    let m = out.get(r.employee_id);
    if (!m) out.set(r.employee_id, (m = new Map()));
    const start = r.from_date > from ? r.from_date : from;
    const end = r.to_date < to ? r.to_date : to;
    for (const d of eachDay(start, end)) {
      if (!r.calendar_days && !isWorkingDay(d, ctx)) continue;
      m.set(d, {
        code: r.code,
        name: r.name,
        paid: Boolean(r.paid),
        kind: r.kind,
        half: Boolean(r.half_day),
        color: r.color,
        calendar: Boolean(r.calendar_days),
      });
    }
  }
  return out;
}

// Status codes:
//   NA not employed · H holiday · WO weekly off · P present · WFH work from home
//   HD half day · A absent · U unmarked (past working day) · F upcoming working day
//   L  approved leave (leave.code holds CL/SL/EL/...)
export async function dayStatuses(db, employees, from, to, today, settings) {
  settings ??= await getSettings(db);
  const ctx = await calendarCtx(db, settings);
  const ids = employees.map((e) => e.id);
  const leaves = await approvedLeaveDays(db, ids, from, to, ctx);
  const records = new Map();
  if (ids.length) {
    for (const r of await db.all(
      `SELECT * FROM attendance WHERE date BETWEEN ? AND ? AND employee_id IN (${ids.map(() => '?').join(',')})`,
      from,
      to,
      ...ids,
    )) {
      let m = records.get(r.employee_id);
      if (!m) records.set(r.employee_id, (m = new Map()));
      m.set(r.date, r);
    }
  }
  const dutyDays = new Map();
  if (ids.length) {
    const sessions = await db.all(
      "SELECT employee_id,date,start_at,end_at FROM work_sessions WHERE mode='on_duty' AND activity_type='duty' AND date BETWEEN ? AND ? AND employee_id IN (" +
        ids.map(() => '?').join(',') +
        ')',
      from,
      to,
      ...ids,
    );
    for (const session of sessions) {
      const key = session.employee_id + ':' + session.date;
      const value = dutyDays.get(key) || { minutes: 0, running: false };
      value.minutes += Math.max(
        0,
        (Date.parse(session.end_at || new Date().toISOString()) - Date.parse(session.start_at)) /
          60000,
      );
      value.running ||= !session.end_at;
      dutyDays.set(key, value);
    }
  }
  const statusRows = ids.length
    ? await db.all(
        'SELECT * FROM work_statuses WHERE employee_id IN (' +
          ids.map(() => '?').join(',') +
          ') AND start_at < ? AND (end_at IS NULL OR end_at >= ?)',
        ...ids,
        zonedIso(addDays(to, 1), '00:00', settings.timezone),
        zonedIso(from, '00:00', settings.timezone),
      )
    : [];
  const unmarkedAbsent = settings.payroll.unmarkedAs === 'absent';
  const days = eachDay(from, to);
  const result = new Map();
  for (const e of employees) {
    const m = new Map();
    const lv = leaves.get(e.id);
    const rec = records.get(e.id);
    for (const d of days) {
      const employed = d >= e.join_date && (!e.exit_date || d <= e.exit_date);
      const r = rec?.get(d);
      const leave = lv?.get(d);
      let s;
      if (!employed) s = { code: 'NA', lop: 0 };
      else if (isCompanyOwner(e)) s = { code: 'NA', lop: 0, exempt: true };
      else if (leave && leave.calendar) s = { code: 'L', lop: leave.paid ? 0 : 1, leave };
      else if (ctx.holidays.has(d)) s = { code: 'H', lop: 0 };
      else if (ctx.weeklyOffs.includes(dow(d))) s = { code: 'WO', lop: 0 };
      else if (leave && leave.kind === 'wfh') s = { code: 'WFH', lop: 0, leave };
      else if (leave) {
        let lop = leave.paid ? 0 : leave.half ? 0.5 : 1;
        // Half-day leave: the other half follows the attendance mark.
        if (leave.half && r && r.status === 'A') lop += 0.5;
        s = { code: 'L', lop, leave };
      } else if (r) {
        s = {
          code: r.status,
          automaticAbsent: r.status === 'A' && Boolean(r.auto_absent),
          lop:
            r.status === 'A'
              ? r.auto_absent
                ? unmarkedAbsent
                  ? 1
                  : 0
                : 1
              : r.status === 'HD'
                ? 0.5
                : 0,
        };
      } else if (d < today) {
        s = { code: 'A', automaticAbsent: true, lop: unmarkedAbsent ? 1 : 0 };
      } else {
        s = { code: 'F', lop: 0 };
      }
      if (r && !s.exempt) {
        s.checkIn = r.check_in;
        s.checkOut = r.check_out;
        s.note = r.note;
        s.mark = r.status;
      }
      const duty = dutyDays.get(e.id + ':' + d);
      if (duty && employed && !s.exempt) {
        if (s.automaticAbsent) {
          s.code = 'P';
          s.lop = 0;
          s.automaticAbsent = false;
        }
        s.onDuty = true;
        s.dutyMinutes = Math.round(duty.minutes);
        s.dutyRunning = duty.running;
      }
      const startOfDay = zonedIso(d, '00:00', settings.timezone);
      const endOfDay = zonedIso(addDays(d, 1), '00:00', settings.timezone);
      const statuses = statusRows.filter(
        (row) =>
          row.employee_id === e.id &&
          row.start_at < endOfDay &&
          (!row.end_at || row.end_at > startOfDay),
      );
      if (statuses.length && employed && !s.exempt) {
        if (['F', 'U'].includes(s.code) || s.automaticAbsent) {
          s.code = 'P';
          s.lop = 0;
          s.automaticAbsent = false;
        }
        const journeys = statuses.filter((row) => row.kind === 'travel');
        s.travelled = journeys.length > 0;
        s.travelRunning = journeys.some((row) => !row.end_at);
        const site = statuses.filter((row) => row.kind === 'on_site');
        if (site.length) {
          s.onDuty = true;
          s.dutyRunning = site.some((row) => !row.end_at);
        }
        s.statusReason = statuses.at(-1).reason;
      }
      m.set(d, s);
    }
    result.set(e.id, m);
  }
  return result;
}

export function monthRange(month) {
  return [monthStart(month), monthEnd(month)];
}
