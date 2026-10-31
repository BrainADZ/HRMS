import { Link } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { useApi } from '../lib/hooks.js';
import {
  useWorkday,
  useNow,
  workedNow,
  breakNow,
  clockText,
  useOnWorkdayChange,
} from '../lib/workday.js';
import { fmtDay, fmtTime } from '../lib/format.js';
import { ClockActions, SessionList } from './WorkClock.jsx';
import { Loading, ErrorBox, Progress } from './ui.jsx';

export default function DailyAttendance({ data: suppliedData, compact = false }) {
  const { data: fetchedData, error, reload } = useApi(suppliedData ? null : '/dashboard/me');
  const data = suppliedData || fetchedData;
  const { user } = useApp();
  const s = useWorkday();
  const now = useNow(1000);
  useOnWorkdayChange(reload);
  if (user.isOwner) return null;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.employee) return null;
  const w = s?.workday;
  const status = data.attendance.todayStatus;
  const worked = workedNow(s, now);
  const breaks = breakNow(s, now);
  const first = w?.sessions[0];
  const last = w?.sessions.at(-1);
  const title = s?.currentWorkStatus
    ? s.currentWorkStatus.kind === 'travel'
      ? 'Travelling'
      : 'On-site duty'
    : !w
      ? 'Loading today’s status…'
      : w.openSince
        ? w.mode === 'on_duty'
          ? w.activityType === 'travel'
            ? 'Travelling'
            : 'On duty'
          : 'Working'
        : w.breakSince
          ? 'On break'
          : first
            ? w.checkedOutAt
              ? 'Checked out'
              : 'Paused'
            : status?.code === 'L'
              ? `On ${status.leave?.name || 'leave'} today`
              : status?.code === 'H'
                ? 'Holiday today'
                : status?.code === 'WO'
                  ? 'Weekly off today'
                  : 'Not checked in yet';
  const summary = data.attendance.monthSummary;
  return (
    <section
      className={`card daily-attendance${compact ? ' compact' : ''}`}
      aria-label="Today's attendance"
    >
      <div className="row between wrap" style={{ gap: 16 }}>
        <div>
          <h2>Today's attendance</h2>
          <div className="daily-attendance-date">{fmtDay(data.today)}</div>
          <div className="daily-attendance-status" role="status">
            {title}
          </div>
        </div>
        <ClockActions light />
      </div>
      {s?.currentWorkStatus?.kind !== 'travel' && (
        <dl className="daily-attendance-metrics">
          {[
            ['First check-in', first ? fmtTime(first.start) : '—'],
            ['Last check-out', last?.end ? fmtTime(last.end) : '—'],
            ['Worked today', w ? clockText(worked) : '—'],
            ['Break time', w ? clockText(breaks) : '—'],
            ['Daily target', w ? clockText(w.requiredMinutes, false) : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {w && s?.currentWorkStatus?.kind !== 'travel' && (
        <>
          <Progress
            value={w.requiredMinutes ? Math.min(100, (worked / w.requiredMinutes) * 100) : 0}
            color="#79e5ad"
            height={6}
          />
          <div className="small mt-8">
            {worked >= w.requiredMinutes
              ? 'Daily target reached'
              : `${clockText(Math.max(0, w.requiredMinutes - worked), false)} remaining`}
          </div>
          {first && (
            <div className="daily-attendance-timeline">
              <div className="daily-attendance-activity-head">
                <h3>
                  Today's activity <span>{w.sessions.length} sessions</span>
                </h3>
                {w.sessions.length > 3 && <span className="small">Scroll to view all</span>}
              </div>
              <div
                className="daily-attendance-activity-scroll"
                tabIndex={0}
                role="region"
                aria-label="Today's activity history"
              >
                <SessionList w={w} />
              </div>
              {w.breakSince && (
                <div className="small mt-8">
                  On break since {fmtTime(w.breakSince)} · {clockText(breaks)} total break
                </div>
              )}
            </div>
          )}
        </>
      )}
      {s?.currentWorkStatus && <p className="small">{s.currentWorkStatus.reason}</p>}
      <div className="row wrap daily-attendance-month">
        <span>This month:</span>
        <span>
          Present <b>{summary.P}</b>
        </span>
        <span>
          WFH <b>{summary.WFH}</b>
        </span>
        <span>
          Half day <b>{summary.HD}</b>
        </span>
        <span>
          Leave <b>{summary.L}</b>
        </span>
        {summary.A > 0 && (
          <span>
            Absent <b>{summary.A}</b>
          </span>
        )}
        <Link to="/attendance">View attendance</Link>
      </div>
    </section>
  );
}
