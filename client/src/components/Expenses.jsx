import { useState } from 'react';
import { api, apiUrl } from '../lib/api.js';
import { useApi, useAction } from '../lib/hooks.js';
import { useApp } from '../context.jsx';
import { Button, Card, Field, Input, Select, Textarea, Modal, Badge, Empty } from './ui.jsx';

export function ExpenseModal({ onClose, onDone, initialBulk = false }) {
  const { meta, toast } = useApp();
  const fresh = () => ({
    start_date: meta.today,
    end_date: meta.today,
    purpose: '',
    category: 'Travel',
    amount: '',
    merchant: '',
    description: '',
    files: [],
  });
  const [bulk, setBulk] = useState(initialBulk);
  const [entries, setEntries] = useState([fresh()]);
  const [run, busy] = useAction(toast);
  const change = (i, key, value) =>
    setEntries((old) => old.map((e, j) => (j === i ? { ...e, [key]: value } : e)));
  const submit = async () => {
    const form = new FormData();
    let index = 0;
    const payload = entries.map((e) => {
      if (
        !e.purpose.trim() ||
        !e.amount ||
        Number(e.amount) < 1 ||
        !e.start_date ||
        !e.end_date ||
        e.end_date < e.start_date ||
        e.end_date > meta.today
      )
        throw new Error('Enter a purpose, valid dates and amount for every expense.');
      return {
        ...e,
        files: e.files.map((file) => {
          form.append('proofs', file);
          return index++;
        }),
      };
    });
    form.append('entries', JSON.stringify(payload));
    await api('/expenses', { method: 'POST', form });
  };
  return (
    <Modal
      title="Claim expenses"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (await run(submit, 'Expense claims sent to Accounts')) {
                onDone?.();
                onClose();
              }
            }}
          >
            Submit {entries.length > 1 ? `${entries.length} claims` : 'claim'}
          </Button>
        </>
      }
    >
      <div
        className="row gap-8"
        style={{ marginBottom: 16 }}
        role="tablist"
        aria-label="Expense type"
      >
        <Button
          role="tab"
          aria-selected={!bulk}
          variant={!bulk ? 'primary' : undefined}
          disabled={busy || entries.length > 1}
          onClick={() => setBulk(false)}
        >
          Add Expense
        </Button>
        <Button
          role="tab"
          aria-selected={bulk}
          variant={bulk ? 'primary' : undefined}
          disabled={busy}
          onClick={() => setBulk(true)}
        >
          Add Bulk Expense
        </Button>
      </div>
      <p className="small muted">
        Your employee ID, name, designation and department are linked automatically. Accounts will
        review your claim; you and admin will receive the decision.
      </p>
      {entries.map((e, i) => (
        <fieldset
          key={i}
          disabled={busy}
          style={{
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 12,
            padding: 16,
            margin: '12px 0',
            minWidth: 0,
          }}
        >
          <legend>Expense {i + 1}</legend>
          <div className="form-grid">
            <Field label="Start date *">
              <Input
                type="date"
                max={meta.today}
                value={e.start_date}
                onChange={(v) => change(i, 'start_date', v.target.value)}
              />
            </Field>
            <Field label="End date *">
              <Input
                type="date"
                min={e.start_date}
                max={meta.today}
                value={e.end_date}
                onChange={(v) => change(i, 'end_date', v.target.value)}
              />
            </Field>
            <Field label="Purpose *" className="full">
              <Input
                maxLength={200}
                placeholder="e.g. Client meeting in Mumbai"
                value={e.purpose}
                onChange={(v) => change(i, 'purpose', v.target.value)}
              />
            </Field>
            <Field label="Category *">
              <Select
                options={[
                  'Travel',
                  'Meals',
                  'Accommodation',
                  'Office supplies',
                  'Internet / phone',
                  'Other',
                ]}
                value={e.category}
                onChange={(v) => change(i, 'category', v.target.value)}
              />
            </Field>
            <Field label="Amount (INR) *">
              <Input
                type="number"
                min="1"
                max="10000000"
                step="1"
                value={e.amount}
                onChange={(v) => change(i, 'amount', v.target.value)}
              />
            </Field>
            <Field label="Merchant / vendor" className="full">
              <Input
                maxLength={120}
                value={e.merchant}
                onChange={(v) => change(i, 'merchant', v.target.value)}
              />
            </Field>
            <Field label="Additional details" className="full">
              <Textarea
                rows={2}
                maxLength={1000}
                value={e.description}
                onChange={(v) => change(i, 'description', v.target.value)}
              />
            </Field>
            <Field
              label="Receipts & documents"
              className="full"
              hint="Up to 10 files per expense, 30 total. Images, PDF, DOC or DOCX; 10 MB each."
            >
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                onChange={(v) => {
                  const files = Array.from(v.target.files || []);
                  if (files.length > 10 || files.some((f) => f.size > 10 * 1024 * 1024)) {
                    toast('Choose up to 10 files, each 10 MB or smaller.', 'error');
                    v.target.value = '';
                    return;
                  }
                  change(i, 'files', files);
                }}
              />
              {e.files.map((f, j) => (
                <div key={j} className="row small gap-8">
                  <span className="grow">{f.name}</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      change(
                        i,
                        'files',
                        e.files.filter((_, k) => k !== j),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </Field>
          </div>
          {bulk && entries.length > 1 && (
            <Button size="sm" onClick={() => setEntries((old) => old.filter((_, j) => i !== j))}>
              Remove expense
            </Button>
          )}
        </fieldset>
      ))}
      {bulk && (
        <Button
          disabled={busy || entries.length >= 20}
          onClick={() => setEntries((old) => [...old, fresh()])}
        >
          + Add another expense
        </Button>
      )}
      <div className="small muted mt-12">
        Total: INR{' '}
        {entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0).toLocaleString('en-IN')} ·
        Pending Accounts review after submission
      </div>
    </Modal>
  );
}

export function ExpenseCard() {
  const { data, reload, error } = useApi('/expenses');
  const { toast } = useApp();
  const [run, busy] = useAction(toast);
  const [mode, setMode] = useState(null);
  return (
    <Card
      className="span-5"
      title={data?.canReview ? 'Expense claims · Accounts review' : 'Expense claims'}
    >
      <div className="row gap-8">
        <Button onClick={() => setMode('single')}>Add Expense</Button>
        <Button onClick={() => setMode('bulk')}>Add Bulk Expense</Button>
      </div>
      {error && (
        <p role="alert">
          Unable to load expenses.{' '}
          <button className="link" onClick={reload}>
            Retry
          </button>
        </p>
      )}
      {!data && !error && <p>Loading expenses…</p>}
      {data?.items.length === 0 && <Empty text="No expense claims yet" />}
      {data?.items.map((c) => (
        <div key={c.id} className="list-item" style={{ flexWrap: 'wrap' }}>
          <div className="grow">
            <div className="b6">
              INR {Number(c.amount).toLocaleString('en-IN')} ·{' '}
              {c.details?.purpose || c.note || 'Expense'}
            </div>
            {data.canReview && (
              <div className="small">
                {c.first_name} {c.last_name} · {c.code} · {c.designation} · {c.department}
              </div>
            )}
            {c.details && (
              <div className="small muted">
                {c.details.start_date} – {c.details.end_date} · {c.details.category}
                {c.details.merchant ? ` · ${c.details.merchant}` : ''}
              </div>
            )}
            {c.details?.description && <p className="small">{c.details.description}</p>}
            {c.details?.attachments?.map((f, i) => (
              <div key={i}>
                <a
                  className="small link"
                  href={apiUrl(`/expenses/${c.id}/attachments/${i}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {f.name}
                </a>
              </div>
            ))}
            {c.proof_file && (
              <a className="small link" href={apiUrl(`/payroll/adjustments/${c.id}/proof`)}>
                Download proof
              </a>
            )}
          </div>
          <Badge>{c.status === 'Pending' ? 'Pending Accounts' : c.status}</Badge>
          {data.canReview && c.status === 'Pending' && (
            <div className="row gap-8">
              {['Approved', 'Rejected'].map((status) => (
                <Button
                  key={status}
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await run(
                        () => api.put(`/expenses/${c.id}`, { status }),
                        `Claim ${status.toLowerCase()}`,
                      )
                    )
                      reload();
                  }}
                >
                  {status === 'Approved' ? 'Approve' : 'Reject'}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
      {mode && (
        <ExpenseModal
          key={mode}
          initialBulk={mode === 'bulk'}
          onClose={() => setMode(null)}
          onDone={reload}
        />
      )}
    </Card>
  );
}
