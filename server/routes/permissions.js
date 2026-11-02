import { saveVerticals } from '../services/verticals.js';
import { ROLES, PERMISSIONS } from '../../shared/access.js';
import {
  permissionMatrix,
  isCEO,
  assignmentsFor,
  validateAssignments,
  saveAssignments,
} from '../services/access.js';
import { audit, fail, id } from '../core.js';

export default function permissionRoutes(r, { db }) {
  r.put('/access/employees/:id', async (req, res) => {
    if (
      !isCEO(req.user) &&
      (req.user.managedAccess
        ? !req.user.permissions.includes('users.manage')
        : !['admin', 'hr', 'accounts'].includes(req.user.role))
    )
      fail(403, 'User access permission required');
    const employeeId = id(req.params.id);
    const target = await db.get(
      'SELECT id,master_admin FROM users WHERE employee_id=?',
      employeeId,
    );
    if (
      !isCEO(req.user) &&
      (await assignmentsFor(db, { employeeId })).some((a) => a.role === 'ceo')
    )
      fail(403, 'Only a CEO can change a CEO account');
    if (target) {
      const profile = await (await import('../auth.js')).loadUser(db, target.id);
      if (
        (isCEO(profile) && !isCEO(req.user)) ||
        (target.master_admin && !req.user.isMasterAdmin && !isCEO(req.user))
      )
        fail(403, 'Only a CEO can change this account');
    }
    if (req.body.roleAssignments !== undefined)
      await assignRoles(db, req.user, { employeeId, userId: target?.id }, req.body.roleAssignments);
    if (req.body.vertical_ids !== undefined)
      await saveVerticals(db, req.user, employeeId, req.body.vertical_ids);
    res.json({ ok: true });
  });
  r.get('/permissions', async (req, res) => {
    if (!isCEO(req.user)) fail(403, 'Only the CEO can decide permissions');
    res.json({
      roles: ROLES,
      permissions: PERMISSIONS,
      matrix: await permissionMatrix(db),
      revision: await db.value('SELECT revision FROM permission_state WHERE id=1'),
    });
  });
  r.put('/permissions', async (req, res) => {
    if (!isCEO(req.user)) fail(403, 'Only the CEO can decide permissions');
    const { role, permission, allowed, revision } = req.body;
    if (
      !ROLES.some((r) => r.value === role) ||
      !PERMISSIONS.some((p) => p.key === permission) ||
      typeof allowed !== 'boolean'
    )
      fail(400, 'Choose a valid role and permission');
    const state = await db.get('SELECT revision FROM permission_state WHERE id=1 FOR UPDATE');
    if (revision !== state.revision) fail(409, 'Permissions changed. Refresh before saving.');
    await db.run(
      'INSERT INTO role_permission_rules(role,permission,allowed) VALUES(?,?,?) ON CONFLICT(role,permission) DO UPDATE SET allowed=excluded.allowed',
      role,
      permission,
      allowed ? 1 : 0,
    );
    await db.run('UPDATE permission_state SET revision=revision+1 WHERE id=1');
    await audit(db, req.user, 'permissions.update', 'role', null, { role, permission, allowed });
    res.json({ ok: true, revision: state.revision + 1 });
  });
}

export async function assignRoles(db, actor, subject, input) {
  const assignments = await validateAssignments(db, input);
  if (
    actor.managedAccess &&
    !actor.permissions.includes('users.manage') &&
    assignments.some((a) => a.role !== 'employee')
  )
    fail(403, 'Users & Roles permission is required to assign these roles');
  if (
    subject.employeeId &&
    !(await db.value('SELECT id FROM employees WHERE id=?', subject.employeeId))
  )
    fail(404, 'Employee not found');
  const current = await assignmentsFor(db, subject);
  const target = subject.userId
    ? await db.get('SELECT * FROM users WHERE id=?', subject.userId)
    : await db.get('SELECT * FROM users WHERE employee_id=?', subject.employeeId);
  const existingOwner = target ? (await import('../auth.js')).loadUser : null;
  const targetProfile = existingOwner ? await existingOwner(db, target.id) : null;
  if (
    !subject.employeeId &&
    !target?.employee_id &&
    assignments.every((a) => !['ceo', 'admin'].includes(a.role))
  )
    fail(400, 'Link this login to an employee before assigning Head, Manager or Employee');
  if (
    (assignments.some((a) => a.role === 'ceo') ||
      current.some((a) => a.role === 'ceo') ||
      isCEO(targetProfile)) &&
    !isCEO(actor)
  )
    fail(403, 'Only a CEO can assign or change a CEO role');
  if (target?.id === actor.id && (!isCEO(actor) || !assignments.some((a) => a.role === 'ceo')))
    fail(400, 'You cannot remove your own access or change your own role');
  if (
    !actor.managedAccess &&
    actor.role !== 'admin' &&
    assignments.some((a) => ['ceo', 'admin'].includes(a.role))
  )
    fail(403, 'Only an administrator or CEO can assign privileged roles');
  await saveAssignments(db, subject, assignments);
  // Sessions are rechecked on every API request; password/session data is retained.
  await audit(
    db,
    actor,
    'roles.assign',
    subject.employeeId ? 'employee' : 'user',
    subject.employeeId || subject.userId,
    { before: current, assignments },
  );
  return assignments;
}
