import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiUrl } from '../lib/api.js';
import { useApi, useAction } from '../lib/hooks.js';
import { useApp } from '../context.jsx';
import { Badge, Button, Field, Input, Select } from '../components/ui.jsx';
import { inr } from '../lib/format.js';

export default function ExpenseAdvances({ showCreate = true }) {
  const { toast, meta, user } = useApp();
  const { data, reload } = useApi('/expenses/advances');
  const { data: eligible } = useApi('/expenses/advances/eligible');
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
    if (await run(work, message)) reload();
  };
  if (!showCreate && !data?.items?.length) return null;
  return (
    <section className="expense-workspace" style={{ padding: 20, marginTop: 20 }}>
      <h2>Employee advances</h2>
      <p className="small muted">
        Accounts requests an advance, admin approves it, and the employee accepts and records
        spending here.
      </p>
      {data?.canCreate && showCreate && (
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
                  await api.post('/expenses/advances', request);
                  setRequest({
                    employee_id: '',
                    amount: '',
                    purpose: '',
                    disbursed_on: meta.today,
                    payment_method: '',
                    payment_reference: '',
                  });
                  return true;
                }, 'Advance request sent to admin')
              }
            >
              Add Advance · Send for Approval
            </Button>
          </div>
        </>
      )}
      {!data?.items?.length && <p className="small muted">No advances yet.</p>}
      {data?.items?.map((a) => (
        <div key={a.id} style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
          <div className="row gap-8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>
              Advance #{a.id} · {a.first_name} {a.last_name}
            </strong>
            <Badge>{a.status}</Badge>
            <span>
              {inr(a.amount)} {a.status === 'Pending Admin' || a.status === 'Rejected' ? 'requested' : 'given'} · {inr(a.spent)} used ·{' '}
              {a.balance >= 0
                ? `${inr(a.balance)} remaining`
                : `${inr(-a.balance)} spent by employee`}
            </span>
          </div>
          <p className="small muted">{a.purpose}</p>
          {a.payment_method && (
            <p className="small muted">
              Advance date: {a.disbursed_on} · {a.payment_method}
              {a.payment_reference ? ` · ${a.payment_reference}` : ''}
            </p>
          )}
          {data.isAdmin && a.status === 'Pending Admin' && (
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
          {a.entries.length > 0 && (
            <ul>
              {a.entries.map((e, i) => (
                <li key={i}>
                  {e.date} · {e.description} · {inr(e.amount)}
                  {e.attachments?.map((file, j) => (
                    <a
                      key={j}
                      href={apiUrl(`/expenses/advances/${a.id}/attachments/${i}/${j}`)}
                      style={{ marginLeft: 8 }}
                    >
                      {file.name}
                    </a>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {a.isOwner && a.status === 'Active' && (
            <Link className="btn" to={`/expenses/bulk?advance=${a.id}`}>
              Add expenses in Bulk form
            </Link>
          )}
          {a.isOwner && a.status === 'Active' && (
            <Button
              variant="primary"
              disabled={busy}
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
      ))}
    </section>
  );
}
