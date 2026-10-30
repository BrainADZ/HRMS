import { fail, getSettings, notifyUsers, today, userIdForEmployee } from '../core.js';
import { startSession, workDate } from './workday.js';
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
    `SELECT t.id, t.project, t.city, t.site, t.from_date, t.to_date, m.id AS member_id
     FROM travel_trips t JOIN travel_members m ON m.trip_id=t.id
     WHERE m.employee_id=? AND t.status='Approved' AND t.from_date<=? AND t.to_date>=?
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
  if (last?.mode !== 'on_duty' || last.trip_status !== 'Approved') return fallback;
  if (
    !last.end_at ||
    (['break', 'signout'].includes(last.ended_by) &&
      Date.now() - Date.parse(last.end_at) < 18 * 3600000)
  )
    return last.date;
  return fallback;
}

export async function startTravelDuty(db, user, body) {
  if (!user.employeeId || user.isOwner)
    fail(403, 'An employee profile is required for on-duty check-in');
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
  const activity = body.activity_type || (resuming ? last.activity_type : 'duty');
  if (!['duty', 'travel'].includes(activity)) fail(400, 'Choose duty or travel time');
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
