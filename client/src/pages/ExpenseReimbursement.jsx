import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useApp } from '../context.jsx';
import { useAction } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { Badge, Button, Field, Input, Select, Textarea, useConfirm } from '../components/ui.jsx';
import { expenseMoney, expenseNumber } from '../components/ExpenseFiles.jsx';
export default function ExpenseReimbursement({ expense, onDone }) {
  const { meta, toast } = useApp();
  const navigate = useNavigate();
  const [run, busy] = useAction(toast);
  const [confirm, confirmEl] = useConfirm();
  const [form, setForm] = useState({
    reimbursed_on: meta.today,
    paid_through: '',
    notes: '',
    reference: '',
  });
  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const dirty =
    !!form.paid_through || !!form.notes || !!form.reference || form.reimbursed_on !== meta.today;
  useEffect(() => {
    const unload = (e) => {
      if (dirty && !busy) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty, busy]);
  const close = async () => {
    if (
      !dirty ||
      (await confirm({
        title: 'Discard reimbursement details?',
        text: 'Your unsaved payment details will be lost.',
        confirmLabel: 'Discard changes',
      }))
    )
      navigate('/expenses/' + expense.id);
  };
  if (!expense.canAct || expense.status !== 'Approved')
    return (
      <div className="card">
        <p>Only an approved expense belonging to another employee can be reimbursed.</p>
        <Link className="btn" to={'/expenses/' + expense.id}>
          Back to expense
        </Link>
      </div>
    );
  return (
    <section className="expense-report">
      <header className="expense-report-header">
        <div>
          <strong>
            {expense.first_name} {expense.last_name}
          </strong>
          <span className="expense-reimburse-number">
            {expenseNumber(expense)} <Badge tone="green">Approved</Badge>
          </span>
        </div>
        <Button aria-label="Close reimbursement form" disabled={busy} onClick={close}>
          <X size={18} />
        </Button>
      </header>
      <div className="expense-reimbursement-content">
        <h1>Record Reimbursement</h1>
        <div className="expense-reimbursement-layout">
          <form
            className="expense-payment-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  () => api.post('/expenses/' + expense.id + '/reimburse', form),
                  'Reimbursement recorded',
                )
              ) {
                onDone();
                navigate('/expenses/' + expense.id);
              }
            }}
          >
            <h2>Manual Reimbursement</h2>
            <fieldset disabled={busy}>
              <Field label="Amount to be Reimbursed">
                <Input
                  aria-label="Amount to be reimbursed"
                  readOnly
                  value={expenseMoney(expense.amount)}
                />
              </Field>
              <Field label="Reimbursed on *">
                <Input
                  aria-label="Reimbursed on"
                  type="date"
                  required
                  max={meta.today}
                  value={form.reimbursed_on}
                  onChange={change('reimbursed_on')}
                />
              </Field>
              <Field label="Paid Through *">
                <Select
                  aria-label="Paid Through"
                  required
                  placeholder="Select payment method"
                  options={['Bank transfer', 'Cash', 'UPI', 'Cheque']}
                  value={form.paid_through}
                  onChange={change('paid_through')}
                />
              </Field>
              <Field label="Notes">
                <Textarea
                  aria-label="Payment notes"
                  maxLength={1000}
                  rows={3}
                  value={form.notes}
                  onChange={change('notes')}
                />
              </Field>
              <Field label="Reference#">
                <Input
                  aria-label="Payment reference"
                  maxLength={120}
                  value={form.reference}
                  onChange={change('reference')}
                />
              </Field>
              <p className="small muted">
                Record a payment already made to the employee. This action does not transfer money.
              </p>
              <div className="row gap-8">
                <Button type="submit" variant="primary" loading={busy}>
                  Record Reimbursement
                </Button>
                <Button disabled={busy} onClick={close}>
                  Cancel
                </Button>
              </div>
            </fieldset>
          </form>
          <aside className="expense-payment-summary">
            <h3>Reimbursement Summary</h3>
            <div>
              <span>Total reimbursable amount</span>
              <strong>{expenseMoney(expense.amount)}</strong>
            </div>
            <div className="expense-payment-total">
              <span>Amount to be reimbursed</span>
              <strong>{expenseMoney(expense.amount)}</strong>
            </div>
          </aside>
        </div>
      </div>
      {confirmEl}
    </section>
  );
}
