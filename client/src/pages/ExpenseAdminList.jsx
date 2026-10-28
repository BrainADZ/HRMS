import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Avatar, Badge, Empty } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { expenseMoney, expenseNumber } from '../components/ExpenseFiles.jsx';
const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Awaiting Approval', value: 'Pending' },
  { label: 'Awaiting Reimbursement', value: 'Approved' },
  { label: 'Reimbursed', value: 'Reimbursed' },
  { label: 'Rejected', value: 'Rejected' },
];
export default function ExpenseAdminList({ data }) {
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const items = data.items.filter(
    (e) =>
      (status === 'all' || e.status === status) &&
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
          <h1>Expense approvals & reimbursements</h1>
          <div className="sub">Review employee claims and record completed reimbursements.</div>
        </div>
      </div>
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
          <span className="small muted">{items.length} claims</span>
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
                <th>Expense#</th>
                <th>Report name / Purpose</th>
                <th>Status</th>
                <th>Approver</th>
                <th className="num">Total</th>
                <th className="num">To be reimbursed</th>
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
                    <Link to={'/expenses/' + e.id} onClick={(event) => event.stopPropagation()}>
                      {expenseNumber(e)}
                    </Link>
                  </td>
                  <td>
                    <Link
                      className="expense-cell-text"
                      title={e.details?.purpose || e.note}
                      to={'/expenses/' + e.id}
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
                      {e.status}
                    </Badge>
                  </td>
                  <td>{e.details?.review?.by || '—'}</td>
                  <td className="num">{expenseMoney(e.amount)}</td>
                  <td className="num">
                    {expenseMoney(['Reimbursed', 'Rejected'].includes(e.status) ? 0 : e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && (
            <div className="expense-empty">
              <Empty text="No claims in this view" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
