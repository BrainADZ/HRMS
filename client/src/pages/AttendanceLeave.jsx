import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Tabs } from '../components/ui.jsx';
import Attendance from './Attendance.jsx';
import Leave from './Leave.jsx';

// Keep existing deep links, notification URLs and page-specific query parameters.
export default function AttendanceLeave() {
  const location = useLocation();
  const navigate = useNavigate();
  const leave = location.pathname === '/leave';
  const params = new URLSearchParams(location.search);
  if (leave && params.get('tab') === 'posh') {
    return <Navigate to={`/posh${params.has('raise') ? '?raise=1' : ''}`} replace />;
  }
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Attendance &amp; Leave</h1>
          <div className="sub">Daily attendance, work from home, leave requests, approvals and company policies.</div>
        </div>
      </div>
      <Tabs
        value={leave ? 'leave' : 'attendance'}
        onChange={(section) => navigate(section === 'leave' ? '/leave' : '/attendance')}
        tabs={[{ value: 'attendance', label: 'Attendance' }, { value: 'leave', label: 'Leave & Policies' }]}
      />
      {leave ? <Leave embedded /> : <Attendance embedded />}
    </div>
  );
}
