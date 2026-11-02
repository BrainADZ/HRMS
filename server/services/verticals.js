import { fail, audit } from '../core.js';
export const membershipSql = (alias = 'e') =>
  `ARRAY(SELECT ev.vertical_id FROM employee_verticals ev WHERE ev.employee_id=${alias}.id ORDER BY ev.vertical_id)`;
export async function saveVerticals(db, actor, employeeId, values) {
  if (!Array.isArray(values) || !values.length || values.length > 50)
    fail(400, 'Choose at least one vertical');
  const employee = await db.get('SELECT vertical_id FROM employees WHERE id=?', employeeId);
  if (!employee) fail(404, 'Employee not found');
  const ids = [...new Set(values.map(Number))];
  for (const id of ids)
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !(await db.value('SELECT id FROM verticals WHERE id=?', id))
    )
      fail(400, 'Choose valid verticals');
  if (employee.vertical_id && !ids.includes(employee.vertical_id))
    fail(
      400,
      'Keep the primary vertical selected. Change the primary vertical from the employee profile.',
    );
  const before = await db.all(
    'SELECT vertical_id FROM employee_verticals WHERE employee_id=?',
    employeeId,
  );
  await db.run('DELETE FROM employee_verticals WHERE employee_id=?', employeeId);
  for (const id of ids)
    await db.run(
      'INSERT INTO employee_verticals(employee_id,vertical_id) VALUES(?,?)',
      employeeId,
      id,
    );
  await audit(db, actor, 'verticals.assign', 'employee', employeeId, {
    before: before.map((v) => v.vertical_id),
    vertical_ids: ids,
  });
}
