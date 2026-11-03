import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { scopeLabel } from '../../../shared/access-scopes.js';
import { roleLabel } from '../../../shared/access.js';
import RoleAssignmentsEditor from '../components/RoleAssignmentsEditor.jsx';
import PermissionsChart from '../components/PermissionsChart.jsx';
import { useApp } from '../context.jsx';
import { useApi, useAction } from '../lib/hooks.js';
import { api, postDownload } from '../lib/api.js';
import {
  Card,
  Badge,
  Button,
  Tabs,
  Loading,
  ErrorBox,
  Input,
  Select,
  Modal,
  Toggle,
} from '../components/ui.jsx';
import { TempPasswordModal } from '../components/forms.jsx';
export default function UsersAccess() {
  const { isCEO } = useApp();
  const [sp, setSp] = useSearchParams();
  const tab = isCEO && sp.get('tab') === 'permissions' ? 'permissions' : 'people';
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Users &amp; Access</h1>
          <div className="sub">People, verticals and responsibilities in one place.</div>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={(tab) => setSp({ tab })}
        tabs={[
          { value: 'people', label: 'People & roles' },
          ...(isCEO ? [{ value: 'permissions', label: 'Role permissions' }] : []),
        ]}
      />
      {tab === 'permissions' ? <PermissionsChart /> : <Users />}
    </div>
  );
}
function Users() {
  const { toast, user, isCEO, loadMe, meta, refreshMeta } = useApp();
  const { data, error, reload } = useApi('/users');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [verticals, setVerticals] = useState([]);
  const [rolesChanged, setRolesChanged] = useState(false);
  const [verticalFilter, setVerticalFilter] = useState('');
  const [temp, setTemp] = useState(null);
  const [run, busy] = useAction(toast);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const metaName = (key, id) => meta[key].find((row) => row.id === id)?.name || '';
  const save = async () => {
    if (rolesChanged && !assignments.length) {
      toast('Add at least one role', 'error');
      return;
    }
    const out = await run(
      () =>
        api.put(
          editing.employee_id ? '/access/employees/' + editing.employee_id : '/users/' + editing.id,
          {
            ...(editing.employee_id ? { vertical_ids: verticals } : {}),
            ...(rolesChanged ? { roleAssignments: assignments } : {}),
          },
        ),
      'Access saved',
    );
    if (out) {
      setEditing(null);
      reload();
      await loadMe();
      await refreshMeta();
    }
  };
  return (
    <Card
      title="People & roles"
      sub="Choose where people work and the responsibilities they hold. Only the CEO decides role permissions."
    >
      <div className="alert info">
        <b>How access works:</b> Work verticals show where a person works. Responsibilities define
        their roles and whose records they can access. The CEO's Role permissions chart decides the
        allowed actions.
      </div>
      <div className="row wrap" style={{ gap: 12 }}>
        <Input
          aria-label="Find a person"
          placeholder="Find a person or department"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          aria-label="Filter by vertical"
          value={verticalFilter}
          placeholder="All verticals"
          options={meta.verticals.map((v) => ({ value: v.id, label: v.name }))}
          onChange={(e) => setVerticalFilter(e.target.value)}
        />
      </div>
      {data.withoutLogin > 0 && (
        <Button
          className="mt-16"
          loading={busy}
          onClick={async () => {
            await run(() => postDownload('/users/bulk-create', {}, 'new-logins.csv'));
            reload();
          }}
        >
          Create {data.withoutLogin} missing logins
        </Button>
      )}
      <div className="table-wrap mt-16">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Verticals</th>
              <th>Roles & responsibilities</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...data.users,
              ...(data.employeesWithoutLogin || []).map((e) => ({
                ...e,
                id: 'employee-' + e.employee_id,
                roles: e.roleAssignments?.map((a) => a.role) || [],
                roleAssignments: e.roleAssignments || [],
                legacyAccess: !e.roleAssignments?.length,
              })),
            ]
              .filter((u) => !verticalFilter || u.vertical_ids?.includes(Number(verticalFilter)))
              .filter((u) =>
                [
                  u.name,
                  u.email,
                  u.username,
                  metaName('departments', u.department_id),
                  u.designation,
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(q.toLowerCase()),
              )
              .map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.name}</b>
                    <div className="small muted">
                      {u.username || u.email}
                      {u.code ? ' · ' + u.code : ''}
                      <div>{metaName('departments', u.department_id)}</div>
                    </div>
                  </td>
                  <td>
                    <div className="row wrap" style={{ gap: 4 }}>
                      {(u.vertical_ids || []).map((id) => (
                        <Badge key={id} tone="blue">
                          {metaName('verticals', id)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td>
                    {u.legacyAccess ? (
                      <span className="muted small">
                        {u.designation || u.roles.map(roleLabel).join(' + ') || 'Employee'} ·
                        existing access
                      </span>
                    ) : (
                      u.roleAssignments.map((a, i) => (
                        <div key={i}>
                          <Badge tone="blue">
                            {a.department_id && ['head', 'manager'].includes(a.role)
                              ? metaName('departments', a.department_id) + ' ' + roleLabel(a.role)
                              : roleLabel(a.role)}
                          </Badge>
                          {a.vertical_id ? ' · ' + metaName('verticals', a.vertical_id) : ''}
                          <div className="small muted">{scopeLabel(a)}</div>
                          {a.department_id && a.role === 'accounts'
                            ? ' · ' + metaName('departments', a.department_id)
                            : ''}
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    {typeof u.id === 'number' ? (
                      <Toggle
                        label="Active"
                        on={Boolean(u.active)}
                        disabled={busy || u.id === user.id || (u.roles.includes('ceo') && !isCEO)}
                        onChange={async (v) => {
                          await run(() => api.put('/users/' + u.id, { active: v }));
                          reload();
                        }}
                      />
                    ) : (
                      <Badge>No login yet</Badge>
                    )}
                  </td>
                  <td>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <Button
                        size="xs"
                        disabled={u.roles.includes('ceo') && !isCEO}
                        onClick={() => {
                          setEditing(u);
                          setVerticals(
                            u.vertical_ids?.length
                              ? u.vertical_ids
                              : u.vertical_id
                                ? [u.vertical_id]
                                : [],
                          );
                          setRolesChanged(false);
                          setAssignments(
                            u.roleAssignments.length
                              ? u.roleAssignments
                              : u.roles.map((role) => ({
                                  role,
                                  vertical_id: null,
                                  department_id: null,
                                })),
                          );
                        }}
                      >
                        Edit access
                      </Button>
                      <Button
                        size="xs"
                        disabled={
                          !user.canManageCredentials ||
                          typeof u.id !== 'number' ||
                          (u.roles.includes('ceo') && !isCEO)
                        }
                        onClick={async () => {
                          const out = await run(() => api.post('/users/' + u.id + '/reset'));
                          if (out) setTemp(out);
                        }}
                      >
                        Reset password
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal
          title={'Edit access · ' + editing.name}
          size="wide"
          onClose={() => !busy && setEditing(null)}
          footer={
            <Button loading={busy} variant="primary" onClick={save}>
              Save access
            </Button>
          }
        >
          {editing.legacyAccess && rolesChanged && (
            <p className="alert info">
              Saving explicitly replaces this person's previous access with the CEO's configured
              permissions for the selected roles.
            </p>
          )}
          {editing.employee_id && (
            <>
              <h3>1. Work verticals</h3>
              <p className="small muted">
                Department: {metaName('departments', editing.department_id) || 'Not assigned'}.
                Change the primary department from the employee profile.
              </p>
              <p className="small muted">
                Select all verticals. Primary vertical stays selected; membership does not grant
                permissions.
              </p>
              <div className="row wrap" style={{ gap: 16, marginBottom: 24 }}>
                {meta.verticals.map((v) => (
                  <label className="check" key={v.id}>
                    <input
                      type="checkbox"
                      checked={verticals.includes(v.id)}
                      disabled={busy || v.id === editing.vertical_id}
                      onChange={(e) =>
                        setVerticals(
                          e.target.checked
                            ? [...verticals, v.id]
                            : verticals.filter((id) => id !== v.id),
                        )
                      }
                    />
                    {v.name}
                    {v.id === editing.vertical_id ? ' (primary)' : ''}
                  </label>
                ))}
              </div>
            </>
          )}
          <h3>2. Responsibilities &amp; data access</h3>
          <RoleAssignmentsEditor
            value={assignments}
            disabled={busy}
            onChange={(rows) => {
              setRolesChanged(true);
              setAssignments(rows);
            }}
          />
        </Modal>
      )}
      {temp && (
        <TempPasswordModal
          username={temp.username}
          role={temp.role}
          email={temp.email}
          password={temp.tempPassword}
          onClose={() => setTemp(null)}
        />
      )}
    </Card>
  );
}
