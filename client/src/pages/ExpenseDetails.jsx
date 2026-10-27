import { lazy, Suspense, useEffect, useRef, useState } from 'react';
const ExpensePdfPreview = lazy(() => import('../components/ExpensePdfPreview.jsx'));
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useApi, useAction } from '../lib/hooks.js';
import { useApp } from '../context.jsx';
import ExpenseReimbursement from './ExpenseReimbursement.jsx';
import { api, apiUrl } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { Badge, Button, Empty, ErrorBox, Loading, useConfirm } from '../components/ui.jsx';
import {
  ExpenseFileIcon,
  expenseFiles,
  expenseMoney,
  expenseNumber,
} from '../components/ExpenseFiles.jsx';

export default function ExpenseDetails({ id, reimbursing = false, onChanged }) {
  const { toast } = useApp();
  const [run, busy] = useAction(toast);
  const [confirm, confirmEl] = useConfirm();
  const { data: expense, error, reload } = useApi('/expenses/' + id);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('expenses');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!expense) return <Loading />;
  if (reimbursing)
    return (
      <ExpenseReimbursement
        expense={expense}
        onDone={() => {
          reload();
          onChanged?.();
        }}
      />
    );
  const decision = async (status) => {
    if (
      await confirm({
        title: status === 'Approved' ? 'Approve this expense?' : 'Reject this expense?',
        text: 'Confirm your decision for ' + expenseNumber(expense) + '.',
        confirmLabel: status === 'Approved' ? 'Approve' : 'Reject',
      })
    ) {
      if (
        await run(() => api.put('/expenses/' + id, { status }), 'Expense ' + status.toLowerCase())
      ) {
        reload();
        onChanged?.();
      }
    }
  };
  const files = expenseFiles(expense);
  const requested = params.get('receipt');
  const selected = requested !== null && /^\d+$/.test(requested) ? Number(requested) : -1;
  const openReceipt = (i) => setParams({ receipt: String(i) });
  const closeReceipt = () => setParams({}, { replace: true });
  const purpose = expense.details?.purpose || expense.note || 'Expense';
  const amount = expenseMoney(expense.amount);
  return (
    <section className="expense-report">
      <header className="expense-report-header">
        <div className="row gap-12">
          <Link to="/expenses" className="btn" aria-label="Back to expenses">
            <ArrowLeft size={17} />
          </Link>
          <strong>{expenseNumber(expense)}</strong>
          <Badge>{expense.status === 'Pending' ? 'Pending Accounts' : expense.status}</Badge>
        </div>
        <div className="row gap-8 expense-admin-actions">
          {expense.canAct && expense.status === 'Pending' && (
            <>
              <Button variant="primary" disabled={busy} onClick={() => decision('Approved')}>
                Approve
              </Button>
              <Button disabled={busy} onClick={() => decision('Rejected')}>
                Reject
              </Button>
            </>
          )}
          {expense.canAct && expense.status === 'Approved' && (
            <Link className="btn primary" to={'/expenses/' + id + '/reimburse'}>
              Record Reimbursement
            </Link>
          )}
          <Link to="/expenses" className="btn" aria-label="Close expense details">
            <X size={18} />
          </Link>
        </div>
      </header>
      {expense.details?.reimbursement && (
        <section className="expense-reimbursement-banner">
          <h3>Reimbursement Details</h3>
          <div>
            <Detail label="Reimbursed date">
              {fmtDate(expense.details.reimbursement.reimbursed_on)}
            </Detail>
            <Detail label="Paid through">{expense.details.reimbursement.paid_through}</Detail>
            <Detail label="Reference#">{expense.details.reimbursement.reference || '—'}</Detail>
            <Detail label="Notes">{expense.details.reimbursement.notes || '—'}</Detail>
          </div>
        </section>
      )}
      <div className="expense-report-layout">
        <main className="expense-report-main">
          <div className="expense-report-summary">
            <div>
              <h1>{purpose}</h1>
              <p>
                Duration: {fmtDate(expense.details?.start_date || expense.created_at)}
                {expense.details?.end_date && ' – ' + fmtDate(expense.details.end_date)}
              </p>
            </div>
            <div className="expense-report-amount">
              <span>Total</span>
              <strong>{amount}</strong>
            </div>
            <div className="expense-report-amount">
              <span>
                {expense.status === 'Reimbursed'
                  ? 'Reimbursed amount'
                  : expense.status === 'Rejected'
                    ? 'Rejected amount'
                    : 'To be reimbursed'}
              </span>
              <strong>{amount}</strong>
            </div>
          </div>
          <div className="expense-report-tabs" role="tablist" aria-label="Expense detail sections">
            <button
              role="tab"
              aria-selected={tab === 'expenses'}
              className={tab === 'expenses' ? 'active' : ''}
              onClick={() => setTab('expenses')}
            >
              Expenses <span>1</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === 'history'}
              className={tab === 'history' ? 'active' : ''}
              onClick={() => setTab('history')}
            >
              History
            </button>
          </div>
          {tab === 'expenses' ? (
            <>
              <div className="expense-report-item">
                <button
                  type="button"
                  className="expense-report-receipt"
                  onClick={() => files.length && openReceipt(0)}
                  disabled={!files.length}
                  aria-label={files.length ? 'Preview submitted document' : 'No receipt attached'}
                >
                  <ExpenseFileIcon large name={files[0]?.name} />
                </button>
                <div className="expense-report-item-info">
                  <div className="small">
                    {fmtDate(expense.details?.start_date || expense.created_at)}{' '}
                    <span className="muted">|</span>{' '}
                    {expense.details?.merchant || 'Merchant not specified'}
                  </div>
                  <h2>{expense.details?.category || 'Expense'}</h2>
                  {expense.details?.reference && (
                    <span className="expense-reference">
                      Reference#: {expense.details.reference}
                    </span>
                  )}
                  {expense.details?.description && (
                    <p className="small muted">{expense.details.description}</p>
                  )}
                  <div className="expense-document-buttons">
                    {files.map((file, i) => (
                      <button
                        key={file.index}
                        type="button"
                        className="link"
                        onClick={() => openReceipt(i)}
                      >
                        View {files.length > 1 ? 'document ' + (i + 1) : 'document'}
                      </button>
                    ))}
                    {!files.length && <span className="small muted">No documents attached</span>}
                  </div>
                </div>
                <strong className="expense-report-item-amount">{amount}</strong>
              </div>
              <div className="expense-report-totals">
                <div>
                  <span>Total Expense Amount</span>
                  <strong>{amount}</strong>
                </div>
                <div className="expense-total-highlight">
                  <span>
                    {expense.status === 'Reimbursed'
                      ? 'Reimbursed amount'
                      : 'Claimed reimbursement'}
                  </span>
                  <strong>{amount}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="expense-history">
              {expense.details?.review && (
                <div>
                  <span className="expense-history-dot" />
                  <div>
                    <strong>{expense.details.review.status}</strong>
                    <p>
                      {fmtDate(expense.details.review.at)} · {expense.details.review.by}
                    </p>
                  </div>
                </div>
              )}
              {expense.details?.reimbursement && (
                <div>
                  <span className="expense-history-dot" />
                  <div>
                    <strong>Reimbursement recorded</strong>
                    <p>
                      {fmtDate(expense.details.reimbursement.reimbursed_on)} ·{' '}
                      {expense.details.reimbursement.recorded_by} ·{' '}
                      {expense.details.reimbursement.paid_through}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <span className="expense-history-dot" />
                <div>
                  <strong>Expense submitted</strong>
                  <p>
                    {fmtDate(expense.created_at)} · {expense.first_name} {expense.last_name}
                  </p>
                </div>
              </div>
              <div>
                <span className="expense-history-dot" />
                <div>
                  <strong>Current status</strong>
                  <p>
                    {expense.status === 'Pending' ? 'Awaiting Accounts review' : expense.status}
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
        <aside className="expense-report-sidebar">
          <Detail label="Submitted by">
            {expense.first_name} {expense.last_name}
            {expense.code && <small>{expense.code}</small>}
          </Detail>
          <Detail label="Approver">{expense.details?.review?.by || '—'}</Detail>
          <Detail label="Business name / Purpose">{purpose}</Detail>
          <Detail label="Merchant">{expense.details?.merchant || '—'}</Detail>
          <Detail label="Category">{expense.details?.category || '—'}</Detail>
          <Detail label="Reference#">{expense.details?.reference || '—'}</Detail>
          <Detail label="Documents">
            {files.length ? (
              <div className="expense-sidebar-documents">
                {files.map((file, i) => (
                  <button type="button" key={file.index} onClick={() => openReceipt(i)}>
                    <ExpenseFileIcon name={file.name} />
                    <span>{file.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              'No documents attached'
            )}
          </Detail>
        </aside>
      </div>
      {confirmEl}
      {selected >= 0 && files[selected] && (
        <ReceiptViewer
          expense={expense}
          files={files}
          selected={selected}
          onSelect={openReceipt}
          onClose={closeReceipt}
        />
      )}
    </section>
  );
}

function Detail({ label, children }) {
  return (
    <div className="expense-meta">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function ReceiptViewer({ expense, files, selected, onSelect, onClose }) {
  const dialog = useRef(null);
  const [tab, setTab] = useState('details');
  const file = files[selected];
  const ext = file.name.split('.').pop().toLowerCase();
  const source = '/expenses/' + expense.id + '/attachments/' + file.index + '/preview';
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="expense-viewer"
      aria-label="Expense document preview"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="expense-viewer-header">
        <h2>
          Expense Details ({selected + 1} of {files.length})
        </h2>
        <Button aria-label="Close document preview" onClick={onClose}>
          <X size={18} />
        </Button>
      </header>
      <div className="expense-viewer-layout">
        <div className="expense-viewer-document">
          <div className="expense-viewer-filename">
            <ExpenseFileIcon name={file.name} />
            <span title={file.name}>{file.name}</span>
          </div>
          <div className="expense-preview-content">
            {ext === 'pdf' ? (
              <Suspense fallback={<Loading text="Loading PDF viewer…" />}>
                <ExpensePdfPreview key={source} url={apiUrl(source)} />
              </Suspense>
            ) : ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? (
              <img src={apiUrl(source)} alt={file.name} />
            ) : (
              <OfficePreview key={source} source={source} />
            )}
          </div>
          <div className="expense-viewer-controls">
            <Button
              aria-label="Previous document"
              disabled={selected === 0}
              onClick={() => onSelect(selected - 1)}
            >
              <ChevronLeft size={17} />
            </Button>
            <div className="expense-document-thumbnails">
              {files.map((f, i) => (
                <button
                  key={f.index}
                  type="button"
                  aria-label={'View document ' + (i + 1)}
                  aria-pressed={selected === i}
                  onClick={() => onSelect(i)}
                >
                  <ExpenseFileIcon name={f.name} />
                </button>
              ))}
            </div>
            <Button
              aria-label="Next document"
              disabled={selected === files.length - 1}
              onClick={() => onSelect(selected + 1)}
            >
              <ChevronRight size={17} />
            </Button>
          </div>
        </div>
        <aside className="expense-viewer-info">
          <div className="expense-viewer-summary">
            <div className="row between">
              <span>{fmtDate(expense.details?.start_date || expense.created_at)}</span>
              <Badge>{expense.status}</Badge>
            </div>
            <h3>{expense.details?.category || 'Expense'}</h3>
            <p>Merchant: {expense.details?.merchant || '—'}</p>
            <small>CLAIMED REIMBURSEMENT</small>
            <strong>{expenseMoney(expense.amount)}</strong>
          </div>
          <div className="expense-list-tabs" role="tablist" aria-label="Document information">
            <button
              role="tab"
              aria-selected={tab === 'details'}
              className={tab === 'details' ? 'active' : ''}
              onClick={() => setTab('details')}
            >
              Details
            </button>
            <button
              role="tab"
              aria-selected={tab === 'history'}
              className={tab === 'history' ? 'active' : ''}
              onClick={() => setTab('history')}
            >
              History
            </button>
          </div>
          {tab === 'details' ? (
            <div className="expense-viewer-metadata">
              <Detail label="Expense number">{expenseNumber(expense)}</Detail>
              <Detail label="Description">{expense.details?.description || '—'}</Detail>
              <Detail label="Business name / Purpose">
                {expense.details?.purpose || expense.note || '—'}
              </Detail>
              <Detail label="Reference#">{expense.details?.reference || '—'}</Detail>
              <Detail label="Submitted by">
                {expense.first_name} {expense.last_name}
              </Detail>
            </div>
          ) : (
            <div className="expense-viewer-metadata">
              <Detail label="Submitted">{fmtDate(expense.created_at)}</Detail>
              <Detail label="Current status">{expense.status}</Detail>
            </div>
          )}
        </aside>
      </div>
    </dialog>
  );
}

function OfficePreview({ source }) {
  const { data, error, reload } = useApi(source);
  const [sheetIndex, setSheetIndex] = useState(0);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading text="Preparing document preview…" />;
  if (data.kind === 'text')
    return (
      <div className="expense-word-preview">
        <p className="expense-preview-note">Document text preview</p>
        <article>{data.text || 'This document contains no readable text.'}</article>
        {data.truncated && (
          <p className="expense-preview-note">Preview limited to the first 200,000 characters.</p>
        )}
      </div>
    );
  const sheet = data.sheets?.[sheetIndex];
  return (
    <div className="expense-sheet-preview">
      <div className="expense-sheet-tabs">
        {data.sheets?.map((s, i) => (
          <button
            key={i}
            type="button"
            className={i === sheetIndex ? 'active' : ''}
            onClick={() => setSheetIndex(i)}
          >
            {s.name}
          </button>
        ))}
      </div>
      {sheet?.rows.length ? (
        <table>
          <tbody>
            {sheet.rows.map((row) => (
              <tr key={row.number}>
                <th>{row.number}</th>
                {row.cells.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty text="This sheet has no data" />
      )}
      {(data.truncated || sheet?.truncated) && (
        <p className="expense-preview-note">
          Preview shows up to 10 sheets, 500 rows and 50 columns per sheet.
        </p>
      )}
    </div>
  );
}
