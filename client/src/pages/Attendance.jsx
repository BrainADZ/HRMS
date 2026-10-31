import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  UserCheck,
  House,
  Clock,
  UserX,
  CalendarX,
  AlarmClock,
  CircleDashed,
  Download,
  CheckCheck,
  MapPin,
} from 'lucide-react';
import { fmtDistance } from '../lib/location.js';
import { useApp } from '../context.jsx';
import { useApi, useAction } from '../lib/hooks.js';
import { api, download } from '../lib/api.js';
import { fmtTime, fmtDay, addMonths, fmtMonth, dowOf } from '../lib/format.js';
import {
  Card,
  Kpi,
  Badge,
  Button,
  Tabs,
  Empty,
  Loading,
  ErrorBox,
  Person,
  Select,
  Input,
  Modal,
  Field,
  Textarea,
  Progress,
  Seg,
  EmployeeSelect,
} from '../components/ui.jsx';
import { VerticalFilterNote } from './Dashboard.jsx';
import { ClockActions, SessionList, ExplainModal } from '../components/WorkClock.jsx';
import {
  useWorkday,
  useNow,
  workedNow,
  clockText,
  useOnWorkdayChange,
  refreshWorkday,
} from '../lib/workday.js';

const LABEL = {
  P: 'Present',
  OD: 'On duty',
  TRV: 'Travelling',
  WFH: 'WFH',
  HD: 'Half day',
  A: 'Absent',
  L: 'On leave',
  H: 'Holiday',
  WO: 'Weekly off',
  U: 'Not marked',
  F: 'Not marked yet',
  NA: '—',
};
const TONE = {
  P: 'green',
  OD: 'blue',
  TRV: 'blue',
  WFH: 'amber',
  HD: 'amber',
  A: 'red',
  L: 'purple',
  H: 'blue',
  WO: 'gray',
  U: 'gray',
  F: 'gray',
};

export default function Attendance({ embedded = false }) {
  const [sp, setSp] = useSearchParams();
  const { isHR, isManager, isAdmin } = useApp();
  const s = useWorkday();
  const team = isHR || isManager;
  const tab = sp.get('tab') || (team ? 'today' : 'month');
  const shortCount = (s?.toExplain || 0) + (s?.toApprove || 0);
  return (
    <div>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>Attendance</h1>
            <div className="sub">
              Check-ins, work from home and the monthly register that feeds payroll.{' '}
              <VerticalFilterNote />
            </div>
          </div>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={(t) => setSp({ tab: t })}
        tabs={[
          { value: 'today', label: 'Today' },
          { value: 'month', label: team ? 'Monthly Register' : 'My Attendance' },
          ...(team ? [{ value: 'my-attendance', label: 'My Attendance' }] : []),
          { value: 'short', label: shortCount ? `Short hours (${shortCount})` : 'Short hours' },
          { value: 'corrections', label: 'Corrections' },
          { value: 'locations', label: 'Location' },
          { value: 'activity', label: 'Log' },
        ]}
      />
      {tab === 'today' && <Today />}
      {tab === 'month' && <Register />}
      {tab === 'my-attendance' && <Register personal />}
      {tab === 'short' && <ShortHours team={team || isAdmin} />}
      {tab === 'locations' && <LocationLog team={team || isAdmin} />}
      {tab === 'activity' && <ActivityLog team={team || isAdmin} />}
      {tab === 'corrections' && <Corrections />}
    </div>
  );
}

function ActivityLog({ team }) {
  const { meta, vertical } = useApp();
  const [params] = useSearchParams();
  const selectedDate = params.get('date');
  const [from, setFrom] = useState(selectedDate || meta.today);
  const [to, setTo] = useState(selectedDate || meta.today);
  useEffect(() => {
    if (selectedDate) {
      setFrom(selectedDate);
      setTo(selectedDate);
    }
  }, [selectedDate]);
  const [employee, setEmployee] = useState('');
  const query = new URLSearchParams({
    from,
    to,
    ...(employee ? { employee } : {}),
    ...(vertical ? { vertical } : {}),
  });
  const { data, error, reload } = useApi(`/attendance/activity?${query}`);
  return (
    <Card
      title="Daily activity log"
      sub="Check-ins, breaks, reasons, check-outs and total time for each day"
    >
      <div className="filters mb-16">
        <label className="small">
          From{' '}
          <Input
            type="date"
            value={from}
            max={meta.today}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="small">
          To{' '}
          <Input type="date" value={to} max={meta.today} onChange={(e) => setTo(e.target.value)} />
        </label>
        {team && (
          <EmployeeSelect
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            placeholder="All employees"
          />
        )}
      </div>
      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : !data.items.length ? (
        <Empty text="No work activity in this period" />
      ) : (
        data.items.map((item) => (
          <div
            key={`${item.employeeId}-${item.date}`}
            className="card mb-16"
            style={{ padding: 16 }}
          >
            <div className="row between wrap">
              <b>
                {team ? `${item.name} · ` : ''}
                {fmtDay(item.date)}
              </b>
              <Badge tone={item.onDuty || item.travelled ? 'blue' : undefined}>
                {item.onDuty
                  ? 'On duty'
                  : item.travelled
                    ? 'Travelling'
                    : LABEL[item.attendanceStatus] ||
                      (item.mode === 'wfh' ? 'Work from home' : 'Office')}
              </Badge>
            </div>
            <div className="small muted mt-8">
              Worked: {clockText(item.workedMinutes, false)} · Breaks:{' '}
              {clockText(item.breakMinutes, false)}
            </div>
            {item.onDuty && (
              <div className="small mt-8">On-duty time: {clockText(item.dutyMinutes, false)}</div>
            )}
            {item.workStatuses?.map((status) => (
              <div className="small mt-8" key={'status-' + status.id}>
                <b>{status.kind === 'travel' ? 'Travelling' : 'On-site duty'}</b> ·{' '}
                {fmtTime(status.start_at)}
                {status.end_at
                  ? ' → ' +
                    fmtTime(status.end_at) +
                    (status.kind === 'travel' ? ' Reached' : ' Completed')
                  : ' · In progress'}
                <div className="muted">{status.reason}</div>
              </div>
            ))}
            {item.sessions.map((session, index) => (
              <div className="small mt-8" key={index}>
                <b>{fmtTime(session.start)}</b>{' '}
                {session.mode === 'on_duty' ? 'Duty started' : 'Check-in'}{' '}
                {session.end
                  ? `→ ${fmtTime(session.end)} ${session.mode === 'on_duty' ? 'Duty completed' : session.endedBy === 'break' ? 'Break started' : 'Check-out'}`
                  : session.mode === 'on_duty'
                    ? '→ On duty'
                    : '→ Working'}
                {session.gapReason && (
                  <div className="muted">
                    Return reason: {session.gapReason}
                    {session.gapNote ? ` · ${session.gapNote}` : ''}
                  </div>
                )}
              </div>
            ))}
            {item.gaps.map((gap, index) => (
              <div className="small muted mt-8" key={`gap-${index}`}>
                Break {fmtTime(gap.from)}–{fmtTime(gap.to)} · {clockText(gap.minutes, false)}
                {gap.reason ? ` · ${gap.reason}` : ''}
                {gap.note ? ` · ${gap.note}` : ''}
              </div>
            ))}
          </div>
        ))
      )}
    </Card>
  );
}

function Corrections() {
  const { user, meta, toast } = useApp();
  const { data, error, reload } = useApi('/attendance/corrections');
  const [day, setDay] = useState(meta.today);
  const [status, setStatus] = useState('P');
  const [reason, setReason] = useState('');
  const [run, busy] = useAction(toast);
  const decide = async (row, action) => {
    if (
      await run(
        () => api.post(`/attendance/corrections/${row.id}/decision`, { action }),
        'Decision recorded',
      )
    ) {
      reload();
      refreshWorkday();
    }
  };
  return (
    <div>
      {user.employeeId && (
        <Card title="Request an attendance correction">
          <form
            className="row wrap"
            style={{ gap: 12 }}
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await run(
                  () => api.post('/attendance/corrections', { date: day, status, reason }),
                  'Correction requested',
                )
              ) {
                setReason('');
                reload();
              }
            }}
          >
            <input
              aria-label="Correction date"
              type="date"
              className="input"
              required
              max={meta.today}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
            <select
              aria-label="Requested attendance"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {['P', 'WFH', 'HD', 'A'].map((code) => (
                <option key={code} value={code}>
                  {LABEL[code]}
                </option>
              ))}
            </select>
            <input
              aria-label="Correction reason"
              className="input grow"
              required
              maxLength={1000}
              placeholder="Reason for correction"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={busy}>
              Request correction
            </Button>
          </form>
          <p className="small muted">
            Requests correct the attendance status. Recorded work-clock times remain in the audit
            history. Approved or paid payroll periods require a later-period payroll adjustment.
          </p>
        </Card>
      )}
      {error && <ErrorBox error={error} onRetry={reload} />}
      <Card title="Correction requests">
        {!data ? (
          <Loading />
        ) : !data.items.length ? (
          <Empty text="No correction requests" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Employee / date</th>
                <th>Requested</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.name}
                    <div className="small muted">
                      {row.code} · {row.date}
                    </div>
                  </td>
                  <td>{LABEL[row.requested_status]}</td>
                  <td>{row.reason}</td>
                  <td>
                    <Badge>{row.status}</Badge>
                  </td>
                  <td>
                    {row.canDecide ? (
                      <div className="row gap-6">
                        <Button size="xs" loading={busy} onClick={() => decide(row, 'approve')}>
                          Approve
                        </Button>
                        <Button size="xs" loading={busy} onClick={() => decide(row, 'reject')}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      row.decision_note || '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Today() {
  const { toast, vertical, isHR, isManager } = useApp();
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useApi(
    `/attendance/today${vertical ? `?vertical=${vertical}` : ''}`,
  );
  const [run, busy] = useAction(toast);
  const filter = params.get('filter') || '';
  const setFilter = (next) =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next) updated.set('filter', next);
      else updated.delete('filter');
      updated.set('tab', 'today');
      return updated;
    });
  const clock = useWorkday();
  const now = useNow(1000);
  useOnWorkdayChange(reload);
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const me = data.me;
  const s = data.team?.summary;
  const rows = (data.team?.rows || []).filter(
    (r) =>
      !filter ||
      (filter === 'OD'
        ? r.onDuty
        : filter === 'late'
          ? r.late
          : filter === 'attending'
            ? ['P', 'WFH', 'HD'].includes(r.code_today)
            : filter === 'NM'
              ? ['F', 'U'].includes(r.code_today)
              : r.code_today === filter),
  );
  const mark = async (r, status) => {
    if (
      await run(
        () => api.put('/attendance', { employee_id: r.id, date: data.today, status }),
        `${r.name}: ${status ? LABEL[status] : 'cleared'}`,
      )
    )
      reload();
  };
  const unmarked = (data.team?.rows || []).filter((r) => r.code_today === 'F' && r.canMark);
  return (
    <div>
      {me && (
        <div className="card mb-16 row between wrap" style={{ gap: 14 }}>
          <div>
            <div className="small muted">
              {fmtDay(data.today)} · Late after {fmtTime(me.lateAfter)}
            </div>
            <div
              className="b7"
              style={{ fontSize: 20, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}
            >
              {me.status.travelRunning ? (
                <Badge tone="blue">Travelling</Badge>
              ) : me.status.onDuty ? (
                <>
                  <Badge tone="blue">{me.status.dutyRunning ? 'On duty' : 'Duty recorded'}</Badge> ·{' '}
                  {clockText(me.status.dutyMinutes, false)} on site
                </>
              ) : me.status.travelled ? (
                <Badge tone="blue">Reached destination</Badge>
              ) : me.record?.check_in ? (
                <>
                  Checked in at {fmtTime(me.record.check_in)}
                  {me.record.check_out && <> · out at {fmtTime(me.record.check_out)}</>}{' '}
                  {me.late && <Badge tone="amber">Late</Badge>}
                </>
              ) : ['H', 'WO'].includes(me.status.code) ? (
                LABEL[me.status.code]
              ) : me.status.code === 'L' ? (
                `On ${me.status.leave?.name}`
              ) : (
                'You have not checked in'
              )}
            </div>
            {clock?.workday?.sessions.length > 0 && (
              <>
                <div className="small muted mt-8">
                  {clock.workday.openSince
                    ? 'Working'
                    : clock.workday.breakSince
                      ? 'On break'
                      : clock.workday.checkedOutAt
                        ? 'Finished'
                        : 'Paused'}{' '}
                  ·{' '}
                  {clockText(
                    clock.workday.workedMinutes +
                      (clock.workday.openSince
                        ? Math.max(
                            0,
                            (now + (clock.offset || 0) - Date.parse(clock.workday.openSince)) /
                              60000,
                          )
                        : 0),
                    false,
                  )}{' '}
                  of {clockText(clock.workday.requiredMinutes, false)} today
                </div>
                <details className="mt-12">
                  <summary className="small link">
                    Today’s activity ({clock.workday.sessions.length} sessions)
                  </summary>
                  <SessionList w={clock.workday} />
                </details>
              </>
            )}
          </div>
          <ClockActions />
        </div>
      )}
      {s && (
        <>
          <div className="attendance-summary">
            <div className="kpis attendance-kpis">
              <Kpi
                icon={UserCheck}
                tone="green"
                label="Present"
                value={s.present}
                onClick={() => setFilter(filter === 'P' ? '' : 'P')}
              />
              <Kpi
                icon={House}
                tone="amber"
                label="Work From Home"
                value={s.wfh}
                onClick={() => setFilter(filter === 'WFH' ? '' : 'WFH')}
              />
              <Kpi
                icon={CalendarX}
                tone="purple"
                label="On Leave"
                value={s.onLeave}
                onClick={() => setFilter(filter === 'L' ? '' : 'L')}
              />
              <Kpi
                icon={UserX}
                tone="red"
                label="Absent"
                value={s.absent}
                onClick={() => setFilter(filter === 'A' ? '' : 'A')}
              />
              <Kpi
                icon={CircleDashed}
                tone="gray"
                label="Not Marked"
                value={s.notMarked}
                onClick={() => setFilter(filter === 'NM' ? '' : 'NM')}
              />
              <Kpi
                icon={AlarmClock}
                tone="red"
                label="Late Check-ins"
                value={s.late}
                onClick={() => setFilter(filter === 'late' ? '' : 'late')}
              />
            </div>
          </div>
          <Card
            flush
            title={
              <>
                {isHR ? 'Everyone' : 'My team'} today{' '}
                {filter && (
                  <Badge tone="blue">
                    {filter === 'NM'
                      ? 'Not marked'
                      : filter === 'late'
                        ? 'Late'
                        : filter === 'attending'
                          ? 'Attending'
                          : LABEL[filter]}{' '}
                    <button
                      type="button"
                      style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }}
                      onClick={() => setFilter('')}
                    >
                      ✕
                    </button>
                  </Badge>
                )}
              </>
            }
            action={
              (isHR || isManager) &&
              unmarked.length > 0 && (
                <Button
                  size="sm"
                  icon={CheckCheck}
                  loading={busy}
                  style={{ marginRight: 18 }}
                  onClick={async () => {
                    if (
                      await run(
                        () =>
                          api.post('/attendance/bulk', {
                            date: data.today,
                            status: 'P',
                            employee_ids: unmarked.map((r) => r.id),
                          }),
                        (o) => `Marked ${o.count} present`,
                      )
                    )
                      reload();
                  }}
                >
                  Mark {unmarked.length} unmarked present
                </Button>
              )
            }
          >
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 18 }}>Employee</th>
                    <th className="hide-sm">Department</th>
                    <th>Status</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 18 }}>
                        <Person
                          name={r.name}
                          sub={r.designation}
                          id={r.id}
                          hasPhoto={r.has_photo}
                          size={32}
                        />
                      </td>
                      <td className="hide-sm small muted">
                        {r.vertical} • {r.department}
                      </td>
                      <td>
                        <Badge
                          tone={TONE[r.travelRunning ? 'TRV' : r.onDuty ? 'OD' : r.code_today]}
                        >
                          {r.travelRunning
                            ? 'Travelling'
                            : r.onDuty
                              ? 'On duty'
                              : r.code_today === 'L'
                                ? r.leave
                                : LABEL[r.code_today]}
                        </Badge>
                        {r.onDuty && (
                          <div className="small muted mt-8">
                            {clockText(r.dutyMinutes, false)} ·{' '}
                            {r.dutyRunning ? 'In progress' : 'Recorded'}
                          </div>
                        )}
                        {r.code_today === 'L' && r.leaveReason && (
                          <div className="small muted mt-8">{r.leaveReason}</div>
                        )}
                      </td>
                      <td className="small">
                        {r.checkIn ? (
                          <>
                            {fmtTime(r.checkIn)} {r.late && <Badge tone="amber">Late</Badge>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="small">{r.checkOut ? fmtTime(r.checkOut) : '—'}</td>
                      <td className="right" style={{ paddingRight: 18 }}>
                        {r.canMark &&
                          !r.dutyRunning &&
                          !['L', 'H', 'WO'].includes(r.code_today) && (
                            <select
                              className="select sm"
                              style={{ width: 120 }}
                              value={
                                ['P', 'WFH', 'HD', 'A'].includes(r.code_today) ? r.code_today : ''
                              }
                              onChange={(e) => mark(r, e.target.value || null)}
                              aria-label={`Mark ${r.name}`}
                            >
                              <option value="">Mark…</option>
                              <option value="P">Present</option>
                              <option value="WFH">WFH</option>
                              <option value="HD">Half day</option>
                              <option value="A">Absent</option>
                            </select>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <Empty text="No one in this view" />}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Register({ personal = false }) {
  const { meta, toast, vertical, isHR, isManager } = useApp();
  const [month, setMonth] = useState(meta.today.slice(0, 7));
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const { data, error, reload, setData } = useApi(
    `/attendance/register?month=${month}${personal ? '&self=1' : `${vertical ? `&vertical=${vertical}` : ''}${dept ? `&department=${dept}` : ''}`}`,
  );
  const [pick, setPick] = useState(null);
  const [run, busy] = useAction(toast);
  const rows = useMemo(
    () => (data?.rows || []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  const close = useCallback(() => setPick(null), []);
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const team = !personal && (isHR || isManager);
  const setMark = async (row, date, status) => {
    setPick(null);
    const ok = await run(() => api.put('/attendance', { employee_id: row.id, date, status }));
    if (ok) {
      setData((d) => ({
        ...d,
        rows: d.rows.map((r) =>
          r.id !== row.id
            ? r
            : {
                ...r,
                days: r.days.map((x) =>
                  x.date !== date ? x : { ...x, code: status || (date < d.today ? 'U' : 'F') },
                ),
              },
        ),
      }));
      reload();
    }
  };
  return (
    <div>
      <div className="row wrap mb-16" style={{ gap: 10 }}>
        <Button
          size="sm"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Previous month"
        >
          ‹
        </Button>
        <b style={{ minWidth: 130, textAlign: 'center' }}>{fmtMonth(month)}</b>
        <Button size="sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          ›
        </Button>
        {team && (
          <Select
            className="sm"
            style={{ width: 180 }}
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            placeholder="All Departments"
            options={meta.departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        )}
        {team && (
          <Input
            className="sm"
            style={{ width: 200 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employee"
          />
        )}
        <span className="grow" />
        {isHR && !personal && (
          <Button
            size="sm"
            icon={Download}
            onClick={() =>
              download(
                `/attendance/export.csv?month=${month}${vertical ? `&vertical=${vertical}` : ''}`,
              )
            }
          >
            Export CSV
          </Button>
        )}
      </div>
      <div className="row wrap small mb-12" style={{ gap: 10 }}>
        {['P', 'OD', 'TRV', 'WFH', 'HD', 'A', 'L', 'H', 'U'].map((c) => (
          <span key={c} className="row gap-4">
            <span
              className={`cell c-${c}`}
              style={{
                width: 22,
                height: 18,
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              {c === 'U' ? '·' : c === 'L' ? 'L' : c.slice(0, 2)}
            </span>
            {LABEL[c]}
          </span>
        ))}
        {team && (
          <span className="muted">
            · Click a past day to change it. Unmarked past days are paid as{' '}
            {data?.unmarkedAs || 'present'}.
          </span>
        )}
      </div>
      {!data ? (
        <Loading />
      ) : !team ? (
        <PersonalAttendance rows={rows} data={data} />
      ) : (
        <EmployeeRegisterCards rows={rows} data={data} onPick={setPick} />
      )}
      {pick && (
        <Modal title={`Mark attendance · ${pick.row.name}`} size="narrow" onClose={close}>
          <p className="small muted mb-12">
            {fmtDay(pick.date)} ·{' '}
            {LABEL[pick.row.days.find((day) => day.date === pick.date)?.code] || 'Not marked'}
          </p>
          <div className="row wrap gap-8">
            {['P', 'WFH', 'HD', 'A'].map((code) => (
              <Button key={code} disabled={busy} onClick={() => setMark(pick.row, pick.date, code)}>
                {LABEL[code]}
              </Button>
            ))}
            <Button disabled={busy} onClick={() => setMark(pick.row, pick.date, null)}>
              Clear
            </Button>
          </div>
        </Modal>
      )}
      <div className="small muted mt-12">
        <Clock size={13} style={{ verticalAlign: -2 }} /> LOP = loss-of-pay days used by payroll
        (absent, half days, unpaid leave).
      </div>
    </div>
  );
}

function EmployeeRegisterCards({ rows, data, onPick }) {
  const offset = data.days.length ? (new Date(`${data.days[0]}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  return (
    <div className="employee-register">
      <div className="employee-register-grid">
        {rows.map((row) => (
          <section
            key={row.id}
            className="card employee-register-card"
            aria-label={`${row.name} attendance`}
          >
            <div className="employee-register-heading">
              <Person
                name={row.name}
                sub={row.code}
                id={row.id}
                hasPhoto={row.has_photo}
                size={30}
              />
              <div className="xs muted">{data.label}</div>
            </div>
            <div className="employee-register-calendar" aria-label={`${row.name} monthly calendar`}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                <span key={`week-${index}`} className="employee-register-weekday">
                  {day}
                </span>
              ))}
              {Array.from({ length: offset }, (_, index) => (
                <span key={`blank-${index}`} aria-hidden="true" />
              ))}
              {row.days.map((day) => {
                const canMark =
                  row.canMark &&
                  day.date <= data.today &&
                  !['H', 'WO', 'L', 'NA'].includes(day.code);
                const label = `${row.name}, ${day.date}: ${day.onDuty ? 'On duty' : day.travelled ? 'Travelling' : day.code === 'L' ? day.leave : LABEL[day.code] || day.code}${day.in ? ` · in ${day.in}` : ''}${day.out ? ` · out ${day.out}` : ''}${day.late ? ' · late' : ''}`;
                const code = day.onDuty
                  ? 'OD'
                  : day.travelled
                    ? 'TRV'
                    : day.code === 'L'
                      ? day.leave || 'L'
                      : ['U', 'F', 'NA'].includes(day.code)
                        ? '—'
                        : day.code;
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={`employee-register-day c-${day.onDuty ? 'OD' : day.travelled ? 'TRV' : day.code} ${day.date === data.today ? 'is-today' : ''} ${day.late ? 'is-late' : ''}`}
                    title={label}
                    aria-label={label}
                    disabled={!canMark}
                    onClick={() => onPick({ row, date: day.date })}
                  >
                    <time dateTime={day.date}>{Number(day.date.slice(8))}</time>
                    <span>{code}</span>
                  </button>
                );
              })}
            </div>
            <div className="employee-register-totals">
              <span>
                Present <b>{row.summary.P}</b>
              </span>
              <span>
                On duty <b>{row.summary.onDuty || 0}</b> · WFH <b>{row.summary.WFH}</b>
              </span>
              <span>
                Leave <b>{row.summary.L}</b>
              </span>
              <span>
                Absent <b>{row.summary.A}</b>
              </span>
              <span>
                LOP <b>{row.summary.lop}</b>
              </span>
            </div>
          </section>
        ))}
      </div>
      {!rows.length && <Empty text="No employees match these filters" />}
    </div>
  );
}

function PersonalAttendance({ rows, data }) {
  const navigate = useNavigate();
  return (
    <div className="personal-attendance">
      {rows.map((row) => {
        const offset = (new Date(`${data.days[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
        return (
          <Card key={row.id} title="My attendance" sub={data.label}>
            <div className="row wrap gap-12 mb-16 small">
              <span>
                Present <b>{row.summary.P}</b>
              </span>
              <span>
                On duty <b>{row.summary.onDuty || 0}</b> · WFH <b>{row.summary.WFH}</b>
              </span>
              <span>
                Leave <b>{row.summary.L}</b>
              </span>
              <span>
                Absent <b>{row.summary.A}</b>
              </span>
              <span>
                LOP <b>{row.summary.lop}</b>
              </span>
            </div>
            <div className="attendance-calendar" aria-label="Monthly attendance calendar">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="attendance-weekday">
                  {day}
                </div>
              ))}
              {Array.from({ length: offset }, (_, index) => (
                <div key={`space-${index}`} aria-hidden="true" />
              ))}
              {row.days.map((day) => (
                <button
                  type="button"
                  key={day.date}
                  className={`attendance-day ${day.date === data.today ? 'is-today' : ''} ${['H', 'WO'].includes(day.code) ? 'is-off' : ''}`}
                  aria-label={`${day.date}: ${day.onDuty ? 'On duty' : LABEL[day.code] || day.code}`}
                  onClick={() => navigate(`/attendance?tab=activity&date=${day.date}`)}
                >
                  <time dateTime={day.date}>{Number(day.date.slice(8))}</time>
                  <Badge tone={TONE[day.onDuty ? 'OD' : day.code]}>
                    {day.onDuty
                      ? 'On duty'
                      : day.travelled
                        ? 'Travelling'
                        : day.code === 'L'
                          ? day.leave || 'On leave'
                          : LABEL[day.code] || day.code}
                  </Badge>
                  {(day.in || day.out) && (
                    <div className="attendance-day-times">
                      <span>In {day.in || '—'}</span>
                      <span>Out {day.out || '—'}</span>
                    </div>
                  )}
                  {day.late && <span className="xs amber">Late</span>}
                </button>
              ))}
            </div>
          </Card>
        );
      })}
      {!rows.length && <Empty text="No attendance records for this month" />}
    </div>
  );
}

// ---------- short hours ----------
const SHORT_TONE = {
  'Awaiting explanation': 'amber',
  'Pending approval': 'blue',
  Approved: 'green',
  Rejected: 'red',
};

function Worked({ x }) {
  if (x.kind === 'absence') return <Badge tone="red">Absent · No attendance</Badge>;
  return (
    <div style={{ minWidth: 120 }}>
      <div className="small b6" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {clockText(x.worked_minutes, false)}{' '}
        <span className="muted" style={{ fontWeight: 400 }}>
          of {clockText(x.required_minutes, false)}
        </span>
      </div>
      <Progress
        value={(x.worked_minutes / x.required_minutes) * 100}
        color="var(--amber)"
        height={5}
      />
    </div>
  );
}

const awaySummary = (x) =>
  x.gaps.length
    ? x.gaps
        .map((g) => `${clockText(g.minutes, false)}${g.reason ? ` ${g.reason.toLowerCase()}` : ''}`)
        .join(', ')
    : x.sessions.length === 1 && x.sessions[0].end
      ? `Left at ${fmtTime(x.sessions[0].end)}`
      : '—';

function DecideModal({ item, action, onClose, onDone }) {
  const { toast } = useApp();
  const [note, setNote] = useState('');
  const [run, busy] = useAction(toast);
  const approve = action === 'approve';
  return (
    <Modal
      title={`${approve ? 'Approve' : 'Reject'} short hours`}
      size="narrow"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={approve ? 'primary' : 'solid-red'}
            loading={busy}
            disabled={!approve && !note.trim()}
            onClick={async () => {
              if (
                await run(
                  () => api.post(`/attendance/short-hours/${item.id}/decide`, { action, note }),
                  item.kind === 'absence'
                    ? 'Absence reason reviewed. Attendance is unchanged.'
                    : approve
                      ? 'Approved. The day counts in full.'
                      : 'Rejected. The day is marked as a half day.',
                )
              ) {
                onDone();
                onClose();
              }
            }}
          >
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <div>
          <b>{item.name}</b> · {fmtDay(item.date)} · worked {clockText(item.worked_minutes, false)}{' '}
          of {clockText(item.required_minutes, false)}
        </div>
        <SessionList w={{ sessions: item.sessions, gaps: item.gaps }} />
        <div className="alert info">
          <span>{item.reason ? <>“{item.reason}”</> : 'No explanation yet.'}</span>
        </div>
        <div className="small muted">
          {item.kind === 'absence'
            ? 'This reviews the reason. Attendance stays Absent unless an attendance correction is approved.'
            : approve
              ? 'The day will count as a full working day.'
              : 'The day will be marked as a half day (half a day of loss of pay).'}
        </div>
        <Field label={approve ? 'Note (optional)' : 'Reason for rejecting'}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}

function ShortHours({ team }) {
  const { user, isHR, isAdmin } = useApp();
  const [status, setStatus] = useState('open');
  const mine = useApi(user.employeeId ? '/attendance/short-hours?view=mine' : null);
  const others = useApi(
    team ? `/attendance/short-hours?view=team${status === 'open' ? '&status=open' : ''}` : null,
  );
  const [explain, setExplain] = useState(null);
  const [decide, setDecide] = useState(null);
  const reloadAll = () => {
    mine.reload();
    others.reload();
    refreshWorkday().catch(() => {});
  };
  const required = mine.data?.required || others.data?.required || '8h 00m';
  const readOnly = isHR && !isAdmin;
  return (
    <div>
      <div className="alert info mb-16">
        <Clock size={16} />
        <span>
          A working day with less than <b>{required}</b> is flagged the next morning. The employee
          explains why; their reporting manager or the CEO approves it (the day counts in full) or
          rejects it (the day becomes a half day).
        </span>
      </div>
      {user.employeeId && (
        <Card title="My short days" className="mb-16" flush>
          {!mine.data ? (
            <Loading />
          ) : !mine.data.items.length ? (
            <Empty
              icon={CheckCheck}
              text="No short days. Every working day met the required hours."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Worked</th>
                    <th className="hide-sm">Time away</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {mine.data.items.map((x) => (
                    <tr key={x.id}>
                      <td className="b6" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDay(x.date)}
                      </td>
                      <td>
                        <Worked x={x} />
                      </td>
                      <td className="hide-sm small">{awaySummary(x)}</td>
                      <td className="small" style={{ maxWidth: 320 }}>
                        {x.reason || <span className="muted">Not explained yet</span>}
                        {x.decision_note && (
                          <div className="xs muted mt-8">
                            {x.decidedByName}: {x.decision_note}
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge tone={SHORT_TONE[x.status]}>{x.status}</Badge>
                        {x.decidedByName && !x.decision_note && (
                          <div className="xs muted mt-8">by {x.decidedByName}</div>
                        )}
                      </td>
                      <td className="right">
                        {x.canExplain && (
                          <Button
                            size="sm"
                            variant={x.status === 'Awaiting explanation' ? 'primary' : ''}
                            onClick={() => setExplain(x)}
                          >
                            {x.reason ? 'Edit reason' : 'Explain'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {team && (
        <Card
          title={
            readOnly
              ? 'Short days across the company'
              : isAdmin
                ? 'Short days to approve'
                : 'Your team’s short days'
          }
          sub={readOnly ? 'Reporting managers and the CEO approve these.' : undefined}
          flush
          action={
            <Seg
              options={[
                { value: 'open', label: 'Open' },
                { value: 'all', label: 'All' },
              ]}
              value={status}
              onChange={setStatus}
            />
          }
        >
          {!others.data ? (
            <Loading />
          ) : !others.data.items.length ? (
            <Empty
              icon={CheckCheck}
              text={
                status === 'open'
                  ? 'Nothing waiting. All short days are settled.'
                  : 'No short days yet.'
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Worked</th>
                    <th className="hide-sm">Time away</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {others.data.items.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Person
                          name={x.name}
                          sub={x.designation}
                          id={x.employee_id}
                          hasPhoto={x.has_photo}
                          size={34}
                        />
                      </td>
                      <td className="b6" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDay(x.date)}
                      </td>
                      <td>
                        <Worked x={x} />
                      </td>
                      <td className="hide-sm small">{awaySummary(x)}</td>
                      <td className="small" style={{ maxWidth: 300 }}>
                        {x.reason || <span className="muted">Waiting for the employee</span>}
                      </td>
                      <td>
                        <Badge tone={SHORT_TONE[x.status]}>{x.status}</Badge>
                        {x.decidedByName && (
                          <div className="xs muted mt-8">by {x.decidedByName}</div>
                        )}
                      </td>
                      <td className="right" style={{ whiteSpace: 'nowrap' }}>
                        {x.canDecide && (
                          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => setDecide({ item: x, action: 'approve' })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setDecide({ item: x, action: 'reject' })}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {explain && (
        <ExplainModal item={explain} onClose={() => setExplain(null)} onDone={reloadAll} />
      )}
      {decide && (
        <DecideModal
          item={decide.item}
          action={decide.action}
          onClose={() => setDecide(null)}
          onDone={reloadAll}
        />
      )}
    </div>
  );
}

// ---------- location log ----------
const LOC_RESULT = {
  'in-office': ['In office', 'green'],
  'office-network': ['Office network', 'green'],
  outside: ['Outside', 'red'],
  imprecise: ['Location unclear', 'amber'],
  'no-location': ['No location', 'amber'],
  exempt: ['Exempt', 'gray'],
};
const EVENT_LABEL = {
  'sign-in': 'Signed in',
  'check-in': 'Checked in',
  'while working': 'While working',
  'sign-in blocked': 'Sign-in refused',
  'check-in blocked': 'Check-in refused',
  'signed out (left office)': 'Signed out: left office',
};

function LocationLog({ team }) {
  const { meta } = useApp();
  const [view, setView] = useState(team ? 'team' : 'mine');
  const [day, setDay] = useState(meta.today);
  const [issues, setIssues] = useState(false);
  const qs = new URLSearchParams({
    view,
    ...(day ? { date: day } : {}),
    ...(issues ? { issues: '1' } : {}),
  });
  const { data, error, reload } = useApi(`/attendance/locations?${qs}`);
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const mapUrl = (x) => `https://www.google.com/maps?q=${x.lat},${x.lng}`;
  return (
    <div>
      <div className={`alert ${data?.mode === 'off' ? 'warn' : 'info'} mb-16`}>
        <MapPin size={16} />
        <span>
          {data?.mode === 'off' ? (
            <>
              The office-only sign-in rule is off, so locations are not being checked.{' '}
              {team ? 'HR can turn it on in Settings → Office Locations.' : ''}
            </>
          ) : (
            <>
              Sign-in and check-in are allowed only at an office
              {data?.mode === 'strict' ? ', and leaving the office signs people out' : ''}.
              Locations are recorded at sign-in, at check-in and every 10 minutes while the work
              clock runs.
            </>
          )}
        </span>
      </div>
      <Card
        flush
        title={view === 'team' ? 'Location log' : 'My location history'}
        sub={
          data
            ? `${data.summary.inOffice} in office · ${data.summary.outside} outside · ${data.summary.blocked} refused or signed out`
            : undefined
        }
        action={
          team && (
            <Seg
              options={[
                { value: 'team', label: 'Team' },
                { value: 'mine', label: 'Mine' },
              ]}
              value={view}
              onChange={setView}
            />
          )
        }
      >
        <div className="filters" style={{ padding: '0 18px 14px' }}>
          <Input
            type="date"
            value={day}
            max={meta.today}
            onChange={(e) => setDay(e.target.value)}
            aria-label="Date"
          />
          <label className="check small">
            <input type="checkbox" checked={issues} onChange={(e) => setIssues(e.target.checked)} />
            Only problems
          </label>
        </div>
        {!data ? (
          <Loading />
        ) : !data.items.length ? (
          <Empty icon={MapPin} text="Nothing recorded for this day." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  {view === 'team' && <th>Employee</th>}
                  <th>Event</th>
                  <th>Result</th>
                  <th>Where</th>
                  <th className="hide-sm">Accuracy</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((x) => {
                  const [label, tone] = LOC_RESULT[x.result] || [x.result, 'gray'];
                  return (
                    <tr key={x.id}>
                      <td className="small nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmtTime(x.at)}
                      </td>
                      {view === 'team' && (
                        <td>
                          {x.employee_id ? (
                            <Person
                              name={x.name}
                              sub={x.code}
                              id={x.employee_id}
                              hasPhoto={x.has_photo}
                              size={30}
                            />
                          ) : (
                            x.name
                          )}
                        </td>
                      )}
                      <td className="small">{EVENT_LABEL[x.event] || x.event}</td>
                      <td>
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                      <td className="small">
                        {x.result === 'exempt'
                          ? x.note
                          : x.site_name
                            ? `${x.result === 'outside' || x.result === 'imprecise' ? `${fmtDistance(x.distance_m)} from ` : ''}${x.site_name}${x.result === 'in-office' && x.distance_m != null ? ` · ${fmtDistance(x.distance_m)}` : ''}`
                            : '—'}
                      </td>
                      <td className="hide-sm small muted">
                        {x.accuracy_m != null
                          ? `±${fmtDistance(x.accuracy_m)}`
                          : x.result === 'office-network'
                            ? 'Network'
                            : '—'}
                      </td>
                      <td className="right">
                        {x.lat != null && (
                          <a className="small" href={mapUrl(x)} target="_blank" rel="noreferrer">
                            Map
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
