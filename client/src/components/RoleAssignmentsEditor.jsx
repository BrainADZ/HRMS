import { useId } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { ROLES, roleLabel } from '../../../shared/access.js';
import { ACCESS_SCOPES, defaultScope, scopeLabel } from '../../../shared/access-scopes.js';
import { useApp } from '../context.jsx';
import { Button, Select } from './ui.jsx';

const explanations = {
  own: 'Only their own records and employee self-service.',
  team: 'Their direct and indirect reports. Employees can report directly to a Head.',
  selected: 'Employees matching the department and vertical below. Choose at least one filter.',
  all: 'Everyone in the company, limited to the actions allowed for this role.',
  legacy: 'Current access is retained. Choose a scope below to define it explicitly.',
};
export default function RoleAssignmentsEditor({ value = [], onChange, disabled = false }) {
  const { meta, isCEO } = useApp();
  const editorId = useId();
  const change = (index, update) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...update } : row)));
  const name = (key, id) => meta[key].find((r) => r.id === Number(id))?.name;
  return (
    <div className="responsibilities-editor">
      <div className="responsibilities-intro">
        <p>Choose a role and whose records this person can access.</p>
        <span>
          One person can hold multiple responsibilities. The CEO controls the allowed actions for
          each role.
        </span>
      </div>
      <div className="responsibilities-list">
        {value.map((row, index) => {
          const scope = row.access_scope || 'legacy';
          const headingId = editorId + '-role-' + index;
          const helpId = headingId + '-help';
          return (
            <section key={index} className="responsibility-card" aria-labelledby={headingId}>
              <header className="responsibility-card-head">
                <div className="responsibility-heading">
                  <span className="responsibility-icon">
                    <ShieldCheck size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <h4 id={headingId}>Responsibility {index + 1}</h4>
                    <span>{roleLabel(row.role)}</span>
                  </div>
                </div>
                <Button
                  size="xs"
                  disabled={disabled}
                  className="responsibility-remove"
                  aria-label={`Remove responsibility ${index + 1}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Remove
                </Button>
              </header>
              <div className="responsibility-card-body">
                <div className="responsibility-fields">
                  <label>
                    <span>Role</span>
                    <Select
                      aria-label={`Role ${index + 1}`}
                      disabled={disabled}
                      value={row.role}
                      options={ROLES.filter(
                        (r) => isCEO || r.value !== 'ceo' || row.role === 'ceo',
                      )}
                      onChange={(e) =>
                        change(index, {
                          role: e.target.value,
                          access_scope: defaultScope(e.target.value),
                          vertical_id: null,
                          department_id: null,
                        })
                      }
                    />
                    <small>What responsibility does this person hold?</small>
                  </label>
                  <label>
                    <span>Data access</span>
                    <Select
                      aria-label={`Role ${index + 1} data scope`}
                      aria-describedby={helpId}
                      disabled={disabled}
                      value={scope}
                      options={[
                        ...(scope === 'legacy'
                          ? [{ value: 'legacy', label: 'Keep current access' }]
                          : []),
                        ...ACCESS_SCOPES.filter((s) => row.role !== 'ceo' || s.value === 'all'),
                      ]}
                      onChange={(e) =>
                        change(index, {
                          access_scope: e.target.value,
                          vertical_id: null,
                          department_id: null,
                        })
                      }
                    />
                    <small id={helpId}>{explanations[scope]}</small>
                  </label>
                  {(scope === 'selected' ||
                    (scope === 'legacy' && ['head', 'manager', 'accounts'].includes(row.role))) && (
                    <>
                      <label>
                        <span>Department</span>
                        <Select
                          aria-label={`Role ${index + 1} department`}
                          disabled={disabled}
                          value={row.department_id || ''}
                          placeholder="All departments"
                          options={meta.departments.map((d) => ({ value: d.id, label: d.name }))}
                          onChange={(e) =>
                            change(index, {
                              department_id: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Vertical</span>
                        <Select
                          aria-label={`Role ${index + 1} vertical`}
                          disabled={disabled}
                          value={row.vertical_id || ''}
                          placeholder="All verticals"
                          options={meta.verticals.map((v) => ({ value: v.id, label: v.name }))}
                          onChange={(e) =>
                            change(index, {
                              vertical_id: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
                {scope === 'selected' && !row.department_id && !row.vertical_id && (
                  <p className="responsibility-filter-hint">
                    Select a department or vertical to complete this responsibility.
                  </p>
                )}
                <div className="responsibility-summary" aria-live="polite">
                  <span className="responsibility-summary-label">Access summary</span>
                  <div>
                    <b>{roleLabel(row.role)}</b>
                    <span>{scope === 'legacy' ? 'Current access' : scopeLabel(row)}</span>
                    {row.department_id && <span>{name('departments', row.department_id)}</span>}
                    {row.vertical_id && <span>{name('verticals', row.vertical_id)}</span>}
                  </div>
                </div>
                {['own', 'team', 'selected'].includes(scope) && (
                  <details className="responsibility-help">
                    <summary>What does this access cover?</summary>
                    <p>
                      Role permissions decide the actions they can perform. Limited scopes cover
                      employee profile viewing, attendance, leave approvals, performance reviews,
                      training visibility and manager resignation reviews. Company administration
                      requires an All employees responsibility.
                    </p>
                    {scope === 'selected' && (
                      <p>
                        Secondary vertical memberships count. Department and vertical filters apply
                        together. Add another responsibility for a different vertical.
                      </p>
                    )}
                  </details>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {!value.length && (
        <div className="responsibility-empty">
          <ShieldCheck size={24} aria-hidden="true" />
          <p>No responsibilities added</p>
          <span>Add a role to define access. Existing access stays unchanged until you save.</span>
        </div>
      )}
      <div className="responsibilities-footer">
        <Button
          disabled={disabled || value.length >= 20}
          size="sm"
          onClick={() =>
            onChange([
              ...value,
              { role: 'employee', access_scope: 'own', vertical_id: null, department_id: null },
            ])
          }
        >
          <Plus size={16} aria-hidden="true" />
          Add responsibility
        </Button>
        <span>Example: CEO + Sales Head, or Admin + Accounts.</span>
      </div>
    </div>
  );
}
