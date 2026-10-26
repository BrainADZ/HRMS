import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, CircleCheck, Clock3, GraduationCap, Plus, Users } from 'lucide-react';
import { useApp } from '../context.jsx';
import { useApi, useAction } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime } from '../lib/format.js';
import {
  Badge, Button, Card, Empty, EmployeeSelect, ErrorBox, Field, Input, Loading,
  Modal, Person, Progress, Select, Tabs, Textarea,
} from '../components/ui.jsx';

const blankModule = { title: '', description: '', content: '', duration_minutes: 15, resource_url: '' };
const blankSession = { title: '', agenda: '', trainer: '', startsAt: '', duration_minutes: 60, mode: 'In person', venue: '' };
const sessionState = (session) =>
  session.attended_at ? 'Attended' : session.starts_at > new Date().toISOString() ? 'Upcoming' : 'Awaiting attendance';
const safeLink = (value) => /^https:\/\/[^\s]+$/i.test(value || '');

export default function Training() {
  const { user, isHR, isManager, toast } = useApp();
  const { data, error, reload } = useApi('/training');
  const [run, busy] = useAction(toast);
  const [tab, setTab] = useState(user.employeeId ? 'learning' : isHR ? 'manage' : 'team');
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [moduleForm, setModuleForm] = useState(blankModule);
  const [sessionForm, setSessionForm] = useState(blankSession);
  const [assignment, setAssignment] = useState({ kind: 'module', id: '', employeeId: '' });
  const mine = data?.my || [];
  const mySessions = data?.mySessions || [];
  const completed = mine.filter((item) => item.completed_at).length;
  const selectedModule = mine.find((item) => item.module_id === selectedModuleId)
    || mine.find((item) => !item.completed_at) || mine[0];
  const availableSessions = isHR
    ? (data?.sessions || []).filter((item) => item.status === 'Scheduled')
    : [...new Map((data?.teamSessions || []).map((item) => [item.session_id, {
      id: item.session_id, title: item.title, starts_at: item.starts_at,
    }])).values()];
  const attendanceSessionId = selectedSessionId || String(availableSessions[0]?.id || '');
  const attendanceRows = (data?.teamSessions || []).filter((item) =>
    String(item.session_id) === attendanceSessionId
    && item.employee_id !== user.employeeId
    && `${item.first_name} ${item.last_name || ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  const done = async (moduleId) => {
    if (await run(() => api.post(`/training/modules/${moduleId}/complete`), 'Lesson completed')) reload();
  };
  const saveModule = async () => {
    if (await run(() => api.post('/training/modules', moduleForm), 'Lesson added')) {
      setDialog(null);
      setModuleForm(blankModule);
      reload();
    }
  };
  const saveSession = async () => {
    if (!sessionForm.startsAt || Number.isNaN(new Date(sessionForm.startsAt).getTime())) {
      toast('Choose a valid session date and time', 'error');
      return;
    }
    const body = { ...sessionForm, starts_at: new Date(sessionForm.startsAt).toISOString() };
    if (await run(() => api.post('/training/sessions', body), 'Session scheduled')) {
      setDialog(null);
      setSessionForm(blankSession);
      reload();
    }
  };
  const assign = async () => {
    const path = assignment.kind === 'module'
      ? `/training/modules/${assignment.id}/assign`
      : `/training/sessions/${assignment.id}/assign`;
    if (await run(() => api.post(path, { employee_id: assignment.employeeId }), 'Training assigned')) {
      setDialog(null);
      reload();
    }
  };
  const recordAttendance = async (item, attended) => {
    if (await run(() => api.post(`/training/sessions/${item.session_id}/attendance`, {
      employee_id: item.employee_id, attended,
    }), 'Attendance updated')) reload();
  };
  const openAssign = (kind, id) => {
    setAssignment({ kind, id: String(id), employeeId: '' });
    setDialog('assign');
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New joiner training</h1>
          <div className="sub">Lessons, materials and trainer-led sessions for new employees.</div>
        </div>
        {isHR && <Button variant="primary" icon={Plus} onClick={() => setDialog('session')}>Schedule session</Button>}
      </div>
      {error && !data ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : <>
        <div className="kpis dashboard-kpis">
          <div className="card training-stat"><BookOpen size={22} /><span>My lessons</span><b>{completed}/{mine.length}</b></div>
          <div className="card training-stat"><CalendarDays size={22} /><span>My sessions</span><b>{mySessions.length}</b></div>
          {(isHR || isManager) && <div className="card training-stat"><Users size={22} /><span>People in training</span><b>{data.people.length}</b></div>}
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            ...(user.employeeId ? [{ value: 'learning', label: 'My learning' }] : []),
            { value: 'sessions', label: 'Live sessions' },
            ...(isHR || isManager ? [{ value: 'team', label: 'Team progress' }] : []),
            ...(isHR ? [{ value: 'manage', label: 'Manage training' }] : []),
          ]}
        />

        {tab === 'learning' && <div className="training-layout">
          <Card title="Learning path" sub={`${completed} of ${mine.length} lessons completed`}>
            {mine.length ? <>
              <Progress value={(completed / mine.length) * 100} color="var(--green)" />
              <div className="mt-16 training-course-list">
                {mine.map((item, index) => <button
                  type="button" key={item.module_id}
                  className={`training-course-button ${selectedModule?.module_id === item.module_id ? 'active' : ''}`}
                  onClick={() => setSelectedModuleId(item.module_id)}
                >
                  <span className="training-course-number">{item.completed_at ? <CircleCheck size={18} /> : index + 1}</span>
                  <span className="grow"><b>{item.title}</b><small>{item.duration_minutes || 15} min · {item.completed_at ? 'Completed' : 'To do'}</small></span>
                </button>)}
              </div>
            </> : <Empty text="Your training has not been assigned yet" />}
          </Card>
          {selectedModule && <Card title={selectedModule.title} sub={selectedModule.description}>
            <div className="row wrap small muted mb-16"><Clock3 size={15} /> About {selectedModule.duration_minutes || 15} minutes <Badge tone={selectedModule.completed_at ? 'green' : 'amber'}>{selectedModule.completed_at ? 'Completed' : 'In progress'}</Badge></div>
            <div className="training-lesson-content">
              {selectedModule.content.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
            {safeLink(selectedModule.resource_url) && <a className="link" href={selectedModule.resource_url} target="_blank" rel="noopener noreferrer">Open learning material ↗</a>}
            <div className="mt-16">
              {selectedModule.completed_at ? <Badge tone="green">Completed {fmtDate(selectedModule.completed_at)}</Badge> : <Button variant="primary" loading={busy} onClick={() => done(selectedModule.module_id)}>I finished this lesson</Button>}
            </div>
          </Card>}
        </div>}

        {tab === 'sessions' && <>
          {user.employeeId && <Card className="mb-16" title="My scheduled sessions" sub="Your upcoming and past trainer-led sessions">
            {mySessions.length ? mySessions.map((item) => <div className="list-item training-session-row" key={item.session_id}>
              <CalendarDays size={21} className="blue" />
              <div className="grow"><b>{item.title}</b><div className="small muted">{fmtDateTime(item.starts_at)} · {item.duration_minutes} min · Trainer: {item.trainer}</div>{item.agenda && <div className="small mt-8">{item.agenda}</div>}{item.venue && <div className="small mt-8">{safeLink(item.venue) ? <a className="link" href={item.venue} target="_blank" rel="noopener noreferrer">Join online session ↗</a> : item.venue}</div>}</div>
              <Badge tone={item.attended_at ? 'green' : 'blue'}>{sessionState(item)}</Badge>
            </div>) : <Empty text="No live sessions assigned yet" />}
          </Card>}
          {(isHR || isManager) && <Card title="Session attendance" sub="Mark attendance after the session begins">
            {availableSessions.length ? <>
              <div className="filters mb-16">
                <Select value={attendanceSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} options={availableSessions.map((item) => ({ value: item.id, label: `${item.title} · ${fmtDateTime(item.starts_at)}` }))} />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee" aria-label="Search session employees" />
              </div>
              {attendanceRows.length ? attendanceRows.map((item) => <div className="list-item" key={`${item.session_id}-${item.employee_id}`}>
                <Person name={`${item.first_name} ${item.last_name || ''}`.trim()} id={item.employee_id} sub={item.code} />
                <span className="grow" />
                <Badge tone={item.attended_at ? 'green' : 'amber'}>{item.attended_at ? 'Attended' : 'Not recorded'}</Badge>
                <Button size="sm" loading={busy} disabled={item.starts_at > new Date().toISOString()} onClick={() => recordAttendance(item, !item.attended_at)}>{item.attended_at ? 'Undo' : 'Mark attended'}</Button>
              </div>) : <Empty text="No assigned employees for this session" />}
            </> : <Empty text="No sessions scheduled" />}
          </Card>}
        </>}

        {tab === 'team' && <Card title="New joiner progress" sub="Lessons completed and sessions attended">
          {data.people.length ? data.people.map((person) => <div className="list-item training-person-row" key={person.id}>
            <Person name={person.name} id={person.id} sub={`${person.code} · Joined ${fmtDate(person.joinDate)}`} />
            <span className="grow" />
            <span className="small">Lessons <b>{person.completed}/{person.total}</b></span>
            <span className="small">Sessions <b>{person.sessionsAttended}/{person.sessionsTotal}</b></span>
            <Link className="link" to={`/employees/${person.id}`}>Profile</Link>
          </div>) : <Empty text="No new joiners assigned training yet" />}
        </Card>}

        {tab === 'manage' && <div className="training-layout">
          <Card title="Lessons" action={<Button size="sm" icon={Plus} onClick={() => setDialog('module')}>Add lesson</Button>}>
            {data.modules.map((item) => <div className="list-item" key={item.id}><div className="grow"><b>{item.title}</b><div className="small muted">{item.description}</div></div><Button size="sm" onClick={() => openAssign('module', item.id)}>Assign</Button></div>)}
          </Card>
          <Card title="Trainer-led sessions" action={<Button size="sm" icon={Plus} onClick={() => setDialog('session')}>Schedule</Button>}>
            {data.sessions.length ? data.sessions.map((item) => <div className="list-item training-session-row" key={item.id}><div className="grow"><b>{item.title}</b><div className="small muted">{fmtDateTime(item.starts_at)} · {item.trainer} · {item.mode}</div></div><Badge>{item.status}</Badge>{item.status === 'Scheduled' && <><Button size="sm" onClick={() => openAssign('session', item.id)}>Assign</Button><Button size="sm" onClick={async () => { if (await run(() => api.post(`/training/sessions/${item.id}/cancel`), 'Session cancelled')) reload(); }}>Cancel</Button></>}</div>) : <Empty text="No sessions scheduled yet" />}
          </Card>
        </div>}
      </>}

      {dialog === 'module' && <Modal title="Add learning lesson" onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={saveModule}>Add lesson</Button></>}>
        <div className="col">
          <Field label="Lesson title"><Input value={moduleForm.title} maxLength={120} onChange={(event) => setModuleForm({ ...moduleForm, title: event.target.value })} /></Field>
          <Field label="Summary"><Input value={moduleForm.description} maxLength={300} onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })} /></Field>
          <Field label="Lesson material"><Textarea rows={8} value={moduleForm.content} maxLength={5000} onChange={(event) => setModuleForm({ ...moduleForm, content: event.target.value })} /></Field>
          <Field label="Estimated minutes"><Input type="number" min="5" max="480" value={moduleForm.duration_minutes} onChange={(event) => setModuleForm({ ...moduleForm, duration_minutes: event.target.value })} /></Field>
          <Field label="Material link (optional)"><Input type="url" placeholder="https://" value={moduleForm.resource_url} onChange={(event) => setModuleForm({ ...moduleForm, resource_url: event.target.value })} /></Field>
          <div className="small muted">Current new joiners and future hires receive this lesson automatically.</div>
        </div>
      </Modal>}

      {dialog === 'session' && <Modal title="Schedule trainer-led session" onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={saveSession}>Schedule</Button></>}>
        <div className="col">
          <Field label="Session title"><Input value={sessionForm.title} maxLength={120} onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })} /></Field>
          <Field label="Agenda"><Textarea rows={4} value={sessionForm.agenda} maxLength={2000} onChange={(event) => setSessionForm({ ...sessionForm, agenda: event.target.value })} /></Field>
          <Field label="Trainer"><Input value={sessionForm.trainer} maxLength={120} onChange={(event) => setSessionForm({ ...sessionForm, trainer: event.target.value })} /></Field>
          <Field label="Date and time"><Input type="datetime-local" value={sessionForm.startsAt} onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })} /></Field>
          <Field label="Duration (minutes)"><Input type="number" min="5" max="480" value={sessionForm.duration_minutes} onChange={(event) => setSessionForm({ ...sessionForm, duration_minutes: event.target.value })} /></Field>
          <Field label="Mode"><Select value={sessionForm.mode} options={['In person', 'Online']} onChange={(event) => setSessionForm({ ...sessionForm, mode: event.target.value })} /></Field>
          <Field label={sessionForm.mode === 'Online' ? 'Meeting link' : 'Venue'}><Input value={sessionForm.venue} maxLength={500} onChange={(event) => setSessionForm({ ...sessionForm, venue: event.target.value })} /></Field>
        </div>
      </Modal>}

      {dialog === 'assign' && <Modal title="Assign training" onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={assign}>Assign</Button></>}>
        <div className="col"><Field label="Employee"><EmployeeSelect value={assignment.employeeId} onChange={(event) => setAssignment({ ...assignment, employeeId: event.target.value })} /></Field></div>
      </Modal>}
    </div>
  );
}
