import { DEFAULT_ROLE_DESCRIPTIONS } from '../../../shared/default-permissions.js';
import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck, Search, CheckCircle2 } from 'lucide-react';
import {
  ACTIONS,
  MODULES,
  ACTION_PERMISSIONS,
  permissionKey,
} from '../../../shared/permission-modules.js';
import { useApp } from '../context.jsx';
import { api } from '../lib/api.js';
import { useApi, useAction } from '../lib/hooks.js';
import { Loading, ErrorBox, Input } from './ui.jsx';
const title = (value) => value[0].toUpperCase() + value.slice(1);
const actionKeys = new Set(ACTION_PERMISSIONS.map((p) => p.key));
export default function PermissionsChart() {
  const { toast, loadMe } = useApp();
  const { data, error, reload, setData } = useApi('/permissions');
  const [selected, setSelected] = useState('employee');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [run, busy] = useAction(toast);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const role = data.roles.find((r) => r.value === selected);
  const grants = data.matrix[selected] || [];
  const extrasFor = (module) =>
    data.permissions.filter(
      (p) =>
        (p.key.startsWith(module.key + '.') &&
          !actionKeys.has(p.key) &&
          !p.key.endsWith('.manage') &&
          !p.key.endsWith('.view_all') &&
          p.key !== 'expenses.review') ||
        (module.key === 'settings' && p.key === 'system.manage'),
    );
  const modules = MODULES.filter((m) =>
    [m.label, ...extrasFor(m).map((p) => p.label)]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function toggle(permission, allowed) {
    const before = data;
    setData((prev) => ({
      ...prev,
      matrix: {
        ...prev.matrix,
        [selected]: allowed
          ? [...new Set([...prev.matrix[selected], permission])]
          : prev.matrix[selected].filter((p) => p !== permission),
      },
    }));
    const out = await run(
      () =>
        api.put('/permissions', { role: selected, permission, allowed, revision: data.revision }),
      'Permission saved',
    );
    if (out) {
      setData((prev) => ({ ...prev, revision: out.revision }));
      await loadMe();
    } else {
      setData(before);
      reload();
    }
  }
  return (
    <div className="access-matrix-shell">
      <aside className="access-role-panel" aria-label="Select role">
        <div className="access-panel-title">
          <ShieldCheck size={18} />
          <div>
            <b>Roles</b>
            <span>Choose a role to configure</span>
          </div>
        </div>
        <div className="access-role-list">
          {data.roles.map((r) => (
            <button
              type="button"
              key={r.value}
              aria-label={r.label}
              aria-pressed={selected === r.value}
              disabled={busy}
              className={'access-role-option ' + (r.value === selected ? 'selected' : '')}
              onClick={() => setSelected(r.value)}
            >
              <span className="access-role-icon">
                <ShieldCheck size={17} />
              </span>
              <span>
                <b>{r.label}</b>
                <small>
                  {
                    ACTION_PERMISSIONS.filter(
                      (p) =>
                        data.matrix[r.value]?.includes(p.key) ||
                        (r.value === 'ceo' && p.key.startsWith('users.')),
                    ).length
                  }{' '}
                  module actions enabled
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
        <div className="access-role-note">
          Multiple roles combine their allowed actions. Only the CEO can change this chart.
        </div>
      </aside>
      <section className="access-matrix-main" aria-label="Module permissions">
        <div className="access-matrix-heading">
          <div>
            <span className="access-eyebrow">ACCESS CONTROL</span>
            <h2>{role.label} permissions</h2>
            <p>Choose exactly what this role can do in each module.</p>
          </div>
          <span className="access-save-status">
            <CheckCircle2 size={15} />
            {busy ? 'Saving…' : 'Changes save automatically'}
          </span>
        </div>
        <div className="access-matrix-toolbar">
          <div className="access-search">
            <Search size={16} />
            <Input
              aria-label="Find permission"
              placeholder="Search modules or additional controls"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span>{modules.length} modules</span>
        </div>
        <div className="access-matrix-scroll">
          <table className="access-action-table">
            <thead>
              <tr>
                <th scope="col">Module</th>
                {ACTIONS.map((a) => (
                  <th scope="col" key={a}>
                    {title(a)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => {
                const extras = extrasFor(module);
                const open = Boolean(expanded[module.key]);
                return (
                  <Fragment key={module.key}>
                    <tr>
                      <th scope="row">
                        <div className="access-module-name">
                          {extras.length > 0 ? (
                            <button
                              type="button"
                              aria-label={'Additional controls for ' + module.label}
                              aria-expanded={open}
                              onClick={() =>
                                setExpanded((prev) => ({ ...prev, [module.key]: !open }))
                              }
                            >
                              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          ) : (
                            <span className="access-expand-spacer" />
                          )}
                          <div>
                            <b>{module.label}</b>
                            {extras.length > 0 && (
                              <small>
                                {extras.length} additional{' '}
                                {extras.length === 1 ? 'control' : 'controls'}
                              </small>
                            )}
                          </div>
                        </div>
                      </th>
                      {ACTIONS.map((action) => {
                        const key = permissionKey(module.key, action);
                        const supported = module.actions.includes(action);
                        const locked = selected === 'ceo' && module.key === 'users';
                        return (
                          <td key={action}>
                            {supported ? (
                              <input
                                type="checkbox"
                                className="access-action-check"
                                aria-label={role.label + ': ' + title(action) + ' ' + module.label}
                                checked={locked || grants.includes(key)}
                                disabled={busy || locked}
                                onChange={(e) => toggle(key, e.target.checked)}
                              />
                            ) : (
                              <span
                                className="access-unsupported"
                                aria-label="Not applicable"
                                title="This action is not available for this module"
                              >
                                N/A
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {open && (
                      <tr className="access-details-row">
                        <td colSpan={ACTIONS.length + 1}>
                          <div className="access-extra-grid">
                            {extras.map((p) => (
                              <label key={p.key}>
                                <input
                                  type="checkbox"
                                  checked={grants.includes(p.key)}
                                  disabled={busy}
                                  aria-label={role.label + ': ' + p.label}
                                  onChange={(e) => toggle(p.key, e.target.checked)}
                                />
                                <span>{p.label}</span>
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!modules.length && (
                <tr>
                  <td colSpan={ACTIONS.length + 1} className="access-no-results">
                    No modules match your search.
                  </td>
                </tr>
              )}
              <tr className="access-disabled-row">
                <th scope="row">
                  <div className="access-module-name">
                    <span className="access-expand-spacer" />
                    <div>
                      <b>Payroll</b>
                      <small>Disabled for everyone</small>
                    </div>
                  </div>
                </th>
                {ACTIONS.map((a) => (
                  <td key={a}>
                    <input
                      type="checkbox"
                      aria-label={role.label + ': ' + title(a) + ' Payroll disabled'}
                      checked={false}
                      disabled
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <footer className="access-matrix-footer">
          <p>
            <b>Default for {role.label}:</b> {DEFAULT_ROLE_DESCRIPTIONS[selected]} The CEO can
            customize these permissions.
          </p>
          <p>
            <b>N/A = Not applicable.</b> This action does not exist for that module. An empty
            checkbox means the action is available but not allowed for this role.
          </p>
          <p>
            <b>Scope:</b> Choose whose records each responsibility covers in People & roles. Limited
            scopes cover supported employee and team workflows; company administration requires All
            employees. Expand a module for additional controls.
          </p>
          <p>
            Personal self-service stays available. Existing login access changes when new roles are
            explicitly assigned.
          </p>
          {selected === 'ceo' && (
            <p>CEO permission administration and role access are protected.</p>
          )}
        </footer>
      </section>
    </div>
  );
}
