import * as D from '../lib/dates.js';

export async function assignNewJoinerTraining(db, employeeId) {
  await db.run(
    `INSERT INTO training_assignments (module_id, employee_id)
     SELECT id, ? FROM training_modules WHERE active = 1 ON CONFLICT DO NOTHING`,
    employeeId,
  );
  await db.run(
    `INSERT INTO training_session_assignments (session_id, employee_id)
     SELECT id, ? FROM training_sessions WHERE status = 'Scheduled' AND starts_at >= ?
     ON CONFLICT DO NOTHING`,
    employeeId, new Date().toISOString(),
  );
}

export async function assignRecentJoinersTraining(db, date) {
  await db.run(
    `INSERT INTO training_assignments (module_id, employee_id)
     SELECT m.id, e.id FROM training_modules m CROSS JOIN employees e
     WHERE m.active = 1 AND e.status != 'Exited' AND e.join_date BETWEEN ? AND ?
     ON CONFLICT DO NOTHING`,
    D.addDays(date, -90), date,
  );
  await db.run(
    `INSERT INTO training_session_assignments (session_id, employee_id)
     SELECT s.id, e.id FROM training_sessions s CROSS JOIN employees e
     WHERE s.status = 'Scheduled' AND s.starts_at >= ?
       AND e.status != 'Exited' AND e.join_date BETWEEN ? AND ?
     ON CONFLICT DO NOTHING`,
    new Date().toISOString(), D.addDays(date, -90), date,
  );
}

