import { ACTION_PERMISSIONS } from './permission-modules.js';
export const canManageCredentials = (user) =>
  Boolean(
    user?.roles?.includes('ceo') ||
    (user?.roles?.includes('admin') && (user.managedAccess || user.role === 'admin')),
  );
export const ROLES = [
  { value: 'ceo', label: 'CEO' },
  { value: 'admin', label: 'Admin' },
  { value: 'head', label: 'Head' },
  { value: 'manager', label: 'Manager' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'employee', label: 'Employee' },
];
const LEGACY_PERMISSIONS = [
  ['employees.view_all', 'Employees', 'View all employee profiles'],
  ['employees.team', 'Employees', 'View team employee profiles'],
  ['employees.manage', 'Employees', 'Add and edit all employee records'],
  ['employees.sensitive', 'Employees', 'View compensation and personal details'],
  ['documents.manage', 'Documents', 'Manage employee documents'],
  ['attendance.view_all', 'Attendance', 'View company attendance'],
  ['attendance.manage', 'Attendance', 'Correct company attendance'],
  ['attendance.team', 'Attendance', 'View and correct team attendance'],
  ['leave.view_all', 'Leave', 'View company leave'],
  ['leave.manage', 'Leave', 'Manage company leave and holidays'],
  ['leave.approve_team', 'Leave', 'Approve team leave'],
  ['hiring.manage', 'Hiring', 'Manage all hiring and candidates'],
  ['hiring.team', 'Hiring', 'Manage assigned hiring'],
  ['screener.manage', 'Hiring', 'Use resume screening'],
  ['performance.manage', 'Performance', 'Manage company performance cycles'],
  ['performance.team', 'Performance', 'Review team performance'],
  ['expenses.review', 'Expenses', 'Review expense reimbursements'],
  ['expenses.advances', 'Expenses', 'Manage expense advances'],
  ['expenses.approve_advances', 'Expenses', 'Approve expense advances'],
  ['reports.view', 'Reports', 'View company reports and exports'],
  ['training.manage', 'Training', 'Manage company training'],
  ['training.team', 'Training', 'Manage team training attendance'],
  ['travel.manage', 'Travel', 'Manage company travel requests'],
  ['resignations.manage', 'Exit', 'Manage company resignations and clearances'],
  ['resignations.team', 'Exit', 'Approve team resignations and clearances'],
  ['policies.manage', 'Policies', 'Publish policies'],
  ['posh.manage', 'POSH', 'Manage confidential POSH cases and committee'],
  ['notices.manage', 'Communication', 'Publish announcements'],
  ['requests.manage', 'Helpdesk', 'Manage employee helpdesk requests'],
  ['settings.manage', 'Settings', 'Manage company settings and masters'],
  ['users.manage', 'Settings', 'Manage logins and assign non-CEO roles'],
  ['audit.view', 'Settings', 'View audit history'],
  ['system.manage', 'Settings', 'Reset company data'],
].map(([key, group, label]) => ({ key, group, label }));

export const PERMISSIONS = [
  ...new Map([...LEGACY_PERMISSIONS, ...ACTION_PERMISSIONS].map((p) => [p.key, p])).values(),
];

// No automatic permission grants. The CEO must choose each grant in Permissions.
export const EMPTY_MATRIX = Object.fromEntries(ROLES.map((r) => [r.value, []]));
export const hasRole = (user, role) => Boolean(user?.roles?.includes(role));
export const can = (user, permission) => Boolean(user?.permissions?.includes(permission));
export const roleLabel = (role) => ROLES.find((r) => r.value === role)?.label || role;
export const primaryRole = (assignments) =>
  ROLES.find((r) => assignments.some((a) => a.role === r.value))?.value || 'employee';
export const legacyRole = (assignments) => {
  const role = primaryRole(assignments);
  return ['ceo', 'admin'].includes(role)
    ? 'admin'
    : ['head', 'manager'].includes(role)
      ? 'manager'
      : role === 'accounts'
        ? 'accounts'
        : 'employee';
};

export const TEAM_PERMISSIONS = [
  'employees.team',
  'attendance.team',
  'leave.approve_team',
  'hiring.team',
  'performance.team',
  'training.team',
  'resignations.team',
];
export function canOpenModule(user, path) {
  if (!user?.managedAccess) return true;
  if (path === '/')
    return (
      can(user, 'reports.view') ||
      can(user, 'reports.read') ||
      TEAM_PERMISSIONS.some((key) => can(user, key))
    );
  if (path === '/access')
    return (
      hasRole(user, 'ceo') ||
      can(user, 'users.manage') ||
      ['view', 'create', 'edit', 'assign'].some((a) => can(user, 'users.' + a))
    );
  if (path === '/settings')
    return (
      hasRole(user, 'ceo') ||
      [
        'settings.manage',
        'settings.view',
        'settings.create',
        'settings.edit',
        'settings.delete',
        'users.manage',
        'audit.view',
      ].some((key) => can(user, key))
    );
  const keys = {
    '/hiring': [
      'hiring.manage',
      'hiring.team',
      'hiring.view',
      'hiring.create',
      'hiring.edit',
      'hiring.approve',
    ],
    '/screener': ['screener.manage', 'screener.view', 'screener.create', 'screener.edit'],
    '/reports': ['reports.view', 'reports.read', 'reports.export'],
    '/logs': ['audit.view'],
  }[path];
  return !keys || keys.some((key) => can(user, key));
}
export function moduleLevel(user, path) {
  const module =
    {
      '/': 'reports',
      '/my': 'self',
      '/logs': 'audit',
      '/leave': 'leave',
      '/resignation': 'resignations',
    }[path] || path.split('/')[1];
  const management = { reports: 'reports.view', audit: 'audit.view' }[module] || `${module}.manage`;
  const team = {
    employees: 'employees.team',
    attendance: 'attendance.team',
    leave: 'leave.approve_team',
    hiring: 'hiring.team',
    performance: 'performance.team',
    training: 'training.team',
    resignations: 'resignations.team',
  }[module];
  return {
    global:
      can(user, management) ||
      (module === 'reports' && can(user, 'reports.read')) ||
      ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'export'].some((a) =>
        can(user, module + '.' + a),
      ) ||
      can(user, `${module}.view_all`) ||
      (module === 'settings' && (can(user, 'users.manage') || hasRole(user, 'ceo'))),
    team: Boolean(team && can(user, team)),
  };
}
