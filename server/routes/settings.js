import { validatePayrollRules } from '../lib/payroll.js';
import { asyncForEach } from '../database/async.js';
import {
  getSettings,
  setSetting,
  requireHR,
  requireAdmin,
  isAdmin,
  str,
  num,
  oneOf,
  id,
  email,
  fail,
  notFound,
  audit,
  fullName,
  sendCsv,
  DEFAULT_SETTINGS,
} from '../core.js';
import {
  hashPassword,
  tempPassword,
  checkPasswordStrength,
  loginDetails,
  createSession,
} from '../auth.js';
import { LEAVE_TYPES, holidaysFor, policyLibrary } from '../seed.js';
import { seed50Demo } from '../seed-50-demo.js';
import * as D from '../lib/dates.js';
import { GEOFENCE_MODES, geofencePolicy } from '../services/geofence.js';
import { invalidatePayrollInputs } from '../services/payroll-inputs.js';

const MASTERS = {
  verticals: ['name', 'short', 'tagline', 'color'],
  departments: ['name'],
  locations: ['name'],
};
const MASTER_REFS = {
  verticals: ['employees.vertical_id', 'jobs.vertical_id'],
  departments: ['employees.department_id', 'jobs.department_id'],
  locations: ['employees.location_id', 'jobs.location_id'],
};
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function settingsRoutes(r, { db, saveFile }) {
  r.get('/settings', async (req, res) => {
    requireHR(req);
    res.json({
      settings: await getSettings(db),
      verticals: await db.all(
        "SELECT v.*, (SELECT COUNT(*) FROM employees e WHERE e.vertical_id = v.id AND e.status != 'Exited') AS employees FROM verticals v ORDER BY id",
      ),
      departments: await db.all(
        "SELECT d.*, (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.status != 'Exited') AS employees FROM departments d ORDER BY name",
      ),
      locations: await db.all(
        "SELECT l.*, (SELECT COUNT(*) FROM employees e WHERE e.location_id = l.id AND e.status != 'Exited') AS employees FROM locations l ORDER BY name",
      ),
      isAdmin: isAdmin(req.user),
    });
  });

  r.put('/settings', async (req, res) => {
    requireHR(req);
    const b = req.body;
    const cur = await getSettings(db);
    if (b.companyName !== undefined)
      await setSetting(
        db,
        'companyName',
        str(b.companyName, { required: true, max: 80, name: 'Company name' }),
      );
    if (b.weeklyOffs !== undefined) {
      const offs = (Array.isArray(b.weeklyOffs) ? b.weeklyOffs : [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
      if (offs.length > 3) fail(400, 'At most three weekly offs');
      await setSetting(db, 'weeklyOffs', [...new Set(offs)]);
    }
    if (b.workHours !== undefined)
      await setSetting(
        db,
        'workHours',
        num(b.workHours, { min: 1, max: 14, name: 'Working hours per day' }),
      );
    if (b.shortHoursGraceMinutes !== undefined)
      await setSetting(
        db,
        'shortHoursGraceMinutes',
        num(b.shortHoursGraceMinutes, { min: 0, max: 120, int: true, name: 'Grace minutes' }),
      );
    for (const k of ['workdayStart', 'workdayEnd', 'lateAfter']) {
      if (b[k] !== undefined) {
        if (!TIME_RE.test(b[k])) fail(400, 'Times must be HH:MM');
        await setSetting(db, k, b[k]);
      }
    }
    if (b.employeeCodePrefix !== undefined) {
      const p = str(b.employeeCodePrefix, {
        required: true,
        max: 5,
        name: 'Code prefix',
      }).toUpperCase();
      if (!/^[A-Z]{1,5}$/.test(p)) fail(400, 'Code prefix must be 1-5 letters');
      await setSetting(db, 'employeeCodePrefix', p);
    }
    if (b.noticePeriodDays !== undefined)
      await setSetting(
        db,
        'noticePeriodDays',
        num(b.noticePeriodDays, { min: 0, max: 180, int: true, name: 'Notice period' }),
      );
    if (b.noticePeriodSeniorDays !== undefined)
      await setSetting(
        db,
        'noticePeriodSeniorDays',
        num(b.noticePeriodSeniorDays, {
          min: 0,
          max: 180,
          int: true,
          name: 'Senior notice period',
        }),
      );
    if (b.bankName !== undefined)
      await setSetting(db, 'bankName', str(b.bankName, { max: 60 }) || 'HDFC Bank');
    if (b.geofence !== undefined) {
      const g = b.geofence || {};
      const prev = geofencePolicy(cur);
      const next = {
        mode:
          g.mode === undefined
            ? prev.mode
            : oneOf(g.mode, GEOFENCE_MODES, { name: 'Sign-in location rule' }),
        exemptEmployeeIds:
          g.exemptEmployeeIds === undefined
            ? prev.exemptEmployeeIds
            : [
                ...new Set(
                  (Array.isArray(g.exemptEmployeeIds) ? g.exemptEmployeeIds : [])
                    .map(Number)
                    .filter((x) => Number.isInteger(x) && x > 0),
                ),
              ],
        allowWfhAndLeave:
          g.allowWfhAndLeave === undefined ? prev.allowWfhAndLeave : Boolean(g.allowWfhAndLeave),
        maxAccuracyM:
          g.maxAccuracyM === undefined
            ? prev.maxAccuracyM
            : num(g.maxAccuracyM, { min: 100, max: 10000, int: true, name: 'Location accuracy' }),
      };
      if (
        next.mode !== 'off' &&
        !(await db.value('SELECT COUNT(*) FROM office_sites WHERE active = 1'))
      )
        fail(400, 'Add at least one office location before turning this on');
      await setSetting(db, 'geofence', next);
      await audit(db, req.user, 'settings.geofence', null, null, next);
    }
    if (b.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: b.timezone });
      } catch {
        fail(400, 'Unknown timezone');
      }
      await setSetting(db, 'timezone', b.timezone);
    }
    if (b.payroll) {
      const p = b.payroll;
      const n = (k, max, opts = {}) =>
        p[k] === undefined ? cur.payroll[k] : num(p[k], { min: 0, max, name: k, ...opts });
      await setSetting(db, 'payroll', {
        basicPct: await n('basicPct', 100),
        hraPct: await n('hraPct', 100),
        pfEnabled: p.pfEnabled === undefined ? cur.payroll.pfEnabled : Boolean(p.pfEnabled),
        pfRate: await n('pfRate', 20),
        pfWageCeiling: await n('pfWageCeiling', 1000000),
        esiThreshold: await n('esiThreshold', 1000000),
        esiEmployeeRate: await n('esiEmployeeRate', 10),
        esiEmployerRate: await n('esiEmployerRate', 10),
        ptAmount: await n('ptAmount', 5000),
        ptMinGross: await n('ptMinGross', 1000000),
        lwfEmployee: await n('lwfEmployee', 1000),
        lwfEmployer: await n('lwfEmployer', 1000),
        lwfMonths:
          p.lwfMonths === undefined
            ? cur.payroll.lwfMonths
            : (Array.isArray(p.lwfMonths) ? p.lwfMonths : [])
                .map(Number)
                .filter((x) => x >= 1 && x <= 12),
        unmarkedAs:
          p.unmarkedAs === undefined
            ? cur.payroll.unmarkedAs
            : oneOf(p.unmarkedAs, ['present', 'absent'], { name: 'Unmarked days' }),
      });
    }
    validatePayrollRules((await getSettings(db)).payroll);
    if (['weeklyOffs', 'timezone', 'payroll'].some((key) => key in b))
      await invalidatePayrollInputs(db);
    await audit(db, req.user, 'settings.update', 'settings', null, Object.keys(b));
    res.json({ ok: true, settings: await getSettings(db) });
  });

  // ---------- masters ----------
  for (const [table, fields] of Object.entries(MASTERS)) {
    const read = (b) => {
      const out = {};
      for (const f of fields) {
        if (f === 'color') out.color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#1A6DF0';
        else out[f] = str(b[f], { required: f === 'name' || f === 'short', max: 80, name: f });
      }
      if (table === 'verticals' && !out.short) out.short = out.name;
      return out;
    };
    r.post(`/settings/${table}`, async (req, res) => {
      requireHR(req);
      res.json({ id: await db.insert(table, read(req.body)) });
    });
    r.put(`/settings/${table}/:id`, async (req, res) => {
      requireHR(req);
      const rid = id(req.params.id);
      (await db.get(`SELECT 1 FROM ${table} WHERE id = ?`, rid)) || notFound();
      await db.update(table, rid, read(req.body));
      res.json({ ok: true });
    });
    r.delete(`/settings/${table}/:id`, async (req, res) => {
      requireHR(req);
      const rid = id(req.params.id);
      for (const ref of MASTER_REFS[table]) {
        const [t, col] = ref.split('.');
        if (await db.value(`SELECT COUNT(*) FROM ${t} WHERE ${col} = ?`, rid))
          fail(409, `This is still used in ${t}. Reassign those first.`);
      }
      await db.run(`DELETE FROM ${table} WHERE id = ?`, rid);
      res.json({ ok: true });
    });
  }

  // ---------- users & roles ----------
  r.get('/users', async (req, res) => {
    requireHR(req);
    const users = (
      await db.all(`SELECT u.id, u.email, u.username, u.role, u.display_name, u.active, u.last_login, u.must_change_password, u.employee_id, e.first_name, e.last_name, e.code, e.designation
      FROM users u LEFT JOIN employees e ON e.id = u.employee_id ORDER BY u.role, e.first_name`)
    ).map((u) => ({ ...u, name: u.first_name ? fullName(u) : u.display_name || u.email }));
    const without = await db.value(
      "SELECT COUNT(*) FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE u.id IS NULL AND e.status != 'Exited'",
    );
    const passwordRequests = isAdmin(req.user)
      ? await db.all(`SELECT p.id, p.user_id, p.requested_at, u.username, u.email, u.display_name,
      e.first_name, e.last_name, e.code FROM password_reset_requests p JOIN users u ON u.id = p.user_id
      LEFT JOIN employees e ON e.id = u.employee_id WHERE p.status = 'Pending' ORDER BY p.requested_at, p.id`)
      : [];
    res.json({
      users,
      withoutLogin: without,
      passwordRequests: passwordRequests.map((p) => ({
        ...p,
        name: p.first_name ? fullName(p) : p.display_name || p.username || p.email,
      })),
    });
  });

  r.put('/users/:id', async (req, res) => {
    requireHR(req);
    const u =
      (await db.get('SELECT * FROM users WHERE id = ?', id(req.params.id))) || notFound('User');
    const role = req.body.role
      ? oneOf(req.body.role, ['employee', 'manager', 'hr', 'admin'], { name: 'Role' })
      : u.role;
    if (role !== 'admin' && !u.employee_id)
      fail(400, 'Link this login to an employee before assigning a non-admin role');
    if ((role === 'admin' || u.role === 'admin') && !isAdmin(req.user))
      fail(403, 'Only an administrator can change admin access');
    if (u.id === req.user.id && (role !== u.role || req.body.active === false))
      fail(400, 'You cannot change your own role or deactivate yourself');
    const active = req.body.active === undefined ? u.active : req.body.active ? 1 : 0;
    if (
      u.role === 'admin' &&
      (role !== 'admin' || !active) &&
      (await db.value("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1")) <= 1
    )
      fail(400, 'There must be at least one active administrator');
    await db.update('users', u.id, { role, active });
    if (!active || role !== u.role) await db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
    await audit(db, req.user, 'user.update', 'user', u.id, { role, active });
    res.json({ ok: true });
  });

  r.post('/users/:id/reset', async (req, res) => {
    requireAdmin(req);
    const u =
      (await db.get('SELECT * FROM users WHERE id = ?', id(req.params.id))) || notFound('User');
    const temp = tempPassword();
    await db.tx(async () => {
      await db.update('users', u.id, {
        password_hash: hashPassword(temp),
        must_change_password: 1,
      });
      await db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
      await db.run(
        "UPDATE password_reset_requests SET status = 'Resolved', resolved_at = ?, resolved_by = ? WHERE user_id = ? AND status = 'Pending'",
        new Date().toISOString(),
        req.user.id,
        u.id,
      );
      await audit(db, req.user, 'user.reset', 'user', u.id);
    });
    res.json({ email: u.email, username: u.username, role: u.role, tempPassword: temp });
  });

  // Creates employee logins for everyone who does not have one; returns the
  // one-time passwords as a CSV for HR to distribute.
  r.post('/users/bulk-create', async (req, res) => {
    requireHR(req);
    const emps = await db.all(
      "SELECT e.* FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE u.id IS NULL AND e.status != 'Exited' ORDER BY e.code",
    );
    const created = [];
    await db.tx(async () => {
      for (const e of emps) {
        if (await db.value('SELECT 1 FROM users WHERE email = ?', e.email)) continue;
        const temp = tempPassword();
        const role = (await db.value(
          "SELECT COUNT(*) FROM employees WHERE manager_id = ? AND status != 'Exited'",
          e.id,
        ))
          ? 'manager'
          : 'employee';
        await db.insert('users', {
          email: e.email,
          password_hash: hashPassword(temp),
          role,
          employee_id: e.id,
          must_change_password: 1,
        });
        created.push({
          code: e.code,
          name: fullName(e),
          ...(await loginDetails(db, e.id)),
          password: temp,
        });
      }
    });
    await audit(db, req.user, 'user.bulk_create', 'user', null, { count: created.length });
    sendCsv(res, 'new-logins.csv', created, [
      { label: 'Employee ID', value: 'code' },
      { label: 'Name', value: 'name' },
      { label: 'Username', value: 'username' },
      { label: 'Email', value: 'email' },
      { label: 'Role', value: 'role' },
      { label: 'Temporary Password', value: 'password' },
    ]);
  });

  r.get('/audit', async (req, res) => {
    requireAdmin(req);
    res.json({
      items: await db.all(
        `SELECT a.*, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`,
      ),
    });
  });

  // ---------- office locations (sign-in location check) ----------
  const readSite = (b) => {
    const lat = num(b.lat, { required: true, min: -90, max: 90, name: 'Latitude' });
    const lng = num(b.lng, { required: true, min: -180, max: 180, name: 'Longitude' });
    const ranges = str(b.ip_ranges, { max: 500 });
    if (ranges) {
      for (const r of ranges.split(/[\s,]+/).filter(Boolean)) {
        if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(r))
          fail(400, `"${r}" is not an IPv4 address or range (e.g. 203.0.113.7 or 192.168.1.0/24)`);
      }
    }
    return {
      name: str(b.name, { required: true, max: 80, name: 'Office name' }),
      location_id: b.location_id ? id(b.location_id) : null,
      lat,
      lng,
      radius_m: num(b.radius_m ?? 300, { min: 50, max: 5000, int: true, name: 'Radius' }),
      ip_ranges: ranges || null,
      active: b.active === undefined ? 1 : b.active ? 1 : 0,
    };
  };
  r.get('/settings/offices', async (req, res) => {
    requireHR(req);
    const s = await getSettings(db);
    const policy = geofencePolicy(s);
    res.json({
      policy,
      offices: await db.all(
        'SELECT o.*, l.name AS location FROM office_sites o LEFT JOIN locations l ON l.id = o.location_id ORDER BY o.name',
      ),
      exempt: policy.exemptEmployeeIds.length
        ? (
            await db.all(
              `SELECT id, first_name, last_name, code, designation FROM employees WHERE id IN (${policy.exemptEmployeeIds.map(() => '?').join(',')})`,
              ...policy.exemptEmployeeIds,
            )
          ).map((e) => ({ ...e, name: fullName(e) }))
        : [],
      yourIp: String(req.ip || '').replace(/^::ffff:/, ''),
      demo: Boolean(s.demo),
    });
  });
  r.post('/settings/offices', async (req, res) => {
    requireHR(req);
    const oid = await db.insert('office_sites', readSite(req.body));
    await audit(db, req.user, 'office.add', 'office', oid);
    res.json({ id: oid });
  });
  r.put('/settings/offices/:id', async (req, res) => {
    requireHR(req);
    const o =
      (await db.get('SELECT * FROM office_sites WHERE id = ?', id(req.params.id))) ||
      notFound('Office');
    await db.update('office_sites', o.id, readSite({ ...o, ...req.body }));
    await audit(db, req.user, 'office.edit', 'office', o.id);
    res.json({ ok: true });
  });
  r.delete('/settings/offices/:id', async (req, res) => {
    requireHR(req);
    const o =
      (await db.get('SELECT * FROM office_sites WHERE id = ?', id(req.params.id))) ||
      notFound('Office');
    const remaining = await db.value(
      'SELECT COUNT(*) FROM office_sites WHERE active = 1 AND id != ?',
      o.id,
    );
    if (!remaining && geofencePolicy(await getSettings(db)).mode !== 'off')
      fail(400, 'Turn off the sign-in location rule before removing the last office');
    await db.run('DELETE FROM office_sites WHERE id = ?', o.id);
    await audit(db, req.user, 'office.delete', 'office', o.id);
    res.json({ ok: true });
  });

  // ---------- data management (admin) ----------
  const TABLES = [
    'notifications',
    'sessions',
    'admin_password_reset_tokens',
    'password_reset_requests',
    'audit_log',
    'candidate_activity',
    'interviews',
    'onboarding_tasks',
    'candidates',
    'jobs',
    'payslips',
    'payroll_runs',
    'payroll_adjustments',
    'resignations',
    'goals',
    'reviews',
    'review_cycles',
    'assets',
    'documents',
    'requests',
    'posh_complaints',
    'posh_training',
    'policy_acks',
    'policies',
    'notices',
    'location_log',
    'hour_shortfalls',
    'work_sessions',
    'attendance',
    'leave_requests',
    'holidays',
    'leave_types',
    'users',
    'employees',
    'verticals',
    'departments',
    'locations',
    'settings',
  ];

  async function wipe(keepUserId = null) {
    await db.tx(async () => {
      await db.exec('SET CONSTRAINTS ALL DEFERRED');
      // Preserve the administrator session without disabling referential integrity.
      if (keepUserId) await db.run('UPDATE users SET employee_id = NULL WHERE id = ?', keepUserId);
      for (const table of TABLES) {
        if (table === 'users' && keepUserId)
          await db.run('DELETE FROM users WHERE id != ?', keepUserId);
        else if (table === 'sessions' && keepUserId)
          await db.run('DELETE FROM sessions WHERE user_id != ?', keepUserId);
        else await db.run(`DELETE FROM ${table}`);
      }
    });
  }

  r.post('/settings/reset-demo', async (req, res) => {
    requireAdmin(req);
    if (req.body.confirm !== 'RESET') fail(400, 'Type RESET to confirm');
    await db.tx(async () => {
      await wipe();
      await seed50Demo(db, { saveFile });
    });
    res.json({ ok: true });
  });

  // Removes all demo records and keeps only the current administrator, so a
  // company can start entering its real data. The demo password is public,
  // so the administrator must choose their own email and password here.
  r.post('/settings/start-fresh', async (req, res) => {
    requireAdmin(req);
    if (req.body.confirm !== 'START FRESH') fail(400, 'Type START FRESH to confirm');
    const adminEmail = email(req.body.email, { required: true });
    const adminName = str(req.body.name, { max: 120, name: 'Administrator name' });
    checkPasswordStrength(req.body.password);
    const keep = req.user.id;
    await db.tx(async () => {
      await wipe(keep);
      await db.run(
        'UPDATE users SET employee_id = NULL, display_name = ?, email = ?, password_hash = ?, must_change_password = 0 WHERE id = ?',
        adminName,
        adminEmail,
        hashPassword(req.body.password),
        keep,
      );
      await db.run('DELETE FROM sessions WHERE user_id = ?', keep);
      await setSetting(db, 'demo', false);
      await setSetting(
        db,
        'companyName',
        (await getSettings(db)).companyName || DEFAULT_SETTINGS.companyName,
      );
      for (const v of [
        ['BrainADZ Live', 'Live', 'From Vision to Visibility', '#E5243B'],
        ['BrainADZ Marketing', 'Marketing', 'Ideas That Spark Momentum', '#1FB2D6'],
        ['BrainADZ Exhibits', 'Exhibits', 'Where Elegance Meets Execution', '#8CC63F'],
        ['Corporate', 'Corporate', 'Shared services', '#7C5CFC'],
      ]) {
        await db.insert('verticals', { name: v[0], short: v[1], tagline: v[2], color: v[3] });
      }
      for (const d of [
        'Leadership',
        'Sales',
        'Events',
        'Client Servicing',
        'Marketing',
        'Creative',
        'Technology',
        'Operations',
        'Design',
        'Business Development',
        'HR',
        'Finance',
        'IT',
        'Admin',
      ])
        await db.insert('departments', { name: d });
      for (const l of ['Bengaluru', 'Mumbai', 'Delhi NCR'])
        await db.insert('locations', { name: l });
      await asyncForEach(
        LEAVE_TYPES,
        async (t, i) => await db.insert('leave_types', { ...t, sort: i }),
      );
      const y = D.yearOf(D.todayIn('Asia/Kolkata'));
      for (const yr of [y, y + 1])
        for (const [date, name, type] of holidaysFor(yr))
          await db.insert('holidays', { date, name, type });
      for (const p of policyLibrary(D.todayIn('Asia/Kolkata'))) await db.insert('policies', p);
    });
    await createSession(db, req, res, keep);
    res.json({ ok: true });
  });
}
