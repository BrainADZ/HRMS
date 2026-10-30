import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plane,
  Plus,
  MapPin,
  Clock,
  Camera,
  Send,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { useApp } from '../context.jsx';
import { useApi, useAction } from '../lib/hooks.js';
import { api, apiUrl } from '../lib/api.js';
import { withLocation } from '../lib/location.js';
import { useWorkday, useNow, workedNow, clockText, refreshWorkday } from '../lib/workday.js';
import { fmtDate, fmtTime } from '../lib/format.js';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  Textarea,
} from '../components/ui.jsx';
import { ClockActions } from '../components/WorkClock.jsx';
import './Travel.css';

const tone = (status) =>
  ({ Approved: 'green', Closed: 'gray', Pending: 'amber', Rejected: 'red', Submitted: 'blue' })[
    status
  ] || 'blue';

export default function Travel() {
  const { id } = useParams();
  return id ? <TripDetails key={id} id={id} /> : <TripList />;
}

function TripList() {
  const { data, error, reload } = useApi('/travel');
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const navigate = useNavigate();
  useEffect(() => {
    const timer = setInterval(reload, 60000);
    return () => clearInterval(timer);
  }, [reload]);
  const items = (data?.items || []).filter(
    (trip) =>
      (status === 'All' || trip.status === status) &&
      [trip.project, trip.city, trip.site, ...trip.members.map((m) => m.name)]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="travel-page">
      <div className="page-head">
        <div>
          <h1>Travel & On Duty</h1>
          <div className="sub">Expo visits, field work and business travel, all in one place.</div>
        </div>
        {data?.canRequest && (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Request a trip
          </Button>
        )}
      </div>
      <div className="travel-stats">
        <div className="card">
          <Plane size={21} />
          <span>
            Active trips
            <strong>
              {data?.items.filter(
                (t) =>
                  t.status === 'Approved' && t.from_date <= data.today && t.to_date >= data.today,
              ).length || 0}
            </strong>
          </span>
        </div>
        <div className="card">
          <Clock size={21} />
          <span>
            Waiting for approval
            <strong>{data?.items.filter((t) => t.status === 'Pending').length || 0}</strong>
          </span>
        </div>
        <div className="card">
          <Send size={21} />
          <span>
            Daily updates pending
            <strong>
              {data?.items.reduce(
                (n, t) => n + t.members.filter((m) => m.updatePending).length,
                0,
              ) || 0}
            </strong>
          </span>
        </div>
      </div>
      <section className="card">
        <div className="travel-filters">
          <div className="search grow">
            <Search size={18} />
            <input
              aria-label="Search trips"
              placeholder="Search expo, city or employee…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={['All', 'Pending', 'Approved', 'Rejected', 'Submitted', 'Closed']}
          />
        </div>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Expo / Project</th>
                <th>City & site</th>
                <th>Dates</th>
                <th>Team</th>
                <th>Latest update</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((trip) => {
                const latest = trip.members
                  .map((m) => m.latestUpdate)
                  .filter(Boolean)
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
                const pending = trip.members.filter((m) => m.updatePending).length;
                return (
                  <tr
                    key={trip.id}
                    className="click"
                    onClick={() => navigate(`/travel/${trip.id}`)}
                  >
                    <td>
                      <Link className="link b6" to={`/travel/${trip.id}`}>
                        {trip.project}
                      </Link>
                      <div className="small muted">TRV-{String(trip.id).padStart(4, '0')}</div>
                    </td>
                    <td>
                      {trip.city}
                      <div className="small muted">{trip.site}</div>
                    </td>
                    <td className="small">
                      {fmtDate(trip.from_date)}
                      <div className="muted">to {fmtDate(trip.to_date)}</div>
                    </td>
                    <td>
                      {trip.members.length} {trip.members.length === 1 ? 'person' : 'people'}
                      <div className="small muted">
                        {trip.members
                          .slice(0, 2)
                          .map((m) => m.name)
                          .join(', ')}
                        {trip.members.length > 2 ? '…' : ''}
                      </div>
                    </td>
                    <td>
                      {latest ? (
                        <>
                          <span className="small">{latest.status}</span>
                          <div className="small muted">
                            {fmtDate(latest.created_at)} · {fmtTime(latest.created_at)}
                          </div>
                        </>
                      ) : (
                        <span className="muted">No updates yet</span>
                      )}
                      {pending > 0 && (
                        <div className="small amber">
                          {pending} update{pending > 1 ? 's' : ''} pending
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge tone={tone(trip.status)}>{trip.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data && !items.length && <Empty icon={Plane} text="No trips in this view" />}
      </section>
      {creating && <NewTrip onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewTrip({ onClose }) {
  const { user, meta, toast } = useApp();
  const { data, error, reload } = useApi('/travel/options');
  const navigate = useNavigate();
  const [run, busy] = useAction(toast);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    project: '',
    city: '',
    site: '',
    from_date: meta.today,
    to_date: meta.today,
    purpose: '',
    employee_ids: user.employeeId ? [user.employeeId] : [],
    approver_id: '',
  });
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const save = async () => {
    const result = await run(
      () => api.post('/travel', form),
      'Trip sent to the manager for approval',
    );
    if (result) navigate(`/travel/${result.id}`);
  };
  return (
    <Modal
      title="Request business travel"
      size="wide"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={
              !data ||
              !form.project.trim() ||
              !form.city.trim() ||
              !form.site.trim() ||
              !form.purpose.trim() ||
              !form.employee_ids.length ||
              !form.approver_id
            }
            onClick={save}
          >
            Send for approval
          </Button>
        </>
      }
    >
      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="form-grid">
        <Field label="Expo / Project">
          <Input
            value={form.project}
            onChange={set('project')}
            maxLength={160}
            placeholder="e.g. Mumbai Expo 2026"
          />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={set('city')} maxLength={120} />
        </Field>
        <Field label="Venue / Site">
          <Input value={form.site} onChange={set('site')} maxLength={200} />
        </Field>
        <Field label="Approving manager">
          <Select
            value={form.approver_id}
            onChange={set('approver_id')}
            placeholder="Choose manager"
            options={(data?.approvers || [])
              .filter((a) => !form.employee_ids.includes(a.employee_id))
              .map((a) => ({ value: a.id, label: a.name }))}
          />
        </Field>
        <Field label="From">
          <Input type="date" value={form.from_date} onChange={set('from_date')} />
        </Field>
        <Field label="To">
          <Input type="date" min={form.from_date} value={form.to_date} onChange={set('to_date')} />
        </Field>
      </div>
      <Field label="Purpose / Work planned">
        <Textarea value={form.purpose} onChange={set('purpose')} maxLength={2000} />
      </Field>
      <Field label={`Travelling team (${form.employee_ids.length})`}>
        <Input
          aria-label="Search travelling team"
          placeholder="Search employee…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="travel-member-picker">
          {(data?.employees || [])
            .filter((e) =>
              `${e.first_name} ${e.last_name} ${e.code}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((employee) => (
              <label key={employee.id}>
                <input
                  type="checkbox"
                  checked={form.employee_ids.includes(employee.id)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      employee_ids: e.target.checked
                        ? [...f.employee_ids, employee.id]
                        : f.employee_ids.filter((id) => id !== employee.id),
                    }))
                  }
                />
                <span>
                  {employee.first_name} {employee.last_name}
                  <small>
                    {employee.code} · {employee.designation}
                  </small>
                </span>
              </label>
            ))}
        </div>
      </Field>
      <p className="small muted">
        The approver must manage the travelling team and cannot be a trip participant.
      </p>
    </Modal>
  );
}

function TripDetails({ id }) {
  const { user, toast } = useApp();
  const { data: trip, error, reload } = useApi(`/travel/${id}`);
  const { data: options } = useApi('/travel/options');
  const workday = useWorkday();
  const now = useNow(1000);
  const [run, busy] = useAction(toast);
  const [status, setStatus] = useState('Site reached');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [summary, setSummary] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  useEffect(() => {
    const timer = setInterval(reload, 60000);
    return () => clearInterval(timer);
  }, [reload]);
  const act = async (operation, message) => {
    if (await run(operation, message)) {
      reload();
      await refreshWorkday();
    }
  };
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!trip) return <Loading />;
  const mine = trip.members.find((m) => m.employee_id === user.employeeId);
  const ownSession = trip.sessions.find((s) => s.employee_id === user.employeeId && !s.end_at);
  const currentTrip = mine && workday?.workday?.sessions.at(-1)?.travelMemberId === mine.id;
  const paused = currentTrip && Boolean(workday?.workday?.breakSince);
  const start = (activity) =>
    act(
      () =>
        withLocation((location) =>
          api.post(`/travel/${id}/start`, {
            activity_type: activity,
            ...(location ? { location } : {}),
          }),
        ),
      activity === 'travel' ? 'Travel timer started' : 'On-duty timer started',
    );
  const postUpdate = async () => {
    const form = new FormData();
    form.append('status', status);
    form.append('note', note);
    if (photo) form.append('photo', photo);
    const result = await run(
      () => api.upload(`/travel/${id}/updates`, form),
      'Daily update shared with your manager',
    );
    if (result) {
      setNote('');
      setPhoto(null);
      reload();
    }
  };
  const allCompleted = trip.members.every((m) =>
    trip.updates.some((u) => u.member_id === m.id && u.status === 'Work completed'),
  );
  return (
    <div className="travel-page">
      <div className="page-head">
        <div className="row gap-12">
          <Link className="btn" aria-label="Back to trips" to="/travel">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1>{trip.project}</h1>
            <div className="sub">
              TRV-{String(trip.id).padStart(4, '0')} · {trip.city} · {fmtDate(trip.from_date)} –{' '}
              {fmtDate(trip.to_date)}
            </div>
          </div>
        </div>
        <Badge tone={tone(trip.status)}>{trip.status}</Badge>
      </div>
      <section className="card travel-overview">
        <div>
          <span className="small muted">Venue / Site</span>
          <h3>
            <MapPin size={17} /> {trip.site}
          </h3>
          <p className="small muted">{trip.purpose}</p>
        </div>
        <div>
          <span className="small muted">Approving manager</span>
          <h3>{trip.approverName}</h3>
          {trip.decision_note && <p className="small muted">{trip.decision_note}</p>}
        </div>
      </section>
      {trip.canApprove && (
        <section className="card mb-16">
          <h3 className="mb-12">Review travel request</h3>
          <Textarea
            aria-label="Approval note"
            placeholder="Optional note to the team"
            value={decisionNote}
            maxLength={1000}
            onChange={(e) => setDecisionNote(e.target.value)}
          />
          <div className="row gap-8 mt-12">
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                act(
                  () =>
                    api.post(`/travel/${id}/decision`, { action: 'approve', note: decisionNote }),
                  'Trip approved',
                )
              }
            >
              Approve trip
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    api.post(`/travel/${id}/decision`, { action: 'reject', note: decisionNote }),
                  'Trip rejected',
                )
              }
            >
              Reject
            </Button>
          </div>
        </section>
      )}
      {(trip.canStart || ownSession || paused) && (
        <section className="card travel-duty mb-16">
          <div>
            <h3>On-duty check-in</h3>
            <p className="small muted">
              Start only while travelling or working. Check out before resting or an overnight stay.
              Location is recorded at start and end.
            </p>
          </div>
          {ownSession || paused ? (
            <div>
              <strong className="travel-timer">{clockText(workedNow(workday, now))}</strong>
              <span className="small muted">
                {' '}
                {paused
                  ? 'On break'
                  : ownSession.activity_type === 'travel'
                    ? 'Travelling'
                    : 'On duty'}
              </span>
              <ClockActions />
            </div>
          ) : (
            <div className="row wrap gap-8">
              <Button
                variant="primary"
                icon={Clock}
                disabled={busy || Boolean(workday?.workday?.openSince)}
                onClick={() => start('duty')}
              >
                Start duty
              </Button>
              <Button
                icon={Plane}
                disabled={busy || Boolean(workday?.workday?.openSince)}
                onClick={() => start('travel')}
              >
                Start travel time
              </Button>
            </div>
          )}
          {!ownSession && !paused && workday?.workday?.openSince && (
            <p className="small amber">Check out of your current work session first.</p>
          )}
        </section>
      )}
      <section className="card mb-16">
        <h3 className="mb-12">Team tracking</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Latest update</th>
                <th>Duty hours</th>
                <th>Travel time</th>
                <th>Daily update</th>
              </tr>
            </thead>
            <tbody>
              {trip.members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <b>{m.name}</b>
                    <div className="small muted">
                      {m.code} · {m.designation}
                    </div>
                  </td>
                  <td>
                    {m.latestUpdate?.status || 'No update yet'}
                    {m.latestUpdate && (
                      <div className="small muted">
                        {fmtDate(m.latestUpdate.created_at)} · {fmtTime(m.latestUpdate.created_at)}
                      </div>
                    )}
                    {m.running && <Badge tone="green">Clock running</Badge>}
                  </td>
                  <td>{clockText(m.dutyMinutes, false)}</td>
                  <td>{clockText(m.travelMinutes, false)}</td>
                  <td>
                    {m.updatePending ? (
                      <Badge tone="amber">Pending update</Badge>
                    ) : (
                      <span className="small muted">
                        {trip.status === 'Approved' ? 'Up to date' : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="travel-detail-grid">
        <section className="card">
          <h3 className="mb-12">Activity timeline</h3>
          <div className="travel-timeline">
            {trip.updates.map((u) => (
              <article key={u.id}>
                <span className="travel-event-dot" />
                <div>
                  <b>{u.status}</b>
                  <div className="small muted">
                    {u.name} · {fmtDate(u.created_at)} · {fmtTime(u.created_at)}
                  </div>
                  {u.note && <p>{u.note}</p>}
                  {u.latitude != null && (
                    <div className="small muted">
                      Location: {Number(u.latitude).toFixed(5)}, {Number(u.longitude).toFixed(5)}
                      {u.accuracy != null ? ` · accuracy ${Math.round(u.accuracy)} m` : ''}
                    </div>
                  )}
                  {u.photo && (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={apiUrl(`/travel/${id}/photos/${u.id}`)}
                    >
                      <img
                        className="travel-update-photo"
                        alt={`Photo shared by ${u.name}`}
                        src={apiUrl(`/travel/${id}/photos/${u.id}`)}
                      />
                    </a>
                  )}
                </div>
              </article>
            ))}
            {!trip.updates.length && (
              <Empty text="Trip activity and team updates will appear here" />
            )}
          </div>
        </section>
        <div className="col" style={{ gap: 16 }}>
          {trip.isMember && trip.canUpdate && (
            <section className="card">
              <h3 className="mb-12">Share daily update</h3>
              <Field label="Status">
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={
                    options?.statuses || [
                      'Travelling',
                      'Site reached',
                      'Setup ongoing',
                      'Event running',
                      'Work completed',
                    ]
                  }
                />
              </Field>
              <Field label="Work update">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="What did you complete? What's next?"
                />
              </Field>
              <Field label="Site photo (optional)">
                <Input
                  key={photo ? 'selected' : 'empty'}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                />
              </Field>
              <Button variant="primary" icon={Send} loading={busy} onClick={postUpdate}>
                Share update
              </Button>
            </section>
          )}
          {trip.canSubmit && (
            <section className="card">
              <h3 className="mb-12">Complete trip</h3>
              <p className="small muted mb-12">
                Each team member must share a Work completed update and finish their duty first.
              </p>
              <Textarea
                aria-label="Final trip summary"
                placeholder="Final work summary and handover notes…"
                value={summary}
                maxLength={5000}
                onChange={(e) => setSummary(e.target.value)}
              />
              <Button
                className="mt-12"
                variant="primary"
                icon={CheckCircle2}
                disabled={
                  busy || !summary.trim() || !allCompleted || trip.members.some((m) => m.running)
                }
                onClick={() =>
                  act(
                    () => api.post(`/travel/${id}/submit`, { summary }),
                    'Trip summary sent for review',
                  )
                }
              >
                Send final summary
              </Button>
            </section>
          )}
          {trip.final_summary && (
            <section className="card">
              <h3 className="mb-12">Final trip summary</h3>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {trip.final_summary}
              </p>
              {trip.canClose && (
                <Button
                  className="mt-12"
                  variant="primary"
                  loading={busy}
                  onClick={() => act(() => api.post(`/travel/${id}/close`), 'Trip closed')}
                >
                  Review complete · Close trip
                </Button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
