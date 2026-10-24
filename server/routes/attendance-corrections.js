import {
  today,
  date,
  str,
  oneOf,
  id,
  fail,
  notFound,
  scopeIds,
  isHR,
  audit,
  notifyUsers,
  userIdForEmployee,
  managerUserId,
  hrUserIds,
} from '../core.js';
import { invalidatePayrollInputs } from '../services/payroll-inputs.js';

export default function correctionRoutes(r, { db }) {
  const snapshot = async (eid, day) =>
    JSON.stringify(
      (await db.get(
        'SELECT status, check_in, check_out, note FROM attendance WHERE employee_id=? AND date=?',
        eid,
        day,
      )) || null,
    );
  const canDecide = async (user, eid) =>
    eid !== user.employeeId &&
    (isHR(user) || (user.role === 'manager' && (await scopeIds(db, user)).includes(eid)));
  r.get('/attendance/corrections', async (req, res) => {
    const scope = await scopeIds(db, req.user);
    const where =
      scope === null
        ? '1=1'
        : scope.length
          ? `c.employee_id IN (${scope.map(() => '?').join(',')})`
          : '0=1';
    const rows = await db.all(
      `SELECT c.*, e.first_name || ' ' || e.last_name AS name, e.code FROM attendance_corrections c JOIN employees e ON e.id=c.employee_id WHERE ${where} ${req.query.vertical ? 'AND e.vertical_id = ?' : ''} ORDER BY c.id DESC LIMIT 500`,
      ...(scope || []),
      ...(req.query.vertical ? [Number(req.query.vertical)] : []),
    );
    res.json({
      items: await Promise.all(
        rows.map(async (row) => ({
          ...row,
          canDecide: row.status === 'Pending' && (await canDecide(req.user, row.employee_id)),
        })),
      ),
    });
  });
  r.post('/attendance/corrections', async (req, res) => {
    const eid = req.user.employeeId;
    if (!eid) fail(400, 'Your login is not linked to an employee');
    const day = date(req.body.date, { required: true });
    const employee = await db.get('SELECT join_date, exit_date FROM employees WHERE id=?', eid);
    if (
      day > (await today(db)) ||
      day < employee.join_date ||
      (employee.exit_date && day > employee.exit_date)
    )
      fail(400, 'Choose a past or current date within your employment');
    if (
      await db.value(
        "SELECT id FROM attendance_corrections WHERE employee_id=? AND date=? AND status='Pending'",
        eid,
        day,
      )
    )
      fail(409, 'A correction for this date is already pending');
    const correction = await db.insert('attendance_corrections', {
      employee_id: eid,
      date: day,
      requested_status: oneOf(req.body.status, ['P', 'WFH', 'HD', 'A'], { required: true }),
      reason: str(req.body.reason, { required: true, max: 1000, name: 'Reason' }),
      before_snapshot: await snapshot(eid, day),
      created_at: new Date().toISOString(),
    });
    const manager = await managerUserId(db, eid);
    await notifyUsers(
      db,
      manager ? [manager] : await hrUserIds(db),
      `Attendance correction requested for ${day}`,
      '/attendance?tab=corrections',
    );
    await audit(db, req.user, 'attendance.correction.request', 'attendance_correction', correction);
    res.json({ id: correction });
  });
  r.post('/attendance/corrections/:id/decision', async (req, res) => {
    const row =
      (await db.get('SELECT * FROM attendance_corrections WHERE id=?', id(req.params.id))) ||
      notFound('Correction');
    if (!(await canDecide(req.user, row.employee_id)))
      fail(403, 'Only another authorised manager or HR can decide this correction');
    if (row.status !== 'Pending') fail(409, 'This correction is already decided');
    const action = oneOf(req.body.action, ['approve', 'reject'], { required: true });
    const note = str(req.body.note, { max: 500 });
    if (action === 'approve') {
      if (
        await db.value(
          'SELECT id FROM work_sessions WHERE employee_id=? AND date=? AND end_at IS NULL',
          row.employee_id,
          row.date,
        )
      )
        fail(409, 'End the running work clock before approving');
      if (row.before_snapshot !== (await snapshot(row.employee_id, row.date)))
        fail(
          409,
          'Attendance changed since submission. Reject this request and ask for a fresh correction',
        );
      await invalidatePayrollInputs(db, row.date, row.date, { rejectLocked: true });
      await db.run(
        `INSERT INTO attendance (employee_id,date,status,note,updated_by) VALUES (?,?,?,?,?) ON CONFLICT(employee_id,date) DO UPDATE SET status=excluded.status,note=excluded.note,updated_by=excluded.updated_by`,
        row.employee_id,
        row.date,
        row.requested_status,
        row.reason,
        req.user.id,
      );
    }
    await db.update('attendance_corrections', row.id, {
      status: action === 'approve' ? 'Approved' : 'Rejected',
      decision_note: note,
      decided_by: req.user.id,
      decided_at: new Date().toISOString(),
    });
    await audit(db, req.user, `attendance.correction.${action}`, 'attendance_correction', row.id, {
      before: row.before_snapshot,
      requestedStatus: row.requested_status,
    });
    await notifyUsers(
      db,
      [await userIdForEmployee(db, row.employee_id)],
      `Your attendance correction for ${row.date} was ${action === 'approve' ? 'approved' : 'rejected'}`,
      '/attendance?tab=corrections',
    );
    res.json({ ok: true });
  });
}
