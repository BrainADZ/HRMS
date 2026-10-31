// Leave balances backed by the database.
import { calendarCtx } from './calendar.js';
import { entitlement, leaveDaysByPolicyYear, leaveYear, leaveYearBounds } from '../lib/leave.js';

export async function leaveTypesFor(db, employee) {
  return (await db.all('SELECT * FROM leave_types WHERE active = 1 ORDER BY sort, id')).filter(
    (t) => !t.gender || !employee?.gender || t.gender === employee.gender,
  );
}

function chargedDays(req, year, ctx) {
  if (leaveYear(req.from_date) === year && leaveYear(req.to_date) === year) return req.days;
  return (
    leaveDaysByPolicyYear(
      {
        from: req.from_date,
        to: req.to_date,
        halfDay: Boolean(req.half_day),
        calendarDays: Boolean(req.calendar_days),
      },
      ctx,
    ).get(year) || 0
  );
}

async function usage(db, employeeId, year, ctx) {
  const rows = await db.all(
    `
    SELECT r.*, t.calendar_days, t.code FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
    WHERE r.employee_id = ? AND r.status IN ('Approved','Pending') AND r.from_date <= ? AND r.to_date >= ?`,
    employeeId,
    leaveYearBounds(year).end,
    leaveYearBounds(year).start,
  );
  const sharedId = await db.value("SELECT id FROM leave_types WHERE code = 'CL'");
  const used = new Map();
  const pending = new Map();
  for (const r of rows) {
    const m = r.status === 'Approved' ? used : pending;
    const typeId = r.code === 'SL' && sharedId ? sharedId : r.leave_type_id;
    m.set(typeId, (m.get(typeId) || 0) + chargedDays(r, year, ctx));
  }
  return { used, pending };
}

// Per-type balance for one employee. Carry-forward looks back one year at a
// time (bounded) so EL left over last year is credited up to the type's cap.
export async function balances(db, employee, year, asOf, ctx, depth = 0) {
  ctx ??= await calendarCtx(db);
  const types = await leaveTypesFor(db, employee);
  const { used, pending } = await usage(db, employee.id, year, ctx);
  const joinYear = leaveYear(employee.join_date);
  let prev = null;
  if (depth < 4 && year > joinYear && types.some((t) => t.carry_forward_max > 0)) {
    prev = new Map(
      (await balances(db, employee, year - 1, leaveYearBounds(year - 1).end, ctx, depth + 1)).map(
        (b) => [b.typeId, b],
      ),
    );
  }
  return types.map((t) => {
    const ent = entitlement(t, employee.join_date, year, asOf);
    let carried = 0;
    if (prev && t.carry_forward_max > 0) {
      const p = prev.get(t.id);
      if (p && p.available != null)
        carried = Math.min(t.carry_forward_max, Math.max(0, p.available + p.pending));
    }
    const u = used.get(t.id) || 0;
    const pe = pending.get(t.id) || 0;
    return {
      typeId: t.id,
      code: t.code,
      name: t.name,
      color: t.color,
      icon: t.icon,
      kind: t.kind,
      paid: Boolean(t.paid),
      quota: t.annual_quota,
      entitled: ent,
      carried,
      used: u,
      pending: pe,
      available: ent == null ? null : ent + carried - u - pe,
    };
  });
}
