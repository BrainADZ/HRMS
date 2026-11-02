import { ACTION_PERMISSIONS } from './permission-modules.js';
const all = ACTION_PERMISSIONS.map((p) => p.key);
const team = [
  'employees.team',
  'attendance.team',
  'leave.approve_team',
  'hiring.team',
  'performance.team',
  'training.team',
  'resignations.team',
];
export const DEFAULT_ROLE_PERMISSIONS = {
  ceo: [
    ...all,
    'employees.sensitive',
    'expenses.advances',
    'expenses.approve_advances',
    'system.manage',
  ],
  admin: all.filter((key) => !key.startsWith('posh.')).concat(['employees.sensitive']),
  head: [...team, 'policies.view', 'notices.view'],
  manager: [...team, 'policies.view', 'notices.view'],
  accounts: [
    'employees.view',
    'employees.sensitive',
    'documents.view',
    'documents.create',
    'attendance.view',
    'attendance.edit',
    'attendance.export',
    'leave.view',
    'expenses.view',
    'expenses.approve',
    'expenses.advances',
    'reports.read',
    'reports.export',
    'policies.view',
    'notices.view',
  ],
  employee: ['policies.view', 'notices.view'],
};
export const DEFAULT_ROLE_DESCRIPTIONS = {
  ceo: 'Company-wide access, permission administration and system controls.',
  admin:
    'Daily administration, employee records and role assignments. Confidential POSH access and system reset remain separate.',
  head: 'Team profiles, attendance, leave approvals, hiring, performance, training and exits within assigned scopes.',
  manager:
    'Team profiles, attendance, leave approvals, hiring, performance, training and exits within assigned scopes.',
  accounts:
    'Employee and document details, attendance, expense reviews, advances and reports. Advance approval stays with the CEO.',
  employee:
    'Personal attendance, leave requests, expenses, assigned training and reviews; published policies and announcements.',
};
