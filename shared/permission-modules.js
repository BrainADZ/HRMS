// Only actions supported by the HRMS are shown. Legacy grants remain compatible.
export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'export'];
export const MODULES = [
  [
    'employees',
    'Employees',
    ['view', 'create', 'edit', 'export'],
    {
      view: ['employees.view_all', 'employees.manage'],
      create: ['employees.manage'],
      edit: ['employees.manage'],
      export: ['employees.manage'],
    },
  ],
  [
    'assets',
    'Employee assets',
    ['create', 'edit', 'delete'],
    { create: ['employees.manage'], edit: ['employees.manage'], delete: ['employees.manage'] },
  ],
  [
    'documents',
    'Documents',
    ['view', 'create'],
    { view: ['documents.manage'], create: ['documents.manage'] },
  ],
  [
    'attendance',
    'Attendance',
    ['view', 'edit', 'approve', 'export'],
    {
      view: ['attendance.view_all', 'attendance.manage'],
      edit: ['attendance.manage'],
      approve: ['attendance.manage'],
      export: ['attendance.manage'],
    },
  ],
  [
    'leave',
    'Leave & holidays',
    ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    {
      view: ['leave.view_all', 'leave.manage'],
      create: ['leave.manage'],
      edit: ['leave.manage'],
      delete: ['leave.manage'],
      approve: ['leave.manage'],
      export: ['leave.manage'],
    },
  ],
  [
    'hiring',
    'Hiring',
    ['view', 'create', 'edit', 'approve'],
    {
      view: ['hiring.manage'],
      create: ['hiring.manage'],
      edit: ['hiring.manage'],
      approve: ['hiring.manage'],
    },
  ],
  [
    'screener',
    'Resume screening',
    ['view', 'create', 'edit'],
    { view: ['screener.manage'], create: ['screener.manage'], edit: ['screener.manage'] },
  ],
  [
    'performance',
    'Performance',
    ['view', 'create', 'edit', 'delete', 'approve'],
    {
      view: ['performance.manage'],
      create: ['performance.manage'],
      edit: ['performance.manage'],
      delete: ['performance.manage'],
      approve: ['performance.manage'],
    },
  ],
  [
    'expenses',
    'Expenses',
    ['view', 'approve'],
    { view: ['expenses.review', 'expenses.approve_advances'], approve: ['expenses.review'] },
  ],
  [
    'training',
    'Training',
    ['view', 'create', 'edit', 'assign'],
    {
      view: ['training.manage'],
      create: ['training.manage'],
      edit: ['training.manage'],
      assign: ['training.manage'],
    },
  ],
  [
    'travel',
    'Travel',
    ['view', 'approve', 'edit'],
    { view: ['travel.manage'], approve: ['travel.manage'], edit: ['travel.manage'] },
  ],
  [
    'resignations',
    'Exit & resignation',
    ['view', 'edit', 'approve'],
    {
      view: ['resignations.manage'],
      edit: ['resignations.manage'],
      approve: ['resignations.manage'],
    },
  ],
  [
    'policies',
    'Policies',
    ['view', 'create', 'edit', 'delete', 'assign'],
    {
      view: ['policies.manage'],
      create: ['policies.manage'],
      edit: ['policies.manage'],
      delete: ['policies.manage'],
      assign: ['policies.manage'],
    },
  ],
  [
    'posh',
    'POSH',
    ['view', 'create', 'edit', 'assign'],
    {
      view: ['posh.manage'],
      create: ['posh.manage'],
      edit: ['posh.manage'],
      assign: ['posh.manage'],
    },
  ],
  [
    'notices',
    'Announcements',
    ['view', 'create', 'delete'],
    { view: ['notices.manage'], create: ['notices.manage'], delete: ['notices.manage'] },
  ],
  [
    'requests',
    'Helpdesk',
    ['view', 'edit'],
    { view: ['requests.manage'], edit: ['requests.manage'] },
  ],
  ['reports', 'Reports', ['view', 'export'], { view: ['reports.view'], export: ['reports.view'] }],
  [
    'settings',
    'Company settings',
    ['view', 'create', 'edit', 'delete'],
    {
      view: ['settings.manage'],
      create: ['settings.manage'],
      edit: ['settings.manage'],
      delete: ['settings.manage'],
    },
  ],
  [
    'users',
    'Users & roles',
    ['view', 'create', 'edit', 'assign'],
    {
      view: ['users.manage'],
      create: ['users.manage'],
      edit: ['users.manage'],
      assign: ['users.manage'],
    },
  ],
  ['audit', 'Audit history', ['view'], {}],
].map(([key, label, actions, legacy]) => ({ key, label, actions, legacy }));
export const permissionKey = (module, action) =>
  module === 'reports' && action === 'view' ? 'reports.read' : module + '.' + action;
export const ACTION_PERMISSIONS = MODULES.flatMap((m) =>
  m.actions.map((action) => ({
    key: permissionKey(m.key, action),
    group: m.label,
    label: action[0].toUpperCase() + action.slice(1) + ' ' + m.label.toLowerCase(),
  })),
);
export function expandRolePermissions(grants, denied = []) {
  const out = new Set(grants);
  for (const m of MODULES)
    for (const action of m.actions)
      if ((m.legacy[action] || []).some((p) => grants.includes(p)))
        out.add(permissionKey(m.key, action));
  for (const key of denied) out.delete(key);
  return [...out];
}
