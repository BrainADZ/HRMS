import { ROLES, roleLabel } from '../../../shared/access.js';
import { ACCESS_SCOPES, defaultScope, scopeLabel } from '../../../shared/access-scopes.js';
import { useApp } from '../context.jsx';
import { Button, Select } from './ui.jsx';

export default function RoleAssignmentsEditor({ value = [], onChange, disabled = false }) {
  const { meta, isCEO } = useApp();
  const change = (index, update) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...update } : row)));
  const name = (key, id) => meta[key].find((r) => r.id === Number(id))?.name;
  return (
    <div className="stack">
      <p className="small muted">
        Choose a responsibility, then choose whose records it covers. Role permissions decide which
        actions are allowed. Add another responsibility when a person has more than one role.
      </p>
      {value.map((row, index) => {
        const scope = row.access_scope || 'legacy';
        return (
          <fieldset key={index} className="responsibility-card" disabled={disabled}>
            <legend>Responsibility {index + 1}</legend>
            <div className="responsibility-fields">
              <label>
                <b>1. Role</b>
                <Select
                  aria-label={`Role ${index + 1}`}
                  disabled={disabled}
                  value={row.role}
                  options={ROLES.filter((r) => isCEO || r.value !== 'ceo' || row.role === 'ceo')}
                  onChange={(e) =>
                    change(index, {
                      role: e.target.value,
                      access_scope: defaultScope(e.target.value),
                      vertical_id: null,
                      department_id: null,
                    })
                  }
                />
              </label>
              <label>
                <b>2. Whose records?</b>
                <Select
                  aria-label={`Role ${index + 1} data scope`}
                  disabled={disabled}
                  value={scope}
                  options={[
                    ...(scope === 'legacy'
                      ? [{ value: 'legacy', label: 'Existing scope (unchanged)' }]
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
              </label>
              {(scope === 'selected' ||
                (scope === 'legacy' && ['head', 'manager', 'accounts'].includes(row.role))) && (
                <>
                  <label>
                    <b>3. Department</b>
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
                    <b>4. Vertical</b>
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
            <p className="access-summary">
              <b>{roleLabel(row.role)}</b> · {scopeLabel(row)}
              {row.department_id ? ' · ' + name('departments', row.department_id) : ''}
              {row.vertical_id ? ' · ' + name('verticals', row.vertical_id) : ''}
            </p>
            <p className="small muted">
              {scope === 'own' &&
                'Only their own records and employee self-service. No access to other employees through this responsibility.'}
              {scope === 'team' &&
                'Direct and indirect reports, plus their own records. A Head can have employees reporting directly without a Manager.'}
              {scope === 'selected' &&
                'People matching the selected department AND vertical, plus their own records. Secondary vertical memberships are included. Choose at least one filter. Add another responsibility for another vertical.'}
              {scope === 'all' &&
                'Allowed actions cover the whole company. This does not enable permissions that the CEO has left unchecked.'}
              {scope === 'legacy' &&
                'Retains existing access rules. Select a named scope to make this responsibility explicit.'}
            </p>
            {['own', 'team', 'selected'].includes(scope) && (
              <p className="small muted">
                Limited scopes support employee profile viewing, attendance, leave approvals,
                performance reviews, training visibility and manager resignation reviews. Company
                administration and other company-wide actions require an All employees
                responsibility.
              </p>
            )}
            <Button
              disabled={disabled}
              size="xs"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              Remove responsibility
            </Button>
          </fieldset>
        );
      })}
      {!value.length && (
        <p className="small muted">
          Add a responsibility to configure access. Existing access stays unchanged until you save.
        </p>
      )}
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
        Add responsibility
      </Button>
    </div>
  );
}
