import { audit, fail, fullName, id, isHR, notFound, oneOf, scopeIds, str, today } from '../core.js';
import * as D from '../lib/dates.js';

const minutes = (value, fallback) => {
  const number = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 5 || number > 480)
    fail(400, 'Duration must be between 5 and 480 minutes');
  return number;
};

const httpsUrl = (value) => {
  const url = str(value, { max: 1000 }) || null;
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) fail(400, 'Material link must start with https://');
  return url;
};

export default function trainingRoutes(r, { db }) {
  r.get('/training', async (req, res) => {
    const scope = await scopeIds(db, req.user);
    const where = scope === null ? '' : scope.length ? `WHERE a.employee_id IN (${scope.map(() => '?').join(',')})` : 'WHERE 1=0';
    const assignments = await db.all(
      `SELECT a.*, m.title, m.description, m.content, m.sort, m.duration_minutes, m.resource_url,
              e.first_name, e.last_name, e.code, e.join_date
       FROM training_assignments a JOIN training_modules m ON m.id = a.module_id
       JOIN employees e ON e.id = a.employee_id ${where}
       ORDER BY e.join_date DESC, e.id, m.sort, m.id`,
      ...(scope || []),
    );
    const sessionAssignments = await db.all(
      `SELECT a.*, s.title, s.agenda, s.trainer, s.starts_at, s.duration_minutes, s.mode, s.venue,
              e.first_name, e.last_name, e.code, e.join_date
       FROM training_session_assignments a JOIN training_sessions s ON s.id = a.session_id
       JOIN employees e ON e.id = a.employee_id ${where ? `${where} AND` : 'WHERE'} s.status = 'Scheduled'
       ORDER BY s.starts_at, e.first_name, e.last_name`,
      ...(scope || []),
    );
    const people = new Map();
    const personFor = (row) => {
      let person = people.get(row.employee_id);
      if (!person) {
        person = { id: row.employee_id, name: fullName(row), code: row.code, joinDate: row.join_date, total: 0, completed: 0, sessionsTotal: 0, sessionsAttended: 0 };
        people.set(row.employee_id, person);
      }
      return person;
    };
    for (const row of assignments) {
      const person = personFor(row);
      person.total++;
      if (row.completed_at) person.completed++;
    }
    for (const row of sessionAssignments) {
      const person = personFor(row);
      person.sessionsTotal++;
      if (row.attended_at) person.sessionsAttended++;
    }
    res.json({
      modules: isHR(req.user) ? await db.all('SELECT * FROM training_modules WHERE active = 1 ORDER BY sort, id') : [],
      my: assignments.filter((row) => row.employee_id === req.user.employeeId),
      mySessions: sessionAssignments.filter((row) => row.employee_id === req.user.employeeId),
      teamSessions: isHR(req.user) || req.user.role === 'manager' ? sessionAssignments : [],
      sessions: isHR(req.user) ? await db.all('SELECT * FROM training_sessions ORDER BY starts_at DESC LIMIT 100') : [],
      people: isHR(req.user) || req.user.role === 'manager' ? [...people.values()] : [],
    });
  });

  r.post('/training/modules', async (req, res) => {
    if (!isHR(req.user)) fail(403, 'Only HR can add training modules');
    const moduleId = await db.insert('training_modules', {
      title: str(req.body.title, { required: true, max: 120, name: 'Title' }),
      description: str(req.body.description, { max: 300 }) || '',
      content: str(req.body.content, { required: true, max: 5000, name: 'Training content' }),
      duration_minutes: minutes(req.body.duration_minutes, 15),
      resource_url: httpsUrl(req.body.resource_url),
      sort: (await db.value('SELECT COALESCE(MAX(sort), -1) + 1 FROM training_modules')) || 0,
      created_by: req.user.id,
    });
    const recent = D.addDays(await today(db), -90);
    await db.run(
      `INSERT INTO training_assignments (module_id, employee_id)
       SELECT ?, id FROM employees WHERE status != 'Exited' AND join_date BETWEEN ? AND ?
       ON CONFLICT DO NOTHING`,
      moduleId, recent, await today(db),
    );
    await audit(db, req.user, 'training.module.create', 'training_module', moduleId);
    res.json({ id: moduleId });
  });

  r.post('/training/modules/:id/assign', async (req, res) => {
    if (!isHR(req.user)) fail(403, 'Only HR can assign training');
    const moduleId = id(req.params.id);
    const employeeId = id(req.body.employee_id);
    if (!(await db.value('SELECT 1 FROM training_modules WHERE id = ? AND active = 1', moduleId))) notFound('Training module');
    if (!(await db.value("SELECT 1 FROM employees WHERE id = ? AND status != 'Exited'", employeeId))) notFound('Employee');
    await db.run('INSERT INTO training_assignments (module_id, employee_id) VALUES (?, ?) ON CONFLICT DO NOTHING', moduleId, employeeId);
    await audit(db, req.user, 'training.assign', 'employee', employeeId, { moduleId });
    res.json({ ok: true });
  });

  r.post('/training/sessions', async (req, res) => {
    if (!isHR(req.user)) fail(403, 'Only HR can schedule training');
    const startsAt = str(req.body.starts_at, { required: true, max: 40, name: 'Start time' });
    const timestamp = new Date(startsAt);
    if (Number.isNaN(timestamp.getTime())) fail(400, 'Choose a valid start time');
    const sessionId = await db.insert('training_sessions', {
      title: str(req.body.title, { required: true, max: 120, name: 'Title' }),
      agenda: str(req.body.agenda, { max: 2000 }) || '',
      trainer: str(req.body.trainer, { required: true, max: 120, name: 'Trainer' }),
      starts_at: timestamp.toISOString(),
      duration_minutes: minutes(req.body.duration_minutes, 60),
      mode: oneOf(req.body.mode || 'In person', ['Online', 'In person'], { name: 'Mode' }),
      venue: str(req.body.venue, { max: 500 }) || null,
      created_by: req.user.id,
    });
    const T = await today(db);
    await db.run(
      `INSERT INTO training_session_assignments (session_id, employee_id)
       SELECT ?, id FROM employees WHERE status != 'Exited' AND join_date BETWEEN ? AND ?
       ON CONFLICT DO NOTHING`,
      sessionId, D.addDays(T, -90), T,
    );
    await audit(db, req.user, 'training.session.create', 'training_session', sessionId);
    res.json({ id: sessionId });
  });

  r.post('/training/sessions/:id/assign', async (req, res) => {
    if (!isHR(req.user)) fail(403, 'Only HR can assign training sessions');
    const sessionId = id(req.params.id);
    const employeeId = id(req.body.employee_id);
    if (!(await db.value("SELECT 1 FROM training_sessions WHERE id = ? AND status = 'Scheduled'", sessionId))) notFound('Training session');
    if (!(await db.value("SELECT 1 FROM employees WHERE id = ? AND status != 'Exited'", employeeId))) notFound('Employee');
    await db.run('INSERT INTO training_session_assignments (session_id, employee_id) VALUES (?, ?) ON CONFLICT DO NOTHING', sessionId, employeeId);
    await audit(db, req.user, 'training.session.assign', 'employee', employeeId, { sessionId });
    res.json({ ok: true });
  });

  r.post('/training/sessions/:id/attendance', async (req, res) => {
    if (!isHR(req.user) && req.user.role !== 'manager') fail(403, 'Only HR or managers can record attendance');
    const sessionId = id(req.params.id);
    const employeeId = id(req.body.employee_id);
    if (typeof req.body.attended !== 'boolean') fail(400, 'Attended must be true or false');
    const scope = await scopeIds(db, req.user);
    if (scope !== null && (!scope.includes(employeeId) || employeeId === req.user.employeeId))
      fail(403, 'You can record attendance only for your team');
    const session = (await db.get('SELECT * FROM training_sessions WHERE id = ?', sessionId)) || notFound('Training session');
    if (session.status !== 'Scheduled') fail(409, 'This session is cancelled');
    if (session.starts_at > new Date().toISOString()) fail(409, 'Attendance opens when the session starts');
    const result = await db.run(
      'UPDATE training_session_assignments SET attended_at = ?, attendance_by = ? WHERE session_id = ? AND employee_id = ?',
      req.body.attended ? new Date().toISOString() : null,
      req.body.attended ? req.user.id : null,
      sessionId, employeeId,
    );
    if (!result.changes) notFound('Assigned employee');
    await audit(db, req.user, 'training.session.attendance', 'training_session', sessionId, { employeeId, attended: req.body.attended });
    res.json({ ok: true });
  });

  r.post('/training/sessions/:id/cancel', async (req, res) => {
    if (!isHR(req.user)) fail(403, 'Only HR can cancel training sessions');
    const sessionId = id(req.params.id);
    const result = await db.run("UPDATE training_sessions SET status = 'Cancelled' WHERE id = ? AND status = 'Scheduled'", sessionId);
    if (!result.changes) notFound('Scheduled training session');
    await audit(db, req.user, 'training.session.cancel', 'training_session', sessionId);
    res.json({ ok: true });
  });

  r.post('/training/modules/:id/complete', async (req, res) => {
    if (!req.user.employeeId) fail(403, 'Your login is not linked to an employee');
    const moduleId = id(req.params.id);
    const result = await db.run(
      'UPDATE training_assignments SET completed_at = ? WHERE module_id = ? AND employee_id = ? AND completed_at IS NULL',
      new Date().toISOString(), moduleId, req.user.employeeId,
    );
    if (!result.changes && !(await db.value('SELECT 1 FROM training_assignments WHERE module_id = ? AND employee_id = ?', moduleId, req.user.employeeId))) notFound('Assigned training');
    if (result.changes) await audit(db, req.user, 'training.complete', 'training_module', moduleId);
    res.json({ ok: true });
  });
}
