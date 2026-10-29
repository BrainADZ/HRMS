import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Plus, Receipt } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useAction } from '../lib/hooks.js';
import { useApp } from '../context.jsx';
import { fmtDate } from '../lib/format.js';
import { Button, Card, Badge, Empty } from './ui.jsx';
import { ExpenseFileIcon, expenseFiles, expenseMoney, expenseNumber } from './ExpenseFiles.jsx';
import './Expenses.css';

export function ExpenseModal({ initialBulk = false }) {
  const { user } = useApp();
  if (user.isOwner) return <Navigate to="/expenses" replace />;
  return <Navigate to={initialBulk ? '/expenses/bulk' : '/expenses/new'} replace />;
}

export function ExpenseCard() {
  const { data, reload, error } = useApi('/expenses');
  const { toast, user } = useApp();
  const [run, busy] = useAction(toast);
  const items = data?.items || [];
  const visible = data?.canReview ? items : items.slice(0, 4);
  const pending = items.filter((item) => item.status === 'Pending').length;
  return (
    <Card
      className="span-5 expense-summary"
      title={data?.canReview ? 'Expense claims · Accounts review' : 'Recent expenses'}
      action={
        <Link className="link expense-summary-view" to="/expenses">
          View all <ArrowRight size={14} />
        </Link>
      }
    >
      {!user.isOwner && (
        <div className="expense-summary-actions">
          <Link className="btn primary sm" to="/expenses/new">
            <Plus size={15} /> Add Expense
          </Link>
          <Link className="btn sm" to="/expenses/bulk">
            Bulk Add Expenses
          </Link>
        </div>
      )}
      {!!items.length && (
        <div className="expense-summary-caption">
          <span>
            {items.length} claim{items.length === 1 ? '' : 's'}
          </span>
          <span>{pending} pending review</span>
        </div>
      )}
      {error && (
        <p role="alert">
          Unable to load expenses.{' '}
          <button className="link" onClick={reload}>
            Retry
          </button>
        </p>
      )}
      {!data && !error && <p className="small muted">Loading expenses…</p>}
      {data && !items.length && (
        <Empty icon={Receipt} text="Your submitted expenses will appear here" />
      )}
      <div className="expense-summary-list">
        {visible.map((c) => (
          <div key={c.id} className="expense-summary-item">
            <Link
              to={'/expenses/' + c.id}
              className="expense-summary-link"
              aria-label={'Open expense ' + expenseNumber(c)}
            >
              <ExpenseFileIcon name={expenseFiles(c)[0]?.name} />
              <div className="expense-summary-info">
                <span className="expense-summary-number">{expenseNumber(c)}</span>
                <strong title={c.details?.purpose || c.note}>
                  {c.details?.purpose || c.note || 'Expense'}
                </strong>
                <span className="expense-summary-meta">
                  {fmtDate(c.details?.start_date || c.created_at)}
                  {c.details?.category ? ' · ' + c.details.category : ''}
                  {c.details?.merchant ? ' · ' + c.details.merchant : ''}
                </span>
                {data.canReview && (
                  <span className="expense-summary-meta">
                    {c.first_name} {c.last_name} · {c.code}
                  </span>
                )}
              </div>
              <div className="expense-summary-amount">
                <strong>{expenseMoney(c.amount)}</strong>
                <Badge>{c.status === 'Pending' ? 'Pending Accounts' : c.status}</Badge>
              </div>
            </Link>
            {data.canReview && c.status === 'Pending' && c.employee_id !== user.employeeId && (
              <div className="expense-summary-review">
                {['Approved', 'Rejected'].map((status) => (
                  <Button
                    key={status}
                    size="xs"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await run(
                          () => api.put('/expenses/' + c.id, { status }),
                          'Claim ' + status.toLowerCase(),
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
      </div>
      {!data?.canReview && items.length > visible.length && (
        <Link className="expense-summary-more" to="/expenses">
          View all {items.length} expenses <ArrowRight size={14} />
        </Link>
      )}
    </Card>
  );
}
