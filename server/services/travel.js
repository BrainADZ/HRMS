import { validateAbsenceReasons, saveAbsenceReasons } from './missed-attendance.js';
import { fail, getSettings, notifyUsers, today, userIdForEmployee } from '../core.js';
import { startSession, endSession, workDate } from './workday.js';
import { readCoords } from './geofence.js';

export const TRAVEL_STATUSES = [
  'Travelling',
  'Site reached',
  'Setup ongoing',
  'Event running',
  'Work completed',
];

export async function approvedTravel(db, employeeId, day) {
  if (!employeeId) return [];
  return db.all(
    `SELECT t.id, t.project, t.city, t.site, t.from_date, t.to_date, m.id AS member_id,
       (SELECT u.status FROM travel_updates u WHERE u.member_id=m.id ORDER BY u.created_at DESC,u.id DESC LIMIT 1) AS current_status
     FROM travel_trips t JOIN travel_members m ON m.trip_id=t.id
     WHERE m.employee_id=? AND t.status='Approved' AND ((t.from_date<=? AND t.to_date>=?) OR (SELECT u.status FROM travel_updates u WHERE u.member_id=m.id ORDER BY u.created_at DESC,u.id DESC LIMIT 1) IN ('Travelling','Travel started'))
     ORDER BY t.from_date, t.id`,
    employeeId,
    day,
    day,
  );
}

// A site shift can cross midnight. Only an explicit pause resumes the same shift.
export async function travelWorkDate(db, employeeId, fallback) {
  if (!employeeId) return fallback;
  const last = await db.get(
    `SELECT w.*, t.status AS trip_status FROM work_sessions w
     LEFT JOIN travel_members m ON m.id=w.travel_member_id
     LEFT JOIN travel_trips t ON t.id=m.trip_id
     WHERE w.employee_id=? ORDER BY w.start_at DESC, w.id DESC LIMIT 1`,
    employeeId,
  );
  if (last?.mode !== 'on_duty' || (!last.work_status_id && last.trip_status !== 'Approved'))
    return fallback;
  if (
    !last.end_at ||
    (['break', 'signout'].includes(last.ended_by) &&
      Date.now() - Date.parse(last.end_at) < 18 * 3600000)
  )
    return last.date;
  return fallback;
}

// Journey status persists on the server without creating attendance or a running clock.
export async function setJourneyStatus(db, user, tripId, action, body = {}) {
  if (!user.employeeId || user.isOwner) fail(403, 'An employee profile is required');
  if (!Number.isSafeInteger(Number(tripId)) || Number(tripId) <= 0)
    fail(400, 'Choose an approved trip');
  if (!['travel', 'reached'].includes(action)) fail(400, 'Choose travel or reached');
  const absenceReasons = action === 'travel' ? await validateAbsenceReasons(db, user, body) : [];
  const day = await today(db);
  const member = await db.get(
    'SELECT m.*, t.status, t.from_date, t.to_date, t.approver_id FROM travel_members m JOIN travel_trips t ON t.id=m.trip_id WHERE t.id=? AND m.employee_id=?',
    tripId,
    user.employeeId,
  );
  if (!member || member.status !== 'Approved') fail(403, 'Choose an approved trip');
  const latest = await db.get(
    'SELECT status FROM travel_updates WHERE member_id=? ORDER BY created_at DESC,id DESC LIMIT 1',
    member.id,
  );
  const travelling = ['Travelling', 'Travel started'].includes(latest?.status);
  if (action === 'travel' && travelling) fail(409, 'You are already travelling');
  if (action === 'reached' && !travelling) fail(409, 'Start travelling before marking reached');
  if (action === 'travel' && (day < member.from_date || day > member.to_date))
    fail(400, 'Travel can start during the approved trip dates');
  const active = await db.get(
    'SELECT * FROM work_sessions WHERE employee_id=? AND end_at IS NULL',
    user.employeeId,
  );
  if (active) {
    if (
      action === 'reached' &&
      (active.travel_member_id !== member.id || active.activity_type !== 'travel')
    )
      fail(409, 'Finish your current duty first');
    if (action === 'travel' && active.mode === 'on_duty')
      fail(409, 'Share a Work completed update before travelling');
    await endSession(db, { employeeId: user.employeeId, date: active.date, userId: user.id });
  }
  const status = action === 'travel' ? 'Travelling' : 'Site reached';
  await db.insert('travel_updates', {
    member_id: member.id,
    user_id: user.id,
    date: day,
    status,
    note: '',
  });
  await notifyUsers(db, [member.approver_id], user.name + ': ' + status, '/travel/' + tripId);
  await saveAbsenceReasons(db, user, absenceReasons);
  return { ok: true, tripId, status };
}

export async function startTravelDuty(db, user, body) {
  if (!user.employeeId || user.isOwner)
    fail(403, 'An employee profile is required for on-duty check-in');
  if (body.activity_type && !['duty', 'travel'].includes(body.activity_type))
    fail(400, 'Choose duty or travel');
  if (body.activity_type === 'travel')
    return setJourneyStatus(db, user, Number(body.trip_id), 'travel', body);
  const absenceReasons = await validateAbsenceReasons(db, user, body);
  const coords = readCoords(body.location);
  if (!coords) return { needsLocation: true };
  const day = await today(db);
  const settings = await getSettings(db);
  const date = await travelWorkDate(db, user.employeeId, workDate(day, settings));
  const last = await db.get(
    'SELECT * FROM work_sessions WHERE employee_id=? ORDER BY start_at DESC, id DESC LIMIT 1',
    user.employeeId,
  );
  if (
    await db.value(
      'SELECT id FROM work_sessions WHERE employee_id=? AND end_at IS NULL',
      user.employeeId,
    )
  )
    fail(409, 'Check out of your current work session before starting travel duty');
  const resuming =
    last?.mode === 'on_duty' && ['break', 'signout'].includes(last.ended_by) && last.date === date;
  if (
    last &&
    last.mode !== 'on_duty' &&
    ['break', 'signout'].includes(last.ended_by) &&
    last.date === date
  )
    fail(409, 'Resume and properly check out of your office / WFH session before starting on duty');
  if (!resuming && (!Number.isSafeInteger(Number(body.trip_id)) || Number(body.trip_id) <= 0))
    fail(400, 'Choose an approved travel trip');
  const member = resuming
    ? await db.get(
        `SELECT m.*, t.status, t.id AS trip_id FROM travel_members m JOIN travel_trips t ON t.id=m.trip_id WHERE m.id=? AND m.employee_id=?`,
        last.travel_member_id,
        user.employeeId,
      )
    : await db.get(
        `SELECT m.*, t.status FROM travel_members m JOIN travel_trips t ON t.id=m.trip_id
        WHERE t.id=? AND m.employee_id=? AND t.status='Approved' AND t.from_date<=? AND t.to_date>=?`,
        Number(body.trip_id),
        user.employeeId,
        day,
        day,
      );
  if (!member || member.status !== 'Approved') fail(403, 'Choose an approved trip covering today');
  if (resuming && body.trip_id && Number(body.trip_id) !== member.trip_id)
    fail(409, 'Finish your paused trip duty before starting another trip');
  const latest = await db.get(
    'SELECT status FROM travel_updates WHERE member_id=? ORDER BY created_at DESC,id DESC LIMIT 1',
    member.id,
  );
  if (['Travelling', 'Travel started'].includes(latest?.status))
    fail(409, 'Mark Reached before starting duty');
  const activity = 'duty';
  const result = await startSession(db, {
    employeeId: user.employeeId,
    date,
    mode: 'on_duty',
    gapReason: body.gap_reason,
    gapNote: body.gap_note,
    userId: user.id,
  });
  if (result.error) fail(result.needsReason ? 400 : 409, result.error);
  const session = await db.get(
    'SELECT id FROM work_sessions WHERE employee_id=? AND end_at IS NULL',
    user.employeeId,
  );
  await db.update('work_sessions', session.id, {
    travel_member_id: member.id,
    activity_type: activity,
  });
  await db.insert('travel_updates', {
    member_id: member.id,
    user_id: user.id,
    date: day,
    status: activity === 'travel' ? 'Travel started' : 'Duty started',
    note: '',
    latitude: coords.lat,
    longitude: coords.lng,
    accuracy: coords.accuracy,
  });
  await saveAbsenceReasons(db, user, absenceReasons);
  return { ...result, tripId: member.trip_id };
}

export async function travelReminders(db, day = null) {
  day ??= await today(db);
  const pending = await db.all(
    `SELECT m.id, m.employee_id, t.id AS trip_id, t.project, t.approver_id
    FROM travel_members m JOIN travel_trips t ON t.id=m.trip_id
    WHERE t.status='Approved' AND t.from_date<=? AND t.to_date>=?
    AND NOT EXISTS (SELECT 1 FROM travel_updates u WHERE u.member_id=m.id AND u.date=? AND u.status IN ('Travelling','Site reached','Setup ongoing','Event running','Work completed'))
    AND NOT EXISTS (SELECT 1 FROM travel_reminders r WHERE r.member_id=m.id AND r.date=?)`,
    day,
    day,
    day,
    day,
  );
  for (const member of pending) {
    const inserted = await db.run(
      'INSERT INTO travel_reminders (member_id,date) VALUES (?,?) ON CONFLICT DO NOTHING',
      member.id,
      day,
    );
    if (!inserted.changes) continue;
    await notifyUsers(
      db,
      [await userIdForEmployee(db, member.employee_id), member.approver_id],
      `Daily travel update pending: ${member.project}`,
      `/travel/${member.trip_id}`,
    );
  }
}
