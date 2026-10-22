import { today, fullName } from '../core.js';
import * as D from '../lib/dates.js';

// Public wishes expose names and upcoming celebration dates, never birth years,
// employee IDs, email addresses or other employee-record fields.
export async function celebrations(db) {
  const T = await today(db);
  const end = D.addDays(T, 14);
  const employees = await db.all("SELECT first_name, last_name, dob FROM employees WHERE status != 'Exited' AND join_date <= ? AND dob IS NOT NULL", T);
  const birthdays = employees.flatMap(employee => {
    for (let year = Number(T.slice(0, 4)); year <= Number(T.slice(0, 4)) + 4; year++) {
      const date = `${year}-${employee.dob.slice(5)}`;
      if (D.isValidYmd(date) && date >= T) return date <= end ? [{ name: fullName(employee), date }] : [];
    }
    return [];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const holidays = await db.all('SELECT name, date, type FROM holidays WHERE date BETWEEN ? AND ? ORDER BY date, name', T, end);
  return { today: T, birthdays, holidays };
}
