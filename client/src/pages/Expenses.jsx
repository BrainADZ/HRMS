import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, FileText, Plus, Receipt, Search, Trash2, Upload, X } from 'lucide-react';
import { useApp } from '../context.jsx';
import { useApi, useAction } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate, inr } from '../lib/format.js';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Select,
  Textarea,
  useConfirm,
} from '../components/ui.jsx';
import {
  ExpenseFileIcon,
  expenseFiles,
  expenseMoney,
  expenseNumber,
} from '../components/ExpenseFiles.jsx';
import ExpenseDetails from './ExpenseDetails.jsx';
import ExpenseAdminList from './ExpenseAdminList.jsx';
import ExpenseAdvances from './ExpenseAdvances.jsx';
import './Expenses.css';

const CATEGORIES = [
  'Travel',
  'Fuel / mileage',
  'Meals',
  'Accommodation',
  'Office supplies',
  'Internet / phone',
  'Other',
];
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xlsx';
const emptyEntry = () => ({
  key: crypto.randomUUID(),
  start_date: '',
  end_date: '',
  purpose: '',
  category: '',
  amount: '',
  merchant: '',
  description: '',
  reference: '',
  files: [],
});
const hasContent = (e) =>
  e.files.length ||
  [
    'start_date',
    'end_date',
    'purpose',
    'category',
    'amount',
    'merchant',
    'description',
    'reference',
  ].some((k) => e[k]);

export default function Expenses() {
  const { pathname } = useLocation();
  const { data, error, reload } = useApi('/expenses');
  const detailId = pathname.match(/^\/expenses\/(\d+)(?:\/reimburse)?$/)?.[1];
  if (detailId)
    return (
      <ExpenseDetails
        id={detailId}
        reimbursing={pathname.endsWith('/reimburse')}
        onChanged={reload}
      />
    );
  const isEditor = pathname === '/expenses/new' || pathname === '/expenses/bulk';
  if (pathname === '/expenses/approvals' && data?.canReview)
    return <ExpenseAdminList data={data} />;
  if (isEditor || (pathname === '/expenses' && data?.canReview))
    return (
      <ExpenseEditor
        key={pathname}
        bulk={pathname === '/expenses/bulk'}
        canReview={data?.canReview}
        onSaved={reload}
      />
    );
  return data?.canReview ? (
    <ExpenseAdminList data={data} />
  ) : (
    <ExpenseList data={data} error={error} reload={reload} />
  );
}

function ExpenseList({ data, error, reload }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(false);
    };
    const escape = (e) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const items = (data?.items || []).filter(
    (e) =>
      (status === 'All' || e.status === status) &&
      [
        expenseNumber(e),
        e.details?.purpose,
        e.note,
        e.details?.category,
        e.details?.merchant,
        e.details?.reference,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section className="expenses-page">
      <div className="page-head">
        <div>
          <h1>Expenses</h1>
          <div className="sub">Your expenses, receipts and reimbursement status in one place.</div>
        </div>
      </div>
      <ExpenseAdvances showCreate={false} />
      <div className="expense-workspace">
        <div className="expense-toolbar">
          <div className="expense-list-tabs" role="tablist" aria-label="Expense status">
            {['All', 'Pending', 'Approved', 'Reimbursed', 'Rejected'].map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={status === s}
                className={status === s ? 'active' : ''}
                onClick={() => setStatus(s)}
              >
                {s === 'All' ? 'All Expenses' : s}
              </button>
            ))}
          </div>
          <div className="expense-new" ref={menuRef}>
            <Link className="btn primary" to="/expenses/new">
              <Plus size={16} /> New Expense
            </Link>
            <Button
              variant="primary"
              aria-label="More expense options"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <ChevronDown size={16} />
            </Button>
            {menu && (
              <div className="expense-new-menu" role="menu">
                <Link role="menuitem" to="/expenses/new">
                  <Receipt size={16} /> Add Expense
                </Link>
                <Link role="menuitem" to="/expenses/bulk">
                  <FileText size={16} /> Bulk Add Expenses
                </Link>
              </div>
            )}
          </div>
        </div>
        <div className="expense-search-row">
          <div className="expense-search">
            <Search size={16} />
            <input
              aria-label="Search expenses"
              placeholder="Search expense number, merchant or business name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span className="small muted">
            {items.length} expense{items.length === 1 ? '' : 's'}
          </span>
        </div>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        {data && (
          <div className="expense-table-scroll">
            <table className="table expense-table">
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Expense number</th>
                  <th>Expense details</th>
                  <th>Merchant</th>
                  <th className="num">Amount</th>
                  <th>Business name / Purpose</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr
                    key={e.id}
                    className="expense-list-row"
                    onClick={() => navigate('/expenses/' + e.id)}
                  >
                    <td>
                      <Link
                        className="expense-number-link"
                        to={'/expenses/' + e.id}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {expenseNumber(e)}
                      </Link>
                    </td>
                    <td>
                      <div className="expense-detail-cell">
                        <ExpenseFileIcon name={expenseFiles(e)[0]?.name} />
                        <div>
                          <div>{fmtDate(e.details?.start_date || e.created_at)}</div>
                          <Link
                            className="expense-category"
                            to={'/expenses/' + e.id}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {e.details?.category || 'Expense'}
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="expense-cell-text" title={e.details?.merchant || ''}>
                        {e.details?.merchant || '—'}
                      </span>
                    </td>
                    <td className="num expense-money">{expenseMoney(e.amount)}</td>
                    <td>
                      <span
                        className="expense-cell-text"
                        title={e.details?.purpose || e.note || ''}
                      >
                        {e.details?.purpose || e.note || '—'}
                      </span>
                    </td>
                    <td>
                      <Badge>{e.status === 'Pending' ? 'Pending Accounts' : e.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && (
              <div className="expense-empty">
                <Empty
                  icon={Receipt}
                  text={
                    query || status !== 'All'
                      ? 'No expenses match your filters'
                      : 'No expenses yet. Add your first expense to get started.'
                  }
                />
                {!query && status === 'All' && (
                  <Link className="btn primary" to="/expenses/new">
                    <Plus size={16} /> Add Expense
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
        {!!items.length && (
          <div className="expense-list-total">
            <span>Total shown</span>
            <strong>{expenseMoney(items.reduce((sum, e) => sum + Number(e.amount), 0))}</strong>
          </div>
        )}
      </div>
    </section>
  );
}

function MerchantInput({ value, onChange, merchants, id }) {
  return (
    <>
      <Input
        aria-label="Merchant"
        list={id}
        maxLength={120}
        placeholder="Select or type to add"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      <datalist id={id}>
        {merchants.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

function ReceiptPicker({ entry, onChange, large = false, disabled }) {
  const { toast } = useApp();
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const add = (list) => {
    const incoming = Array.from(list || []);
    if (
      entry.files.length + incoming.length > 10 ||
      incoming.some(
        (f) => f.size > 10 * 1024 * 1024 || !/\.(jpe?g|png|webp|pdf|docx?|xlsx)$/i.test(f.name),
      )
    ) {
      toast('Choose up to 10 images, PDF, Word or Excel files, each 10 MB or smaller.', 'error');
      return;
    }
    onChange([...entry.files, ...incoming]);
  };
  return (
    <div className={large ? 'expense-receipts-panel' : 'expense-bulk-receipts'}>
      <input
        ref={input}
        type="file"
        aria-label="Attach receipts"
        accept={ACCEPT}
        multiple
        disabled={disabled}
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className={'expense-upload ' + (dragging ? 'dragging' : '')}
        onClick={() => input.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
      >
        {large ? (
          <>
            <span className="expense-upload-icon">
              <Upload size={25} />
            </span>
            <strong>Attach receipts</strong>
            <span>
              Drop files here or <span className="expense-category">browse your computer</span>
            </span>
            <small>Images, PDF, Word or Excel · Up to 10 MB each</small>
          </>
        ) : (
          <Plus size={18} />
        )}
      </button>
      {!!entry.files.length && (
        <ul className="expense-file-list">
          {entry.files.map((f, i) => (
            <li key={i}>
              <FileText size={16} />
              <span title={f.name}>{f.name}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={'Remove ' + f.name}
                onClick={() => onChange(entry.files.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExpenseEditor({ bulk, canReview, onSaved }) {
  const { meta, toast } = useApp();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [bulkMode, setBulkMode] = useState(() =>
    search.includes('advance=1') ? 'advances' : 'expenses',
  );
  const { data: merchantData, reload: reloadMerchants } = useApi('/expenses/merchants');
  const { data: advanceData } = useApi('/expenses/advances');
  const [advanceId, setAdvanceId] = useState(
    () => new URLSearchParams(search).get('advance') || '',
  );
  const [entries, setEntries] = useState(() => Array.from({ length: bulk ? 5 : 1 }, emptyEntry));
  const [report, setReport] = useState('');
  const [run, busy] = useAction(toast);
  const [confirm, confirmEl] = useConfirm();
  const saved = useRef(false);
  const dirty = !!report || entries.some(hasContent);
  const change = (i, key, value) =>
    setEntries((old) => old.map((e, j) => (i === j ? { ...e, [key]: value } : e)));
  const leave = async (path) => {
    if (busy) return;
    if (
      !dirty ||
      (await confirm({
        title: 'Leave this page?',
        text: 'If you leave this page, your unsaved expense changes will be lost.',
        confirmLabel: 'Leave this page',
      }))
    )
      navigate(path);
  };
  useEffect(() => {
    const unload = (e) => {
      if (dirty && !saved.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const link = (e) => {
      const a = e.target.closest('a[href]');
      if (!a || !dirty || saved.current || a.target === '_blank') return;
      const url = new URL(a.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        url.search !== window.location.search
      ) {
        e.preventDefault();
        e.stopPropagation();
        leave(url.pathname + url.search);
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', link, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', link, true);
    };
  }, [dirty, busy, confirm]);
  const save = async (keepOpen) => {
    const ok = await run(
      async () => {
        const active = bulk ? entries.filter((e) => hasContent(e)) : entries;
        if (!active.length) throw new Error('Add at least one expense.');
        if (active.reduce((n, e) => n + e.files.length, 0) > 30)
          throw new Error('Attach at most 30 files in one submission.');
        const form = new FormData();
        let index = 0;
        const payload = active.map((e, i) => {
          const end = e.end_date || e.start_date;
          const purpose = e.purpose.trim() || report.trim() || e.description.trim() || e.category;
          if (
            !e.start_date ||
            !end ||
            end < e.start_date ||
            end > meta.today ||
            !e.category ||
            !Number.isInteger(Number(e.amount)) ||
            Number(e.amount) < 1 ||
            Number(e.amount) > 10000000
          )
            throw new Error(
              'Expense ' +
                (i + 1) +
                ': enter a valid date, category and whole-rupee amount between 1 and 1,00,00,000.',
            );
          return {
            ...e,
            purpose,
            merchant: e.merchant.trim(),
            end_date: end,
            files: e.files.map((file) => {
              form.append('proofs', file);
              return index++;
            }),
          };
        });
        form.append('entries', JSON.stringify(payload));
        if (bulk && advanceId) form.append('advance_id', advanceId);
        await api('/expenses', { method: 'POST', form });
        return true;
      },
      bulk && advanceId ? 'Expenses added to your advance' : 'Expense claims sent to Accounts',
    );
    if (ok) {
      onSaved();
      reloadMerchants();
      if (keepOpen) {
        setEntries([emptyEntry()]);
        setReport('');
      } else {
        saved.current = true;
        navigate(canReview ? '/expenses/approvals' : '/expenses');
      }
    }
  };
  const merchants = [
    ...new Set([
      ...(merchantData?.items || []),
      ...entries.map((e) => e.merchant.trim()).filter(Boolean),
    ]),
  ];
  const merchant = (e, i) => (
    <MerchantInput
      value={e.merchant}
      onChange={(v) => change(i, 'merchant', v)}
      merchants={merchants}
      id={'expense-merchants-' + e.key}
    />
  );
  const category = (e, i) => (
    <Select
      aria-label="Category"
      placeholder="Select category"
      options={CATEGORIES}
      value={e.category}
      onChange={(v) => change(i, 'category', v.target.value)}
    />
  );
  const date = (e, i) => (
    <Input
      aria-label="Expense date"
      type="date"
      max={meta.today}
      value={e.start_date}
      onChange={(v) => change(i, 'start_date', v.target.value)}
    />
  );
  const amount = (e, i) => (
    <div className="expense-amount">
      <span>INR</span>
      <Input
        aria-label="Amount"
        type="number"
        min="1"
        max="10000000"
        step="1"
        placeholder="0"
        value={e.amount}
        onChange={(v) => change(i, 'amount', v.target.value)}
      />
    </div>
  );
  return (
    <section className="expense-editor">
      <header className="expense-editor-head">
        <div className="expense-list-tabs" role="tablist" aria-label="Expense entry type">
          <button
            role="tab"
            aria-selected={!bulk}
            className={!bulk ? 'active' : ''}
            disabled={busy}
            onClick={() => bulk && leave('/expenses/new')}
          >
            <Receipt size={16} /> Add Expense
          </button>
          <button
            role="tab"
            aria-selected={bulk && bulkMode === 'expenses'}
            className={bulk && bulkMode === 'expenses' ? 'active' : ''}
            disabled={busy}
            onClick={() => (bulk ? setBulkMode('expenses') : leave('/expenses/bulk'))}
          >
            <FileText size={16} /> Bulk Add Expenses
          </button>
          <button
            role="tab"
            aria-selected={bulk && bulkMode === 'advances'}
            className={bulk && bulkMode === 'advances' ? 'active' : ''}
            disabled={busy}
            onClick={() => (bulk ? setBulkMode('advances') : leave('/expenses/bulk?advance=1'))}
          >
            <Plus size={16} /> Add / Track Advance
          </button>
        </div>
        <div className="row gap-8">
          {canReview && (
            <Link className="btn" to="/expenses/approvals">
              Review claims
            </Link>
          )}
          <Button
            disabled={busy}
            aria-label="Close expense form"
            onClick={() => leave(canReview ? '/expenses/approvals' : '/expenses')}
          >
            <X size={18} />
          </Button>
        </div>
      </header>
      <h1 className="sr-only">{bulk ? 'Bulk Add Expenses' : 'Add Expense'}</h1>
      {bulk && bulkMode === 'advances' ? (
        <ExpenseAdvances />
      ) : (
        <fieldset disabled={busy} className="expense-editor-fields">
          {bulk ? (
            <>
              <div className="expense-bulk-report">
                {!!advanceData?.items?.filter((a) => a.isOwner && a.status === 'Active').length && (
                  <Field label="Use expense advance">
                    <Select
                      value={advanceId}
                      onChange={(e) => setAdvanceId(e.target.value)}
                      options={advanceData.items
                        .filter((a) => a.isOwner && a.status === 'Active')
                        .map((a) => ({
                          value: a.id,
                          label: `Advance #${a.id} · ${a.purpose} · ${inr(a.amount - a.spent)} remaining`,
                        }))}
                      placeholder="No advance — normal reimbursement"
                    />
                  </Field>
                )}
                <Field label="Report / Business purpose (optional)">
                  <Input
                    aria-label="Report / Business purpose"
                    maxLength={200}
                    placeholder="e.g. Ahar Expo expenses"
                    value={report}
                    onChange={(e) => setReport(e.target.value)}
                  />
                </Field>
              </div>
              <div className="expense-table-scroll">
                <table className="table expense-bulk-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Receipt</th>
                      <th>Expense date *</th>
                      <th>Merchant</th>
                      <th>Category *</th>
                      <th>Amount *</th>
                      <th>Description</th>
                      <th>Reference#</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={e.key}>
                        <td data-label="Expense">{i + 1}</td>
                        <td data-label="Receipt">
                          <ReceiptPicker
                            entry={e}
                            disabled={busy}
                            onChange={(v) => change(i, 'files', v)}
                          />
                        </td>
                        <td data-label="Expense date">{date(e, i)}</td>
                        <td data-label="Merchant">{merchant(e, i)}</td>
                        <td data-label="Category">{category(e, i)}</td>
                        <td data-label="Amount">{amount(e, i)}</td>
                        <td data-label="Description">
                          <Input
                            aria-label="Description"
                            maxLength={1000}
                            value={e.description}
                            onChange={(v) => change(i, 'description', v.target.value)}
                          />
                        </td>
                        <td data-label="Reference#">
                          <Input
                            aria-label="Reference"
                            maxLength={120}
                            value={e.reference}
                            onChange={(v) => change(i, 'reference', v.target.value)}
                          />
                        </td>
                        <td data-label="Remove">
                          <Button
                            disabled={entries.length === 1}
                            aria-label={'Remove expense ' + (i + 1)}
                            onClick={async () => {
                              if (
                                !hasContent(e) ||
                                (await confirm({
                                  title: 'Remove expense?',
                                  text: 'This row and its attachments will be removed.',
                                  confirmLabel: 'Remove expense',
                                }))
                              )
                                setEntries((old) => old.filter((row) => row.key !== e.key));
                            }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="expense-add-row">
                <Button
                  icon={Plus}
                  variant="ghost"
                  disabled={entries.length >= 20}
                  onClick={() => setEntries((old) => [...old, emptyEntry()])}
                >
                  Add More Expenses
                </Button>
                <span className="small muted">Up to 20 expenses · Empty rows are skipped</span>
              </div>
            </>
          ) : (
            <div className="expense-single-layout">
              <ReceiptPicker
                large
                entry={entries[0]}
                disabled={busy}
                onChange={(v) => change(0, 'files', v)}
              />
              <div className="expense-single-fields">
                <Field label="Report / Business purpose (optional)">
                  <Input
                    aria-label="Report / Business purpose"
                    maxLength={200}
                    placeholder="e.g. Client visit to Mumbai"
                    value={entries[0].purpose}
                    onChange={(e) => change(0, 'purpose', e.target.value)}
                  />
                </Field>
                <div className="expense-field-divider" />
                <Field label="Expense date *">{date(entries[0], 0)}</Field>
                <Field label="End date (optional)">
                  <Input
                    aria-label="End date"
                    type="date"
                    min={entries[0].start_date}
                    max={meta.today}
                    value={entries[0].end_date}
                    onChange={(e) => change(0, 'end_date', e.target.value)}
                  />
                </Field>
                <Field
                  label="Merchant"
                  hint="Select a saved name or type a new one. New names are remembered after saving."
                >
                  {merchant(entries[0], 0)}
                </Field>
                <Field label="Category *">{category(entries[0], 0)}</Field>
                <div className="expense-field-divider" />
                <Field
                  label="Amount *"
                  hint="Whole rupees · Claims are reviewed by Accounts before reimbursement."
                >
                  {amount(entries[0], 0)}
                </Field>
                <Field label="Description">
                  <Textarea
                    aria-label="Description"
                    rows={3}
                    maxLength={1000}
                    value={entries[0].description}
                    onChange={(e) => change(0, 'description', e.target.value)}
                  />
                </Field>
                <Field label="Reference#">
                  <Input
                    aria-label="Reference"
                    maxLength={120}
                    value={entries[0].reference}
                    onChange={(e) => change(0, 'reference', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          )}
        </fieldset>
      )}
      {bulkMode === 'expenses' && (
        <footer className="expense-editor-footer">
          <span className="small muted">
            {bulk ? entries.filter(hasContent).length + ' expenses · ' : ''}Total:{' '}
            <strong>{inr(entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0))}</strong>
          </span>
          <div className="row gap-8">
            <Button variant="primary" loading={busy} onClick={() => save(false)}>
              {bulk && advanceId ? 'Add to Advance' : bulk ? 'Save Expenses' : 'Save and Close'}
            </Button>
            {!bulk && (
              <Button disabled={busy} onClick={() => save(true)}>
                Save and New
              </Button>
            )}
            <Button disabled={busy} onClick={() => leave('/expenses')}>
              Cancel
            </Button>
          </div>
        </footer>
      )}
      {confirmEl}
    </section>
  );
}
