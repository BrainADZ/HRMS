import { useState } from 'react';
import { useApp } from '../context.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Avatar, Badge, Empty, ErrorBox } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { expenseMoney, expenseNumber } from '../components/ExpenseFiles.jsx';
import { expensePath, matchesExpenseStatus, expenseStatus } from '../lib/expense-list.js';
const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Awaiting Approval', value: 'Pending' },
  { label: 'Awaiting Reimbursement', value: 'Approved' },
  { label: 'Reimbursed', value: 'Reimbursed' },
  { label: 'Rejected', value: 'Rejected' },
  { label: 'Awaiting Acceptance', value: 'Awaiting Acceptance' },
  { label: 'Active Advances', value: 'Active' },
  { label: 'Submitted Advances', value: 'Submitted' },
  { label: 'Settled Advances', value: 'Settled' },
];
export default function ExpenseAdminList({ data, error, onRetry }) {
  const { user } = useApp();
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const items = data.items.filter(
    (e) =>
      matchesExpenseStatus(e, status) &&
      [
        expenseNumber(e),
        e.first_name,
        e.last_name,
        e.code,
        e.details?.purpose,
        e.note,
        e.details?.review?.by,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  return (
    <section className="expenses-page">
      <div className="page-head">
        <div>
          <h1>Expenses & Advances</h1>
          <div className="sub">Review employee expenses and advances.</div>
        </div>
        {!user.isOwner && (
          <div className="row gap-8">
            <Link className="btn primary" to="/expenses/new">
              Add Expense
            </Link>
            {data.canCreateAdvance && (
              <Link className="btn" to="/expenses/bulk?mode=advances">
                Add Advance
              </Link>
            )}
          </div>
        )}
      </div>
      {error && <ErrorBox error={error} onRetry={onRetry} />}
      <div className="expense-workspace">
        <div className="expense-toolbar">
          <div className="expense-list-tabs" role="tablist" aria-label="Admin expense status">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={status === f.value}
                className={status === f.value ? 'active' : ''}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="expense-search-row">
          <div className="expense-search">
            <Search size={16} />
            <input
              aria-label="Search employee expenses"
              placeholder="Search submitter, expense number or report…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span className="small muted">{items.length} records</span>
        </div>
        <div className="expense-table-scroll">
          <table className="table expense-admin-table">
            <colgroup>
              <col style={{ width: '19%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Submitter</th>
                <th>Expense / Advance#</th>
                <th>Report name / Purpose</th>
                <th>Status</th>
                <th>Approver</th>
                <th className="num">Total</th>
                <th className="num">Balance / Reimbursement</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr
                  key={expenseNumber(e)}
                  className="expense-list-row"
                  onClick={() => navigate(expensePath(e))}
                >
                  <td>
                    <div className="expense-submitter">
                      <Avatar name={e.first_name + ' ' + e.last_name} size={27} />
                      <div>
                        <strong>
                          {e.first_name} {e.last_name}
                        </strong>
                        <small>on: {fmtDate(e.created_at)}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Link to={expensePath(e)} onClick={(event) => event.stopPropagation()}>
                      {expenseNumber(e)}
                    </Link>
                  </td>
                  <td>
                    <Link
                      className="expense-cell-text"
                      title={e.details?.purpose || e.note}
                      to={expensePath(e)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {e.details?.purpose || e.note || 'Expense'}
                    </Link>
                    <div className="small muted mt-8">
                      {fmtDate(e.details?.start_date || e.created_at)}
                      {e.details?.end_date && ' – ' + fmtDate(e.details.end_date)}
                    </div>
                  </td>
                  <td>
                    <Badge
                      tone={
                        e.status === 'Reimbursed' || e.status === 'Approved'
                          ? 'green'
                          : e.status === 'Rejected'
                            ? 'red'
                            : 'amber'
                      }
                    >
                      {expenseStatus(e)}
                    </Badge>
                  </td>
                  <td>{e.isAdvance ? 'CEO / Master Admin' : e.details?.review?.by || '—'}</td>
                  <td className="num">{expenseMoney(e.amount)}</td>
                  <td className="num">
                    {expenseMoney(
                      e.isAdvance
                        ? e.status === 'Rejected'
                          ? 0
                          : e.balance
                        : ['Reimbursed', 'Rejected'].includes(e.status)
                          ? 0
                          : e.amount,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && (
            <div className="expense-empty">
              <Empty text="No expenses or advances in this view" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
