import {
  currentWorkStatus,
  workStatusHistory,
  startWorkStatus,
  endWorkStatus,
} from '../services/work-status.js';
import path from 'node:path';
import { endSession } from '../services/workday.js';
import {
  fail,
  id,
  str,
  today,
  scopeIds,
  isHR,
  fullName,
  notifyUsers,
  userIdForEmployee,
  getSettings,
  audit,
} from '../core.js';
import { isValidYmd, diffDays, nowTimeIn, addDays } from '../lib/dates.js';
import { isCompanyOwner } from '../lib/employee-policy.js';
import {
  TRAVEL_STATUSES,
  approvedTravel,
  startTravelDuty,
  setJourneyStatus,
  travelReminders,
} from '../services/travel.js';

const minutes = (rows, type) =>
  rows
    .filter((s) => s.activity_type === type)
    .reduce(
      (sum, s) =>
        sum +
        Math.max(
          0,
          (Date.parse(s.end_at || new Date().toISOString()) - Date.parse(s.start_at)) / 60000,
        ),
      0,
    );

export default function travelRoutes(r, { db, upload, uploads }) {
  r.get('/work-status', async (req, res) =>
    res.json({
      current: await currentWorkStatus(db, req.user.employeeId),
      items: await workStatusHistory(db, req.user),
    }),
  );
  r.post('/work-status', async (req, res) => {
    const status = await startWorkStatus(db, req.user, req.body);
    await audit(db, req.user, 'work_status.start', 'employee', req.user.employeeId, {
      kind: status.kind,
      date: req.body.date,
      reason: status.reason,
    });
    res.json(status);
  });
  r.post('/work-status/:statusId/end', async (req, res) => {
    const result = await endWorkStatus(db, req.user, id(req.params.statusId));
    await audit(db, req.user, 'work_status.end', 'employee', req.user.employeeId);
    res.json(result);
  });
  const tripRow = async (req, lock = false) => {
    const trip = await db.get(
      `SELECT * FROM travel_trips WHERE id=?${lock ? ' FOR UPDATE' : ''}`,
      id(req.params.id),
    );
    if (!trip) fail(404, 'Trip not found');
    const members = await db.all(
      `SELECT m.*, e.first_name, e.last_name, e.code, e.designation FROM travel_members m JOIN employees e ON e.id=m.employee_id WHERE m.trip_id=?`,
      trip.id,
    );
    const scope = await scopeIds(db, req.user);
    if (
      trip.requested_by !== req.user.id &&
      trip.approver_id !== req.user.id &&
      scope !== null &&
      !members.some((m) => scope.includes(m.employee_id))
    )
      fail(403, 'You do not have access to this trip');
    return { trip, members };
  };
  const shape = async (trip, members, user) => {
    const day = await today(db);
    const scope = await scopeIds(db, user);
    const visible = members.filter(
      (m) => scope === null || trip.approver_id === user.id || scope.includes(m.employee_id),
    );
    const updates = await db.all(
      `SELECT u.*, m.employee_id, e.first_name, e.last_name FROM travel_updates u JOIN travel_members m ON m.id=u.member_id JOIN employees e ON e.id=m.employee_id WHERE m.trip_id=? ORDER BY u.created_at DESC, u.id DESC`,
      trip.id,
    );
    const sessions = await db.all(
      `SELECT w.* FROM work_sessions w JOIN travel_members m ON m.id=w.travel_member_id WHERE m.trip_id=? ORDER BY w.start_at DESC`,
      trip.id,
    );
    const visibleIds = new Set(visible.map((m) => m.employee_id));
    const visibleMemberIds = new Set(visible.map((m) => m.id));
    const own = members.find((m) => m.employee_id === user.employeeId);
    const ownLast = own && sessions.find((s) => s.travel_member_id === own.id);
    const finishingOvernight =
      ownLast &&
      day <= addDays(trip.to_date, 1) &&
      (!ownLast.end_at || Date.now() - Date.parse(ownLast.end_at) < 18 * 3600000);
    const canDecide = trip.approver_id === user.id && trip.requested_by !== user.id && !own;
    return {
      ...trip,
      approverName: (
        await db.get(
          `SELECT COALESCE(e.first_name || ' ' || e.last_name,u.display_name,u.email) AS name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=?`,
          trip.approver_id,
        )
      )?.name,
      canApprove: canDecide && trip.status === 'Pending',
      canClose: canDecide && trip.status === 'Submitted',
      canSubmit: trip.status === 'Approved' && (trip.requested_by === user.id || Boolean(own)),
      isMember: Boolean(own),
      canUpdate:
        Boolean(own) &&
        trip.status === 'Approved' &&
        ((trip.from_date <= day && trip.to_date >= day) || Boolean(finishingOvernight)),
      canStart:
        Boolean(own) &&
        !user.isOwner &&
        trip.status === 'Approved' &&
        trip.from_date <= day &&
        trip.to_date >= day,
      members: visible.map((m) => {
        const memberUpdates = updates.filter((u) => u.member_id === m.id);
        const memberSessions = sessions.filter((s) => s.travel_member_id === m.id);
        const latest = memberUpdates[0];
        return {
          ...m,
          name: fullName(m),
          latestUpdate: latest || null,
          updatePending:
            trip.status === 'Approved' &&
            trip.from_date <= day &&
            trip.to_date >= day &&
            !memberUpdates.some((u) => u.date === day && TRAVEL_STATUSES.includes(u.status)),
          dutyMinutes: Math.round(minutes(memberSessions, 'duty')),
          travelMinutes: Math.round(minutes(memberSessions, 'travel')),
          running: memberSessions.some((s) => !s.end_at),
        };
      }),
      updates: updates
        .filter((u) => visibleIds.has(u.employee_id))
        .map((u) => ({ ...u, name: fullName(u), photo: Boolean(u.photo) })),
      sessions: sessions.filter((s) => visibleMemberIds.has(s.travel_member_id)),
    };
  };

  r.get('/travel/options', async (req, res) => {
    const scope = await scopeIds(db, req.user);
    const employees = await db.all(
      "SELECT id, first_name, last_name, code, designation, manager_id FROM employees WHERE status!='Exited' ORDER BY first_name,last_name",
    );
    const approvers = await db.all(
      `SELECT u.id, u.employee_id, u.role, COALESCE(e.first_name || ' ' || e.last_name,u.display_name,u.email) AS name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.active=1 AND u.role IN ('admin','hr','manager') AND u.id!=? ORDER BY name`,
      req.user.id,
    );
    res.json({
      employees: employees.filter(
        (e) => !isCompanyOwner(e) && (scope === null || scope.includes(e.id)),
      ),
      approvers,
      statuses: TRAVEL_STATUSES,
      activeTrips: await approvedTravel(db, req.user.employeeId, await today(db)),
    });
  });

  r.get('/travel', async (req, res) => {
    const day = await today(db);
    const settings = await getSettings(db);
    if (nowTimeIn(settings.timezone) >= '17:00') await travelReminders(db, day);
    const scope = await scopeIds(db, req.user);
    const trips = await db.all('SELECT * FROM travel_trips ORDER BY created_at DESC,id DESC');
    const allMembers = await db.all('SELECT * FROM travel_members');
    const visibleTrips = trips.filter(
      (t) =>
        scope === null ||
        t.approver_id === req.user.id ||
        t.requested_by === req.user.id ||
        allMembers.some((m) => m.trip_id === t.id && scope.includes(m.employee_id)),
    );
    const items = [];
    for (const trip of visibleTrips) {
      const members = await db.all(
        `SELECT m.*, e.first_name, e.last_name, e.code, e.designation FROM travel_members m JOIN employees e ON e.id=m.employee_id WHERE m.trip_id=?`,
        trip.id,
      );
      items.push(await shape(trip, members, req.user));
    }
    res.json({
      items,
      today: day,
      canRequest: Boolean(req.user.employeeId || isHR(req.user)) && !req.user.isOwner,
    });
  });

  r.post('/travel', async (req, res) => {
    if (req.user.isOwner)
      fail(403, 'The owner reviews trips rather than requesting on-duty travel');
    const from = req.body.from_date,
      to = req.body.to_date;
    if (
      !isValidYmd(from) ||
      !isValidYmd(to) ||
      from > to ||
      diffDays(from, to) > 180 ||
      to < (await today(db))
    )
      fail(400, 'Choose valid trip dates within 180 days');
    const requestedIds = req.body.employee_ids;
    if (!Array.isArray(requestedIds) || !requestedIds.length || requestedIds.length > 100)
      fail(400, 'Select 1 to 100 team members');
    const ids = [...new Set(requestedIds.map(id))].sort((a, b) => a - b);
    const approverId = id(req.body.approver_id);
    const approver = await db.get(
      "SELECT id, role, employee_id FROM users WHERE id=? AND active=1 AND role IN ('admin','hr','manager')",
      approverId,
    );
    if (!approver || approver.id === req.user.id || ids.includes(approver.employee_id))
      fail(400, 'Choose a manager outside the travelling team to approve');
    const scope = await scopeIds(db, req.user);
    const approvalScope = await scopeIds(db, {
      role: approver.role,
      employeeId: approver.employee_id,
    });
    for (const employeeId of ids) {
      const e = await db.get(
        "SELECT * FROM employees WHERE id=? AND status!='Exited' FOR UPDATE",
        employeeId,
      );
      if (!e || isCompanyOwner(e) || (scope !== null && !scope.includes(employeeId)))
        fail(403, 'Choose employees within your team');
      if (approvalScope !== null && !approvalScope.includes(employeeId))
        fail(400, 'The selected approver must manage every travelling employee');
      if (e.join_date > from) fail(400, 'Trip cannot start before the employee joins');
      const overlap = await db.value(
        `SELECT t.id FROM travel_trips t JOIN travel_members m ON m.trip_id=t.id WHERE m.employee_id=? AND t.status IN ('Pending','Approved','Submitted') AND t.from_date<=? AND t.to_date>=?`,
        employeeId,
        to,
        from,
      );
      if (overlap) fail(409, `${fullName(e)} already has a trip during these dates`);
    }
    const tripId = await db.insert('travel_trips', {
      project: str(req.body.project, { required: true, max: 160 }),
      city: str(req.body.city, { required: true, max: 120 }),
      site: str(req.body.site, { required: true, max: 200 }),
      purpose: str(req.body.purpose, { required: true, max: 2000 }),
      from_date: from,
      to_date: to,
      requested_by: req.user.id,
      approver_id: approverId,
    });
    for (const employeeId of ids)
      await db.insert('travel_members', { trip_id: tripId, employee_id: employeeId });
    await notifyUsers(
      db,
      [approverId],
      `${req.user.name} requested a business travel trip`,
      `/travel/${tripId}`,
    );
    await audit(db, req.user, 'travel.request', 'travel', tripId);
    res.json({ id: tripId });
  });

  r.get('/travel/:id', async (req, res) => {
    const { trip, members } = await tripRow(req);
    res.json(await shape(trip, members, req.user));
  });
  r.post('/travel/:id/decision', async (req, res) => {
    const { trip, members } = await tripRow(req, true);
    if (
      trip.approver_id !== req.user.id ||
      trip.requested_by === req.user.id ||
      members.some((m) => m.employee_id === req.user.employeeId)
    )
      fail(403, 'Only the assigned manager can approve this trip');
    if (trip.status !== 'Pending') fail(409, 'Trip has already been reviewed');
    if (!['approve', 'reject'].includes(req.body.action)) fail(400, 'Choose approve or reject');
    if (req.body.action === 'approve' && trip.to_date < (await today(db)))
      fail(400, 'Trip dates have passed; request a new trip');
    const status = req.body.action === 'approve' ? 'Approved' : 'Rejected';
    await db.update('travel_trips', trip.id, {
      status,
      decision_note: str(req.body.note, { max: 1000 }),
      decided_at: new Date().toISOString(),
    });
    const users = await Promise.all(members.map((m) => userIdForEmployee(db, m.employee_id)));
    await notifyUsers(
      db,
      [trip.requested_by, ...users],
      `${trip.project}: trip ${status.toLowerCase()}`,
      `/travel/${trip.id}`,
    );
    await audit(db, req.user, 'travel.decision', 'travel', trip.id, { status });
    res.json({ ok: true });
  });

  r.post('/travel/:id/journey', async (req, res) => {
    await tripRow(req, true);
    res.json(await setJourneyStatus(db, req.user, id(req.params.id), req.body.action, req.body));
  });

  r.post('/travel/:id/start', async (req, res) => {
    await tripRow(req, true);
    const result = await startTravelDuty(db, req.user, { ...req.body, trip_id: id(req.params.id) });
    if (result.needsLocation)
      return res
        .status(403)
        .json({ code: 'location_required', error: 'Share your location for on-duty check-in' });
    res.json(result);
  });

  r.post(
    '/travel/:id/updates',
    upload('travel-photos', { maxMb: 8, exts: ['.jpg', '.jpeg', '.png', '.webp'] }).single('photo'),
    async (req, res) => {
      const { trip, members } = await tripRow(req, true);
      const member = members.find((m) => m.employee_id === req.user.employeeId);
      if (!member || trip.status !== 'Approved')
        fail(403, 'Only travelling employees can update an approved trip');
      const day = await today(db);
      const lastDuty = await db.get(
        'SELECT * FROM work_sessions WHERE travel_member_id=? ORDER BY start_at DESC,id DESC LIMIT 1',
        member.id,
      );
      const overnight =
        lastDuty &&
        day <= addDays(trip.to_date, 1) &&
        (!lastDuty.end_at || Date.now() - Date.parse(lastDuty.end_at) < 18 * 3600000);
      if ((day < trip.from_date || day > trip.to_date) && !overnight)
        fail(400, 'Updates are available during the approved trip dates');
      if (!TRAVEL_STATUSES.includes(req.body.status)) fail(400, 'Choose a valid travel update');
      if (['Travelling', 'Site reached'].includes(req.body.status))
        fail(400, 'Use Start travelling or Reached to change journey status');
      const latest = await db.get(
        'SELECT status FROM travel_updates WHERE member_id=? ORDER BY created_at DESC,id DESC LIMIT 1',
        member.id,
      );
      if (['Travelling', 'Travel started'].includes(latest?.status))
        fail(409, 'Mark Reached before sharing a duty update');
      if (req.body.status === 'Work completed') {
        const active = await db.get(
          'SELECT * FROM work_sessions WHERE employee_id=? AND end_at IS NULL',
          req.user.employeeId,
        );
        if (active && active.travel_member_id !== member.id)
          fail(409, 'This work session belongs to another activity');
        if (active)
          await endSession(db, {
            employeeId: req.user.employeeId,
            date: active.date,
            userId: req.user.id,
          });
      }
      await db.insert('travel_updates', {
        member_id: member.id,
        user_id: req.user.id,
        date: day,
        status: req.body.status,
        note: str(req.body.note, { max: 2000 }) || '',
        photo: req.file?.filename || null,
      });
      await notifyUsers(
        db,
        [trip.approver_id],
        `${req.user.name}: ${req.body.status} — ${trip.project}`,
        `/travel/${trip.id}`,
      );
      res.json({ ok: true });
    },
  );
  r.get('/travel/:id/photos/:updateId', async (req, res) => {
    const { trip, members } = await tripRow(req);
    const update = await db.get('SELECT * FROM travel_updates WHERE id=?', id(req.params.updateId));
    if (!update?.photo || !members.some((m) => m.id === update.member_id))
      fail(404, 'Photo not found');
    const shaped = await shape(trip, members, req.user);
    if (!shaped.updates.some((u) => u.id === update.id))
      fail(403, 'This update is outside your team');
    res.sendFile(path.join(uploads, 'travel-photos', path.basename(update.photo)));
  });
  r.post('/travel/:id/submit', async (req, res) => {
    const { trip, members } = await tripRow(req, true);
    if (trip.status !== 'Approved') fail(409, 'Only approved trips can be submitted');
    if (
      trip.requested_by !== req.user.id &&
      !members.some((m) => m.employee_id === req.user.employeeId)
    )
      fail(403, 'Only the requester or travelling team can submit a summary');
    const open = await db.value(
      `SELECT w.id FROM work_sessions w JOIN travel_members m ON m.id=w.travel_member_id WHERE m.trip_id=? AND w.end_at IS NULL`,
      trip.id,
    );
    if (open) fail(409, 'All team members must finish their duty before submitting the trip');
    const completed = await db.all(
      "SELECT m.id AS member_id FROM travel_members m WHERE m.trip_id=? AND (SELECT u.status FROM travel_updates u WHERE u.member_id=m.id ORDER BY u.created_at DESC,u.id DESC LIMIT 1)='Work completed'",
      trip.id,
    );
    if (members.some((m) => !completed.some((c) => c.member_id === m.id)))
      fail(400, 'Each team member must post a Work completed update first');
    await db.update('travel_trips', trip.id, {
      status: 'Submitted',
      final_summary: str(req.body.summary, { required: true, max: 5000 }),
      submitted_at: new Date().toISOString(),
    });
    await notifyUsers(
      db,
      [trip.approver_id],
      `${trip.project}: final trip summary is ready for review`,
      `/travel/${trip.id}`,
    );
    res.json({ ok: true });
  });
  r.post('/travel/:id/close', async (req, res) => {
    const { trip, members } = await tripRow(req, true);
    if (
      trip.approver_id !== req.user.id ||
      trip.requested_by === req.user.id ||
      members.some((m) => m.employee_id === req.user.employeeId)
    )
      fail(403, 'Only the assigned manager can close this trip');
    if (trip.status !== 'Submitted') fail(409, 'Review the final summary before closing the trip');
    await db.update('travel_trips', trip.id, {
      status: 'Closed',
      closed_at: new Date().toISOString(),
    });
    await notifyUsers(
      db,
      [
        trip.requested_by,
        ...(await Promise.all(members.map((m) => userIdForEmployee(db, m.employee_id)))),
      ],
      `${trip.project}: trip closed by the manager`,
      `/travel/${trip.id}`,
    );
    res.json({ ok: true });
  });
}
