import { id } from '../core.js';

export function employeeFilter(query = {}, alias = 'e') {
  const where = [],
    params = [];
  for (const [key, column] of Object.entries({
    vertical: 'vertical_id',
    department: 'department_id',
    location: 'location_id',
    employee: 'id',
  })) {
    if (query[key]) {
      where.push(
        key === 'vertical'
          ? `(${alias}.${column} = ? OR EXISTS(SELECT 1 FROM employee_verticals ev WHERE ev.employee_id=${alias}.id AND ev.vertical_id=?))`
          : `${alias}.${column} = ?`,
      );
      if (key === 'vertical') params.push(id(query[key]));
      params.push(id(query[key]));
    }
  }
  return { sql: where.length ? where.join(' AND ') : '1=1', params };
}
