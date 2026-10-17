import { fail } from '../core.js';
import { json } from '../db.js';

// Approved snapshots stay immutable. Draft snapshots must be rebuilt whenever
// their attendance/leave/employee/policy inputs change.
export async function invalidatePayrollInputs(db, from = '0001-01-01', to = '9999-12-31', { rejectLocked = false } = {}) {
  const runs = await db.all('SELECT * FROM payroll_runs WHERE month BETWEEN ? AND ?', from.slice(0, 7), to.slice(0, 7));
  for (const run of runs) {
    if (!['In Review', 'Finance Reviewed'].includes(run.status)) {
      if (rejectLocked) fail(409, `Payroll for ${run.month} is approved or paid. Record a correction in a later period.`);
      continue;
    }
    const steps = { ...json(run.steps, {}), inputsChanged: new Date().toISOString() };
    delete steps.approvals;
    await db.update('payroll_runs', run.id, { status: 'In Review', steps, approvals: json(run.approvals, []).filter((a) => a.stage === 'Prepared by HR'), updated_at: steps.inputsChanged });
  }
}
