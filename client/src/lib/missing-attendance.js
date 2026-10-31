import { api } from './api.js';

let prompt = null;
const listeners = new Set();
export const missingAttendanceStore = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snapshot() {
    return prompt;
  },
};
const emit = () => listeners.forEach((fn) => fn());
export function finishMissingAttendance(reasons) {
  const current = prompt;
  prompt = null;
  emit();
  if (reasons) current?.resolve(reasons);
  else
    current?.reject(
      new Error('Check-in cancelled. Add the missing-attendance reason to continue.'),
    );
}
export async function withAbsenceReasons(body) {
  const { items } = await api.get('/attendance/missing-days');
  if (!items.length) return body;
  const absenceReasons = await new Promise((resolve, reject) => {
    prompt = { items, resolve, reject };
    emit();
  });
  return { ...body, absenceReasons };
}
