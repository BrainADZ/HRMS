import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useWorkday, useNow, workedNow, breakNow, clockText, useOnWorkdayChange } from '../lib/workday.js';
import { fmtDay, fmtTime } from '../lib/format.js';
import { ClockActions, SessionList } from './WorkClock.jsx';
import { Loading, ErrorBox, Progress } from './ui.jsx';

export default function DailyAttendance({ data: suppliedData }) {
  const { data: fetchedData, error, reload } = useApi(suppliedData ? null : '/dashboard/me');
  const data = suppliedData || fetchedData;
  const s = useWorkday();
  const now = useNow(1000);
  useOnWorkdayChange(reload);
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.employee) return null;
  const w = s?.workday;
  const status = data.attendance.todayStatus;
  const worked = workedNow(s, now);
  const breaks = breakNow(s, now);
  const first = w?.sessions[0];
  const last = w?.sessions.at(-1);
  const title = !w ? 'Loading today’s status…' : w.openSince ? 'Working' : w.breakSince ? 'On break' : first ? 'Checked out / paused'
    : status?.code === 'L' ? `On ${status.leave?.name || 'leave'} today` : status?.code === 'H' ? 'Holiday today' : status?.code === 'WO' ? 'Weekly off today' : 'Not checked in yet';
  const summary = data.attendance.monthSummary;
  return <section className="card daily-attendance" aria-label="Today's attendance">
    <div className="row between wrap" style={{ gap: 16 }}>
      <div>
        <h2>Today's attendance</h2>
        <div className="daily-attendance-date">{fmtDay(data.today)}</div>
        <div className="daily-attendance-status" role="status">{title}</div>
      </div>
      <ClockActions light />
    </div>
    <dl className="daily-attendance-metrics">
      {[
        ['First check-in', first ? fmtTime(first.start) : '—'],
        ['Last check-out', last?.end ? fmtTime(last.end) : '—'],
        ['Worked today', w ? clockText(worked) : '—'],
        ['Break time', w ? clockText(breaks) : '—'],
        ['Daily target', w ? clockText(w.requiredMinutes, false) : '—'],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {w && <>
      <Progress value={w.requiredMinutes ? Math.min(100, worked / w.requiredMinutes * 100) : 0} color="#79e5ad" height={6} />
      <div className="small mt-8">{worked >= w.requiredMinutes ? 'Daily target reached' : `${clockText(Math.max(0, w.requiredMinutes - worked), false)} remaining`}</div>
      {first && <div className="daily-attendance-timeline">
        <h3>Today's activity</h3>
        <SessionList w={w} />
        {w.breakSince && <div className="small mt-8">On break since {fmtTime(w.breakSince)} · {clockText(breaks)} total break</div>}
      </div>}
    </>}
    <div className="row wrap daily-attendance-month">
      <span>This month:</span>
      <span>Present <b>{summary.P}</b></span><span>WFH <b>{summary.WFH}</b></span>
      <span>Half day <b>{summary.HD}</b></span><span>Leave <b>{summary.L}</b></span>
      {summary.A > 0 && <span>Absent <b>{summary.A}</b></span>}
      <Link to="/attendance">View attendance</Link>
    </div>
  </section>;
}
