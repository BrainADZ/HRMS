import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi, useAction } from '../lib/hooks.js';
import { useApp } from '../context.jsx';
import { Badge, Button, Field, Input, Select } from '../components/ui.jsx';
import { inr } from '../lib/format.js';

export default function ExpenseAdvances() {
  const { toast, meta } = useApp();
  const { data, reload } = useApi('/expenses/advances');
  const { data: eligible } = useApi('/expenses/advances/eligible');
  const [run, busy] = useAction(toast);
  const [request, setRequest] = useState({ employee_id: '', amount: '', purpose: '' });
  const [editing, setEditing] = useState(null);
  const [entries, setEntries] = useState([]);
  const act = async (work, message) => {
    if (await run(work, message)) reload();
  };
  const begin = (a) => {
    setEditing(a.id);
    setEntries(a.entries.map((e) => ({ ...e })));
  };
  return (
    <section className="expense-workspace" style={{ padding: 20, marginTop: 20 }}>
      <h2>Employee advances</h2>
      <p className="small muted">
        Accounts requests an advance, admin approves it, and the employee accepts and records
        spending here.
      </p>
      {data?.canReview && (
        <div
          className="row gap-8"
          style={{ flexWrap: 'wrap', alignItems: 'end', marginBottom: 20 }}
        >
          <Field label="Employee">
            <Select
              value={request.employee_id}
              onChange={(e) => setRequest({ ...request, employee_id: e.target.value })}
              options={(eligible?.items || []).map((e) => ({
                value: e.id,
                label: `${e.first_name} ${e.last_name} (${e.code})`,
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
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await api.post('/expenses/advances', request);
                setRequest({ employee_id: '', amount: '', purpose: '' });
                return true;
              }, 'Advance request sent to admin')
            }
          >
            Request admin approval
          </Button>
        </div>
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
              {inr(a.amount)} given · {inr(a.spent)} used ·{' '}
              {a.balance >= 0
                ? `${inr(a.balance)} remaining`
                : `${inr(-a.balance)} spent by employee`}
            </span>
          </div>
          <p className="small muted">{a.purpose}</p>
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
          {a.entries.length > 0 && editing !== a.id && (
            <ul>
              {a.entries.map((e, i) => (
                <li key={i}>
                  {e.date} · {e.description} · {inr(e.amount)}
                </li>
              ))}
            </ul>
          )}
          {a.isOwner && a.status === 'Active' && editing !== a.id && (
            <Button onClick={() => begin(a)}>Update expenses</Button>
          )}
          {a.isOwner && a.status === 'Active' && editing === a.id && (
            <div>
              {entries.map((e, i) => (
                <div className="row gap-8" key={i} style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                  <Input
                    aria-label="Expense date"
                    type="date"
                    max={meta.today}
                    value={e.date}
                    onChange={(v) =>
                      setEntries(
                        entries.map((x, j) => (j === i ? { ...x, date: v.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    aria-label="Expense description"
                    placeholder="What was paid for"
                    maxLength={200}
                    value={e.description}
                    onChange={(v) =>
                      setEntries(
                        entries.map((x, j) =>
                          j === i ? { ...x, description: v.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label="Expense amount"
                    type="number"
                    min="1"
                    step="1"
                    value={e.amount}
                    onChange={(v) =>
                      setEntries(
                        entries.map((x, j) => (j === i ? { ...x, amount: v.target.value } : x)),
                      )
                    }
                  />
                  <Button onClick={() => setEntries(entries.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              ))}
              <div className="row gap-8">
                <Button
                  onClick={() =>
                    setEntries([...entries, { date: meta.today, description: '', amount: '' }])
                  }
                >
                  Add expense
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await run(
                        () => api.put(`/expenses/advances/${a.id}/entries`, { entries }),
                        'Expenses saved',
                      )
                    ) {
                      setEditing(null);
                      reload();
                    }
                  }}
                >
                  Save progress
                </Button>
                <Button onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {a.isOwner && a.status === 'Active' && editing !== a.id && (
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
          {data.canReview && a.status === 'Submitted' && (
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
