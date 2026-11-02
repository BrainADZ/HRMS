import { PAYROLL_DISABLED_MESSAGE } from '../../../shared/features.js';

export default function PayrollUnavailable() {
  return (
    <section className="card" role="status">
      <h2>Payroll · Disabled</h2>
      <p className="muted">{PAYROLL_DISABLED_MESSAGE}</p>
    </section>
  );
}
