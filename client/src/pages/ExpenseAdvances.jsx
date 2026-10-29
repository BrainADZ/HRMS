import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { api, apiUrl } from '../lib/api.js';
import { useApi, useAction } from '../lib/hooks.js';
import { useApp } from '../context.jsx';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Select,
} from '../components/ui.jsx';
import { inr, fmtDate } from '../lib/format.js';
import { advanceExpense, expenseStatus } from '../lib/expense-list.js';

export default function ExpenseAdvances({ showCreate = true, id = null, onChanged }) {
  const { toast, meta, user } = useApp();
  const navigate = useNavigate();
  const { data, error, reload } = useApi('/expenses/advances');
  const { data: eligible } = useApi(!id && showCreate ? '/expenses/advances/eligible' : null);
  const [run, busy] = useAction(toast);
  const [request, setRequest] = useState({
    employee_id: '',
    amount: '',
    purpose: '',
    disbursed_on: meta.today,
    payment_method: '',
    payment_reference: '',
  });
  const act = async (work, message) => {
    if (await run(work, message)) {
      reload();
      onChanged?.();
    }
  };
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const selected = id ? data.items.find((advance) => advance.id === id) : null;
  if (id && !selected) return <Empty text="Advance not found" />;
  if (!id && (!showCreate || !data.canCreate)) return null;
  return (
    <section
      className={id ? 'expense-report' : 'expense-workspace'}
      style={id ? undefined : { padding: 20 }}
    >
      {selected && (
        <header className="expense-report-header">
          <div className="row gap-12">
            <Link
              to={data.canReview ? '/expenses/approvals' : '/expenses'}
              className="btn"
              aria-label="Back to expenses"
            >
              <ArrowLeft size={17} />
            </Link>
            <strong>{advanceExpense(selected).expense_number}</strong>
            <Badge>{expenseStatus(selected)}</Badge>
          </div>
          <Link
            to={data.canReview ? '/expenses/approvals' : '/expenses'}
            className="btn"
            aria-label="Close advance details"
          >
            <X size={18} />
          </Link>
        </header>
      )}
      {!id && data.canCreate && showCreate && (
        <>
          <h3>Add Advance</h3>
          <div
            className="row gap-8"
            style={{ flexWrap: 'wrap', alignItems: 'end', marginBottom: 20 }}
          >
            <Field label="Advance for">
              <Select
                value={request.employee_id}
                onChange={(e) => setRequest({ ...request, employee_id: e.target.value })}
                options={(eligible?.items || []).map((e) => ({
                  value: e.id,
                  label:
                    e.id === user?.employeeId
                      ? `My account — ${e.first_name} ${e.last_name}`
                      : `${e.first_name} ${e.last_name} (${e.code})`,
                }))}
                placeholder="Select employee"
              />
            </Field>
            <Field label="Advance amount (₹)">
              <Input
                type="number"
                min="1"
                step="1"
                value={request.amount}
                onChange={(e) => setRequest({ ...request, amount: e.target.value })}
              />
            </Field>
            <Field label="Purpose">
              <Input
                maxLength={200}
                value={request.purpose}
                onChange={(e) => setRequest({ ...request, purpose: e.target.value })}
              />
            </Field>
            <Field label="Advance date">
              <Input
                type="date"
                max={meta.today}
                value={request.disbursed_on}
                onChange={(e) => setRequest({ ...request, disbursed_on: e.target.value })}
              />
            </Field>
            <Field label="Payment method">
              <Select
                value={request.payment_method}
                onChange={(e) => setRequest({ ...request, payment_method: e.target.value })}
                options={['Bank transfer', 'Cash', 'UPI', 'Cheque']}
                placeholder="Select method"
              />
            </Field>
            <Field label="Payment reference">
              <Input
                maxLength={120}
                value={request.payment_reference}
                onChange={(e) => setRequest({ ...request, payment_reference: e.target.value })}
              />
            </Field>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const created = await api.post('/expenses/advances', request);
                  onChanged?.();
                  navigate(`/expenses/advances/${created.id}`);
                  setRequest({
                    employee_id: '',
                    amount: '',
                    purpose: '',
                    disbursed_on: meta.today,
                    payment_method: '',
                    payment_reference: '',
                  });
                  return true;
                }, 'Advance request sent to CEO')
              }
            >
              Add Advance · Send for Approval
            </Button>
          </div>
        </>
      )}
      {(selected ? [selected] : []).map((a) => (
        <div key={a.id} className="expense-report-main" style={{ padding: 24 }}>
          <div className="expense-report-summary">
            <div>
              <h1>{a.purpose}</h1>
              <p>
                {a.first_name} {a.last_name} · {a.code} · {fmtDate(a.disbursed_on || a.created_at)}
              </p>
            </div>
            <div className="expense-report-amount">
              <span>Advance amount</span>
              <strong>{inr(a.amount)}</strong>
            </div>
            <div className="expense-report-amount">
              <span>Spent</span>
              <strong>{inr(a.spent)}</strong>
            </div>
            <div className="expense-report-amount">
              <span>{a.balance >= 0 ? 'Remaining balance' : 'Extra spending'}</span>
              <strong>{inr(Math.abs(a.balance))}</strong>
            </div>
          </div>
          <div className="card mb-16">
            <h3 className="mb-12">Advance details</h3>
            <dl className="kv">
              <dt>Employee</dt>
              <dd>
                {a.first_name} {a.last_name}
              </dd>
              <dt>Employee ID</dt>
              <dd>{a.code}</dd>
              <dt>Advance date</dt>
              <dd>{fmtDate(a.disbursed_on)}</dd>
              <dt>Payment method</dt>
              <dd>{a.payment_method || '—'}</dd>
              <dt>Payment reference</dt>
              <dd>{a.payment_reference || '—'}</dd>
              <dt>Approval</dt>
              <dd>
                {a.status === 'Pending Admin' ? 'Waiting for CEO / Master Admin' : expenseStatus(a)}
              </dd>
            </dl>
          </div>
          <div className="row wrap gap-8 mb-16">
            {data.canApprove && a.status === 'Pending Admin' && (
              <div className="row gap-8">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api.post(`/expenses/advances/${a.id}/decision`, { action: 'approve' }),
                      'Advance approved',
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api.post(`/expenses/advances/${a.id}/decision`, { action: 'reject' }),
                      'Advance rejected',
                    )
                  }
                >
                  Reject
                </Button>
              </div>
            )}
            {a.isOwner && a.status === 'Awaiting Acceptance' && (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  act(() => api.post(`/expenses/advances/${a.id}/accept`), 'Advance accepted')
                }
              >
                Accept {inr(a.amount)} advance
              </Button>
            )}
            {a.isOwner && a.status === 'Active' && (
              <Link className="btn" to={`/expenses/bulk?advance=${a.id}`}>
                Add expenses in Bulk form
              </Link>
            )}
            {a.isOwner && a.status === 'Active' && (
              <Button
                variant="primary"
                disabled={busy || !a.entries.length}
                onClick={() =>
                  act(
                    () => api.post(`/expenses/advances/${a.id}/submit`),
                    'Final expenses sent to Accounts',
                  )
                }
              >
                Send final expenses
              </Button>
            )}
            {a.isOwner && a.status === 'Submitted' && a.balance < 0 && !a.extra_claim_id && (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  act(
                    () => api.post(`/expenses/advances/${a.id}/extra-claim`),
                    'Extra expense claim sent to Accounts',
                  )
                }
              >
                Create separate claim for extra {inr(-a.balance)}
              </Button>
            )}
            {a.extra_claim_id && (
              <Link className="btn" to={`/expenses/${a.extra_claim_id}`}>
                Extra expense claim #{a.extra_claim_id}
              </Link>
            )}
            {data.canReview && a.status === 'Submitted' && (a.balance >= 0 || a.extra_claim_id) && (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  act(() => api.post(`/expenses/advances/${a.id}/settle`), 'Advance settled')
                }
              >
                Mark settled
              </Button>
            )}
          </div>
          <h3 className="mb-12">Expenses against this advance</h3>
          {a.entries.length ? (
            <div className="expense-table-scroll">
              <table className="table expense-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="num">Amount</th>
                    <th>Receipts</th>
                  </tr>
                </thead>
                <tbody>
                  {a.entries.map((entry, i) => (
                    <tr key={i}>
                      <td>{fmtDate(entry.date)}</td>
                      <td>{entry.description}</td>
                      <td className="num">{inr(entry.amount)}</td>
                      <td>
                        {entry.attachments?.map((file, j) => (
                          <a
                            key={j}
                            className="link"
                            style={{ marginRight: 12 }}
                            href={apiUrl(`/expenses/advances/${a.id}/attachments/${i}/${j}`)}
                          >
                            {file.name}
                          </a>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="No expenses recorded against this advance yet" />
          )}
        </div>
      ))}
    </section>
  );
}
