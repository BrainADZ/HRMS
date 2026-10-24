// Year view of public holidays: company and restricted holidays on twelve
// month grids, with weekly offs, today and the viewer's own leave marked.
// This is the only place holidays are shown, and where HR adds and removes them.
import { useMemo, useState } from 'react';
import { CalendarHeart, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context.jsx';
import { useApi, useAction } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  useConfirm,
} from '../components/ui.jsx';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n) => String(n).padStart(2, '0');
const dayDiff = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const weekday = (d) => fmtDate(d, { weekday: 'short' });

function Month({ year, month, byDate, leaveByDate, weeklyOffs, today }) {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
  const cells = [];

  for (let i = 0; i < lead; i++) {
    cells.push(<span key={`b${i}`} />);
  }

  for (let d = 1; d <= days; d++) {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`;
    const dow = new Date(Date.UTC(year, month, d)).getUTCDay();
    const holiday = byDate.get(date);
    const leave = leaveByDate.get(date);
    const isWeeklyOff = weeklyOffs.includes(dow);

    const className = [
      'cal-day',
      holiday ? (holiday.type === 'Company' ? 'hol' : 'rh') : isWeeklyOff ? 'off' : '',
      date === today ? 'today' : '',
      date < today ? 'past' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const label = [
      fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }),
      holiday &&
        `${holiday.name} (${
          holiday.type === 'Company' ? 'company holiday' : 'restricted holiday'
        })`,
      !holiday && isWeeklyOff && 'Weekly off',
      leave && `Your ${leave.name}${leave.status === 'Pending' ? ' (pending)' : ''}`,
    ]
      .filter(Boolean)
      .join(' · ');

    cells.push(
      <span key={date} className={className} title={label} aria-label={label}>
        {d}
        {leave && (
          <i
            className={`lv ${leave.status === 'Pending' ? 'pending' : ''}`}
            style={{ background: leave.color }}
          />
        )}
      </span>,
    );
  }

  return (
    <div className="cal-month">
      <div className="cal-title">{MONTHS[month]}</div>
      <div className="cal-grid cal-dow">
        {DOW.map((day) => (
          <span key={day}>{day[0]}</span>
        ))}
      </div>
      <div className="cal-grid">{cells}</div>
    </div>
  );
}

function AddHoliday({ year, today, onClose, onAdded }) {
  const { toast } = useApp();
  const [form, setForm] = useState({
    date: today.startsWith(String(year)) ? today : `${year}-01-01`,
    name: '',
    type: 'Company',
  });
  const [run, busy] = useAction(toast);

  const save = async () => {
    if (busy) return;

    const saved = await run(
      () => api.post('/holidays', form),
      `${form.name.trim() || 'Holiday'} added`,
    );
    if (saved) onAdded(Number(form.date.slice(0, 4)));
  };

  return (
    <Modal
      title="Add a holiday"
      size="narrow"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} icon={Plus} onClick={save}>
            Add holiday
          </Button>
        </>
      }
    >
      <Field label="Date">
        <Input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
      </Field>
      <Field label="Name">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Diwali"
          maxLength={80}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </Field>
      <Field label="Type">
        <Select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          options={[
            { value: 'Company', label: 'Company holiday (office closed)' },
            { value: 'Restricted', label: 'Restricted holiday (optional)' },
          ]}
        />
      </Field>
      <div className="xs muted">
        Restricted holidays are optional and are taken as Casual Leave. Festival dates change every
        year, so check them each January.
      </div>
    </Modal>
  );
}

export default function HolidayCalendar() {
  const { meta, isHR, toast } = useApp();
  const thisYear = Number(meta.today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, error, reload } = useApi(`/holidays/calendar?year=${year}`);
  const [adding, setAdding] = useState(false);
  const [run] = useAction(toast);
  const [confirm, confirmEl] = useConfirm();

  const remove = async (holiday) => {
    const approved = await confirm({
      title: 'Delete holiday?',
      text: `${holiday.name} on ${fmtDate(holiday.date)}`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!approved) return;

    const removed = await run(() => api.del(`/holidays/${holiday.id}`), `${holiday.name} removed`);
    if (removed) reload();
  };

  const derived = useMemo(() => {
    if (!data) return null;

    const byDate = new Map();
    for (const holiday of data.holidays) {
      if (holiday.type === 'Company' || !byDate.has(holiday.date)) {
        byDate.set(holiday.date, holiday);
      }
    }

    const leaveByDate = new Map(data.myLeave.map((leave) => [leave.date, leave]));
    const next = data.holidays.find(
      (holiday) => holiday.date >= data.today && holiday.type === 'Company',
    );

    return {
      byDate,
      leaveByDate,
      next,
      company: data.holidays.filter((holiday) => holiday.type === 'Company').length,
      restricted: data.holidays.filter((holiday) => holiday.type !== 'Company').length,
    };
  }, [data]);

  if (error && !data) {
    return <ErrorBox error={error} onRetry={reload} />;
  }

  const months = data ? MONTHS.map((_, month) => month) : [];
  const grouped = data
    ? months
        .map((month) => ({
          month,
          items: data.holidays.filter((holiday) => Number(holiday.date.slice(5, 7)) === month + 1),
        }))
        .filter((group) => group.items.length)
    : [];

  const handleAdded = (addedYear) => {
    setAdding(false);
    if (addedYear === year) reload();
    else setYear(addedYear);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Holiday Calendar</h1>
          <div className="sub">
            Public holidays at {meta.settings.companyName || 'BrainADZ'}, with weekly offs and your
            own leave.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Button icon={ChevronLeft} aria-label="Previous year" onClick={() => setYear(year - 1)} />
          <div
            className="b7"
            style={{
              fontSize: 20,
              minWidth: 64,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {year}
          </div>
          <Button icon={ChevronRight} aria-label="Next year" onClick={() => setYear(year + 1)} />
          {year !== thisYear && <Button onClick={() => setYear(thisYear)}>This year</Button>}
        </div>
      </div>
      {!data || !derived ? (
        <Loading />
      ) : (
        <div className="cal-layout">
          <Card flush>
            <div className="cal-summary">
              <span>
                <b>{derived.company}</b> company holidays
              </span>
              <span>
                <b>{derived.restricted}</b> restricted holidays
              </span>
              {derived.next && year === thisYear && (
                <span>
                  Next: <b>{derived.next.name}</b>,{' '}
                  {fmtDate(derived.next.date, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  {dayDiff(data.today, derived.next.date) === 0
                    ? ' (today)'
                    : ` (in ${dayDiff(data.today, derived.next.date)} days)`}
                </span>
              )}
            </div>
            <div className="cal-legend">
              <span>
                <i className="sw hol" />
                Company holiday
              </span>
              <span>
                <i className="sw rh" />
                Restricted holiday
              </span>
              <span>
                <i className="sw off" />
                Weekly off
              </span>
              <span>
                <i className="sw lv" />
                Your leave
              </span>
              <span>
                <i className="sw today" />
                Today
              </span>
            </div>
            <div className="cal-year">
              {months.map((month) => (
                <Month
                  key={month}
                  year={year}
                  month={month}
                  byDate={derived.byDate}
                  leaveByDate={derived.leaveByDate}
                  weeklyOffs={data.weeklyOffs}
                  today={data.today}
                />
              ))}
            </div>
          </Card>
          <Card
            title={`Holidays ${year}`}
            action={
              isHR && (
                <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                  Add holiday
                </Button>
              )
            }
          >
            {!grouped.length ? (
              <Empty
                icon={CalendarHeart}
                text={
                  isHR
                    ? `No holidays for ${year} yet. Use Add holiday to publish them.`
                    : `No holidays published for ${year} yet.`
                }
              />
            ) : (
              grouped.map((group) => (
                <div key={group.month} className="hol-group">
                  <div className="xs muted b6 hol-month">{MONTHS[group.month].toUpperCase()}</div>
                  {group.items.map((holiday) => (
                    <div
                      key={holiday.id}
                      className={[
                        'hol-row',
                        holiday.date < data.today ? 'past' : '',
                        derived.next?.id === holiday.id ? 'next' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="hol-date">
                        <b>{Number(holiday.date.slice(8))}</b>
                        <span>{weekday(holiday.date)}</span>
                      </div>
                      <div className="grow">{holiday.name}</div>
                      <Badge tone={holiday.type === 'Company' ? 'blue' : 'pink'}>
                        {holiday.type === 'Company' ? 'Company' : 'Restricted'}
                      </Badge>
                      {isHR && (
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={Trash2}
                          aria-label={`Delete ${holiday.name}`}
                          title="Delete holiday"
                          onClick={() => remove(holiday)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
            {grouped.length > 0 && (
              <div className="xs muted mt-8">
                Restricted holidays are optional: take them as Casual Leave.
              </div>
            )}
          </Card>
        </div>
      )}
      {adding && data && (
        <AddHoliday
          year={year}
          today={data.today}
          onClose={() => setAdding(false)}
          onAdded={handleAdded}
        />
      )}
      {confirmEl}
    </div>
  );
}
