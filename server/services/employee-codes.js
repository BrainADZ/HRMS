import { getSettings } from '../core.js';

export async function nextEmployeeCode(db) {
  const prefix = (await getSettings(db)).employeeCodePrefix || 'BZ';
  const max = (await db.all('SELECT code FROM employees'))
    .map((employee) => Number(String(employee.code).match(/\d+$/)?.[0]) || 0)
    .reduce((highest, number) => Math.max(highest, number), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
