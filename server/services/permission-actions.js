import { MODULES, permissionKey } from '../../shared/permission-modules.js';
// Self-service and resource ownership checks remain in the domain routes.
export function requestAction(method, path, user, body = {}) {
  const read = ['GET', 'HEAD'].includes(method);
  const own = new RegExp('^/employees/' + user.employeeId + '(?:/photo)?$');
  if (!read && (own.test(path) || path === '/employees/' + user.employeeId + '/documents'))
    return null;
  let module = path.split('/')[1],
    action = read ? 'view' : method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'edit';
  const team = {
    attendance: 'attendance.team',
    leave: 'leave.approve_team',
    hiring: 'hiring.team',
    performance: 'performance.team',
    training: 'training.team',
    resignations: 'resignations.team',
  };
  if (/\.(csv|xlsx)$/.test(path)) action = 'export';
  if (/^\/(jobs|candidates|interviews)(\/|$)/.test(path)) module = 'hiring';
  if (/^\/employees\/\d+\/documents/.test(path) || /^\/files\/documents/.test(path))
    module = 'documents';
  if (/^\/employees\/\d+\/assets/.test(path)) module = 'assets';
  if (/^\/employees\/\d+\/login/.test(path) || /^\/access/.test(path)) {
    module = 'users';
    action = read ? 'view' : body.roleAssignments !== undefined ? 'assign' : 'edit';
  }
  if (/^\/users/.test(path) && !read)
    action = path.endsWith('/bulk-create')
      ? 'create'
      : path.endsWith('/reset')
        ? 'edit'
        : body.roleAssignments !== undefined
          ? 'assign'
          : 'edit';
  if (module === 'onboarding') {
    module = 'employees';
    action = 'edit';
  }
  if (module === 'holidays' || /^\/leave\/types/.test(path)) module = 'leave';
  if (module === 'attendance') {
    if (/\/(check-in|check-out|location|corrections)$/.test(path) && !read) return null;
    if (path.endsWith('/explain')) return null;
    if (path.endsWith('/decide') || path.endsWith('/decision')) action = 'approve';
    if (path.endsWith('/bulk')) action = 'edit';
  }
  if (module === 'leave' && !read) {
    if (['/leave/preview', '/leave/requests'].includes(path) || path.endsWith('/cancel'))
      return null;
    if (path.endsWith('/decision')) action = 'approve';
  }
  if (module === 'performance' && !read) {
    if (path.endsWith('/self')) return null;
    if (path.endsWith('/manager')) action = 'approve';
    if (path.includes('/goals'))
      return { module, key: permissionKey(module, action), team: team[module], enforce: false }; // route checks ownership for self-service goals
  }
  if (module === 'expenses') {
    if (read) return null; // own expenses remain visible; reviewer check uses capabilities
    if (/\/(reimburse|decision|settle)$/.test(path)) action = 'approve';
    else if (method === 'PUT') action = 'approve';
    else return null;
  }
  if (module === 'training' && !read) {
    if (path.endsWith('/complete')) return null;
    if (path.endsWith('/assign')) action = 'assign';
    if (/\/(attendance|cancel)$/.test(path)) action = 'edit';
  }
  if (module === 'travel' && !read) {
    if (path.endsWith('/decision')) action = 'approve';
    else if (path.endsWith('/close')) action = 'edit';
    else return null;
  }
  if (module === 'resignations' && !read) {
    if (path === '/resignations' || /\/(withdraw|exit-interview)$/.test(path)) return null;
    action = /\/(manager-decision|hr-review|clearance|complete)$/.test(path) ? 'approve' : 'edit';
  }
  if (module === 'policies' && !read) {
    if (path.endsWith('/ack')) return null;
    if (path.endsWith('/remind')) action = 'assign';
  }
  if (module === 'posh' && !read) {
    if (path === '/posh/complaints') return null;
    if (path.endsWith('/icc') || path.endsWith('/remind-training')) action = 'assign';
  }
  if (module === 'requests' && method === 'POST') return null;
  if (module === 'hiring' && !read && /\/(hire|offer-status)$/.test(path)) action = 'approve';
  else if (module === 'hiring' && !read && /\/(move|offer)$/.test(path)) action = 'edit';
  if (module === 'screener' && !read) action = path.endsWith('/action') ? 'edit' : 'create';
  if (module === 'settings' && /\/(reset-demo|start-fresh|clear)/.test(path)) return null;
  if (module === 'dashboard') {
    module = 'reports';
    action = 'view';
  }
  const config = MODULES.find((m) => m.key === module);
  if (!config?.actions.includes(action)) return null;
  return {
    module,
    key: permissionKey(module, action),
    team: team[module],
    enforce: !read || action === 'export',
  };
}
