import { supportsLimitedScope } from '../../shared/access-scopes.js';
import { expandRolePermissions } from '../../shared/permission-modules.js';
import { requestAction } from './permission-actions.js';
import { ROLES, PERMISSIONS, primaryRole, legacyRole } from '../../shared/access.js';
import { isCompanyOwner } from '../lib/employee-policy.js';

const keys = PERMISSIONS.map((p) => p.key);
const teamKeys = [
  'employees.team',
  'attendance.team',
  'leave.approve_team',
  'hiring.team',
  'performance.team',
  'training.team',
  'resignations.team',
  'notices.manage',
];
export const isCEO = (user) => Boolean(user?.roles?.includes('ceo'));

export async function permissionMatrix(db) {
  const matrix = Object.fromEntries(ROLES.map((r) => [r.value, []]));
  const rows = await db.all('SELECT * FROM role_permission_rules');
  for (const role of ROLES)
    matrix[role.value] = expandRolePermissions(
      rows
        .filter((r) => r.role === role.value && r.allowed === 1 && keys.includes(r.permission))
        .map((r) => r.permission),
      rows.filter((r) => r.role === role.value && r.allowed === 0).map((r) => r.permission),
    );
  return matrix;
}

export async function assignmentsFor(db, user) {
  const rows = await db.all(
    'SELECT role,vertical_id,department_id,access_scope FROM role_assignments WHERE employee_id=? OR user_id=? ORDER BY id',
    user.employeeId || 0,
    user.id || user.userId || 0,
  );
  return rows;
}

export async function accessProfile(db, row, preload = {}) {
  const assignments =
    preload.assignments ?? (await assignmentsFor(db, { employeeId: row.employee_id, id: row.id }));
  const managed = assignments.length > 0;
  const fallbackRole =
    row.role === 'admin' && isCompanyOwner(row)
      ? 'ceo'
      : ['admin', 'accounts', 'hr'].includes(row.role)
        ? 'admin'
        : row.role === 'manager' && /head/i.test(row.designation || '')
          ? 'head'
          : row.role === 'manager'
            ? 'manager'
            : 'employee';
  const roleAssignments = managed
    ? assignments
    : [{ role: fallbackRole, vertical_id: null, department_id: null }];
  const roles = [...new Set(roleAssignments.map((a) => a.role))];
  const matrix = preload.matrix ?? (await permissionMatrix(db));
  // Existing accounts retain their current privileges until explicitly reassigned.
  const legacyPermissions = ['admin', 'hr', 'accounts'].includes(row.role)
    ? keys.filter(
        (key) =>
          row.role === 'admin' || !['system.manage', 'posh.manage', 'audit.view'].includes(key),
      )
    : row.role === 'manager'
      ? teamKeys
      : [];
  const assignmentGrants = roleAssignments.map((a) => ({
    ...a,
    permissions: (matrix[a.role] || []).filter(
      (key) =>
        !a.access_scope || ['legacy', 'all'].includes(a.access_scope) || supportsLimitedScope(key),
    ),
  }));
  const permissions = managed
    ? [...new Set(assignmentGrants.flatMap((a) => a.permissions))]
    : legacyPermissions;
  if (roles.includes('ceo') && !permissions.includes('users.manage'))
    permissions.push('users.manage');
  if (roles.includes('ceo'))
    for (const action of ['view', 'create', 'edit', 'assign'])
      if (!permissions.includes('users.' + action)) permissions.push('users.' + action);
  return {
    roles,
    assignmentGrants,
    roleAssignments,
    primaryRole: primaryRole(roleAssignments),
    managedAccess: managed,
    permissions,
    role: managed ? legacyRole(roleAssignments) : row.role,
  };
}

// Adapt existing domain checks to the capability granted for this request only.
// A grant in one module never makes the user an administrator of other modules.
export function applyAccessContext(user, method, path, body = {}) {
  if (!user?.managedAccess) return user;
  if (/^\/(?:auth|meta|notifications)(?:\/|$)/.test(path)) return user;
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (path.startsWith('/search')) {
    user.role = user.permissions.includes('hiring.manage') ? 'admin' : 'employee';
    return user;
  }
  let module = '';
  if (/^\/settings\/(?:reset|clear)/i.test(path)) module = 'system';
  else if (/^\/(?:users|access)(?:\/|$)/i.test(path) || /\/employees\/\d+\/login/i.test(path))
    module = 'users';
  else if (
    /^\/(?:documents|files\/documents)(?:\/|$)/i.test(path) ||
    /\/employees\/\d+\/documents/i.test(path)
  )
    module = 'documents';
  else if (/^\/(?:jobs|candidates|interviews|hiring)(?:\/|$)/i.test(path)) module = 'hiring';
  else module = path.split('/')[1] || '';
  const names = {
    dashboard: 'reports',
    audit: 'audit',
    notices: 'notices',
    requests: 'requests',
    assets: 'employees',
    onboarding: 'employees',
  };
  module = names[module] || module;
  const globalKey =
    {
      reports: 'reports.view',
      audit: 'audit.view',
      users: 'users.manage',
      system: 'system.manage',
    }[module] || `${module}.manage`;
  const teamKey = {
    employees: 'employees.team',
    attendance: 'attendance.team',
    leave: 'leave.approve_team',
    hiring: 'hiring.team',
    performance: 'performance.team',
    training: 'training.team',
    resignations: 'resignations.team',
  }[module];
  const can = (key) => user.permissions.includes(key);
  const action = requestAction(method, path, user, body);
  const granted = action && can(action.key);
  const teamAction = action?.team && can(action.team);
  if (action?.enforce && !granted && !teamAction)
    throw Object.assign(new Error('Permission required: ' + action.key), { status: 403 });
  let all = action ? Boolean(granted) : can(globalKey) || (!write && can(`${module}.view_all`));
  let team =
    (teamKey && can(teamKey)) ||
    (module === 'reports' && path.startsWith('/dashboard') && teamKeys.some(can));
  const matching = (user.assignmentGrants || []).filter((a) =>
    action
      ? a.permissions.includes(action.key) ||
        (action.team && a.permissions.includes(action.team)) ||
        (!action.enforce && teamKey && a.permissions.includes(teamKey)) ||
        (!action.enforce &&
          module === 'reports' &&
          path.startsWith('/dashboard') &&
          teamKeys.some((k) => a.permissions.includes(k)))
      : a.permissions.includes(globalKey) ||
        a.permissions.includes(module + '.view_all') ||
        (teamKey && a.permissions.includes(teamKey)) ||
        (module === 'reports' &&
          path.startsWith('/dashboard') &&
          teamKeys.some((k) => a.permissions.includes(k))),
  );
  if (
    all &&
    matching.length &&
    !matching.some(
      (a) =>
        (!a.access_scope || ['legacy', 'all'].includes(a.access_scope)) &&
        (!action || a.permissions.includes(action.key)),
    )
  )
    all = false;
  user.scopeAssignments = matching;
  if (!all && matching.some((a) => ['team', 'selected'].includes(a.access_scope))) team = true;
  if (action?.module) module = action.module;
  user.permissionAction = action?.key;
  user.permissionModule = module;
  user.role = all
    ? 'admin'
    : teamAction || (granted && team) || (!action?.enforce && team)
      ? 'manager'
      : 'employee';
  if (granted && all && write) {
    const compatibility =
      { assets: 'employees.manage', users: 'users.manage' }[module] || globalKey;
    user.permissions = [...new Set([...user.permissions, compatibility])];
  }
  if (module === 'expenses') {
    if (can('expenses.view') && !write) user.permissions = [...user.permissions, 'expenses.review'];
    if (granted && write && action.key === 'expenses.approve')
      user.permissions = [...user.permissions, 'expenses.review'];
    user.role = all || can('expenses.review') || can('expenses.advances') ? 'accounts' : 'employee';
  }
  // POSH retains its own confidential-case membership checks.
  if (module === 'posh') user.role = all || (!action && can('posh.manage')) ? 'admin' : 'employee';
  return user;
}

export async function validateAssignments(db, input) {
  if (!Array.isArray(input) || !input.length || input.length > 20)
    throw Object.assign(new Error('Choose between 1 and 20 role assignments'), { status: 400 });
  const seen = new Set();
  const result = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw Object.assign(new Error('Choose a valid role assignment'), { status: 400 });
    if (!ROLES.some((r) => r.value === item.role))
      throw Object.assign(new Error('Choose a valid role'), {
        status: 400,
      });
    const row = {
      role: item.role,
      access_scope: item.access_scope || 'legacy',
      vertical_id: item.vertical_id ? Number(item.vertical_id) : null,
      department_id: item.department_id ? Number(item.department_id) : null,
    };
    if (!['legacy', 'own', 'team', 'selected', 'all'].includes(row.access_scope))
      throw Object.assign(new Error('Choose a valid data scope'), { status: 400 });
    if (row.role === 'ceo' && !['legacy', 'all'].includes(row.access_scope))
      throw Object.assign(new Error('CEO responsibility requires All employees scope'), {
        status: 400,
      });
    if (row.access_scope === 'selected' && !row.vertical_id && !row.department_id)
      throw Object.assign(new Error('Select a department or vertical for this responsibility'), {
        status: 400,
      });
    if (
      !['legacy', 'selected'].includes(row.access_scope) &&
      (row.vertical_id || row.department_id)
    )
      throw Object.assign(
        new Error('Department and vertical filters require Selected department / vertical scope'),
        { status: 400 },
      );
    if (
      row.access_scope === 'legacy' &&
      !['head', 'manager', 'accounts'].includes(row.role) &&
      (row.vertical_id || row.department_id)
    )
      throw Object.assign(
        new Error('Department and vertical scopes apply to Head, Manager and Accounts'),
        { status: 400 },
      );
    for (const [key, table] of [
      ['vertical_id', 'verticals'],
      ['department_id', 'departments'],
    ]) {
      if (
        item[key] &&
        (!Number.isInteger(row[key]) ||
          row[key] <= 0 ||
          !(await db.value(`SELECT id FROM ${table} WHERE id=?`, row[key])))
      )
        throw Object.assign(new Error('Choose a valid role scope'), { status: 400 });
    }
    const key = JSON.stringify([row.role, row.vertical_id, row.department_id]);
    if (seen.has(key)) throw Object.assign(new Error('Duplicate role assignment'), { status: 400 });
    seen.add(key);
    result.push(row);
  }
  return result;
}

export async function saveAssignments(db, { employeeId, userId }, assignments) {
  await db.run(
    'DELETE FROM role_assignments WHERE employee_id=? OR user_id=?',
    employeeId || 0,
    userId || 0,
  );
  for (const a of assignments)
    await db.insert('role_assignments', {
      ...a,
      employee_id: employeeId || null,
      user_id: employeeId ? null : userId,
    });
  if (employeeId)
    await db.run(
      'UPDATE users SET role=? WHERE employee_id=?',
      legacyRole(assignments),
      employeeId,
    );
  else await db.update('users', userId, { role: legacyRole(assignments) });
}
