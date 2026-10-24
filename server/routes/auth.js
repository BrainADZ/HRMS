import { createHmac, randomBytes } from 'node:crypto';
import {
  createSession,
  destroySession,
  verifyPassword,
  hashPassword,
  checkPasswordStrength,
  loginThrottle,
  loadUser,
} from '../auth.js';
import {
  getSettings,
  str,
  email as validateEmail,
  fail,
  audit,
  today,
  notifyUsers,
  fullName,
} from '../core.js';
import { endSession, workDate, shiftEnd } from '../services/workday.js';
import { checkLocation, logLocation, readCoords, geofencePolicy } from '../services/geofence.js';
import * as D from '../lib/dates.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../seed.js';
import { aiEnabled } from '../services/ai.js';
import { workflow } from '../database/workflows.js';
import {
  requestAdminReset,
  completeAdminReset,
  RESET_EMAIL_MESSAGE,
} from '../services/admin-password-reset.js';
import { celebrations } from '../services/celebrations.js';

export default function authRoutes(r, { db, passwordResetMailer }) {
  r.get('/auth/celebrations', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await celebrations(db));
  });
  const quickLoginSecret = randomBytes(32);
  const quickLoginEnabled = (req) =>
    process.env.LOCAL_QUICK_LOGIN === 'true' &&
    process.env.NODE_ENV !== 'production' &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname);
  const quickToken = (id) =>
    createHmac('sha256', quickLoginSecret).update(String(id)).digest('hex');
  const exposeDemo = (settings) =>
    Boolean(settings.demo) &&
    process.env.NODE_ENV !== 'production' &&
    process.env.EXPOSE_DEMO_LOGINS !== 'false';
  r.get('/auth/config', async (req, res) => {
    const s = await getSettings(db);
    res.set('Cache-Control', 'no-store');
    const quickAccounts = quickLoginEnabled(req)
      ? await db.all(
          "SELECT id, email, username, role, display_name FROM users WHERE active = 1 AND role IN ('admin', 'manager', 'employee') ORDER BY id",
        )
      : [];
    res.json({
      quickAccounts: ['admin', 'manager', 'employee'].flatMap((role) => {
        const user = quickAccounts.find((account) => account.role === role);
        return user
          ? [
              {
                email: user.email,
                username: user.username,
                name: user.display_name || user.email,
                label: role[0].toUpperCase() + role.slice(1),
                loginType: role === 'admin' ? 'admin' : 'employee',
                quickLoginToken: quickToken(user.id),
              },
            ]
          : [];
      }),
      companyName: s.companyName,
      officeOnly: geofencePolicy(s).mode !== 'off',
      demo: exposeDemo(s),
      demoAccounts: exposeDemo(s)
        ? await Promise.all(
            DEMO_ACCOUNTS.map(async (a) => {
              const user = await db.get(
                `SELECT u.role, u.username, e.designation, d.name AS department,
                        m.first_name AS manager_first, m.last_name AS manager_last
                   FROM users u
                   LEFT JOIN employees e ON e.id = u.employee_id
                   LEFT JOIN departments d ON d.id = e.department_id
                   LEFT JOIN employees m ON m.id = e.manager_id
                  WHERE u.email = ?`,
                a.email,
              );
              return {
                ...a,
                username: user?.username,
                designation: user?.designation,
                department: user?.department,
                reportsTo: user?.manager_first
                  ? `${user.manager_first} ${user.manager_last}`
                  : null,
                loginType: user?.role === 'admin' ? 'admin' : 'employee',
                password: DEMO_PASSWORD,
              };
            }),
          )
        : [],
    });
  });

  r.post('/auth/login', async (req, res) => {
    const loginType = req.body?.loginType || (req.body?.username ? 'employee' : 'admin');
    if (!['admin', 'employee'].includes(loginType))
      fail(400, 'Choose administrator or employee sign-in');
    const identifier = str(loginType === 'admin' ? req.body?.email : req.body?.username, {
      required: true,
      name: loginType === 'admin' ? 'Email' : 'Username',
      max: 200,
    }).toLowerCase();
    const password = String(req.body?.password || '');
    if (password.length > 200) fail(400, 'Password is too long');
    const guard = loginThrottle(`${req.ip}|${identifier}`);
    const user =
      loginType === 'admin'
        ? await db.get(
            "SELECT id, password_hash, active FROM users WHERE LOWER(email) = ? AND role = 'admin'",
            identifier,
          )
        : await db.get(
            "SELECT id, password_hash, active FROM users WHERE LOWER(username) = ? AND role != 'admin'",
            identifier,
          );
    const quickLogin =
      quickLoginEnabled(req) && user && req.body?.quickLoginToken === quickToken(user.id);
    if (!user || !user.active || (!quickLogin && !verifyPassword(password, user.password_hash))) {
      guard.failed();
      fail(401, 'Incorrect login details');
    }
    guard.succeeded();
    // Location check after the password, so it reveals nothing to strangers.
    const settings = await getSettings(db);
    if (process.env.NODE_ENV === 'production' && password === DEMO_PASSWORD)
      fail(403, 'Replace the shared demo password before using this account in production');
    const T = workDate(await today(db), settings);
    const who = await loadUser(db, user.id);
    const coords = readCoords(req.body?.location);
    const check = await checkLocation(db, { user: who, coords, ip: req.ip, today: T, settings });
    if (!check.ok) {
      if (check.code !== 'location_required')
        await logLocation(db, { user: who, event: 'sign-in blocked', coords, ip: req.ip, check });
      return res.status(403).json({
        error: check.message,
        code: check.code,
        distance: check.distance ?? null,
        office: check.site?.name ?? null,
      });
    }
    if (geofencePolicy(settings).mode !== 'off')
      await logLocation(db, { user: who, event: 'sign-in', coords, ip: req.ip, check });
    await db.run('UPDATE users SET last_login = ? WHERE id = ?', new Date().toISOString(), user.id);
    // Office-only sign-ins last until midnight, so each workday starts in the office.
    const expiresAt =
      settings.workdayEnd < settings.workdayStart
        ? shiftEnd(T, settings)
        : D.zonedIso(D.addDays(T, 1), '00:00', settings.timezone);
    await createSession(db, req, res, user.id, check.dayBound ? { expiresAt } : {});
    res.json({
      ok: true,
      location:
        check.method === 'exempt'
          ? { exempt: check.exempt }
          : { office: check.site?.name, method: check.method, distance: check.distance ?? null },
    });
  });

  r.post('/auth/password-reset-request', async (req, res) => {
    const loginType = req.body?.loginType || (req.body?.email ? 'admin' : 'employee');
    if (!['admin', 'employee'].includes(loginType))
      fail(400, 'Choose administrator or employee sign-in');
    const adminRequest = loginType === 'admin';
    const identifier = adminRequest
      ? validateEmail(req.body?.email, { required: true })
      : str(req.body?.username, { required: true, name: 'Username', max: 200 }).toLowerCase();
    if (adminRequest) {
      loginThrottle(`admin-reset:${req.ip}`).failed();
      await requestAdminReset(db, passwordResetMailer, identifier);
      return res.json({ ok: true, message: RESET_EMAIL_MESSAGE });
    }
    const message =
      'If this employee username is active, an administrator will receive the request. Please contact your administrator for a temporary password.';
    await workflow(db, async () => {
      const user = await db.get(
        `SELECT u.id, u.active, u.role, u.display_name, e.first_name, e.last_name FROM users u
        LEFT JOIN employees e ON e.id = u.employee_id WHERE LOWER(u.username) = ? AND u.role != 'admin'`,
        identifier,
      );
      if (user?.active) {
        const created =
          (
            await db.run(
              'INSERT INTO password_reset_requests (user_id) VALUES (?) ON CONFLICT DO NOTHING',
              user.id,
            )
          ).changes > 0;
        if (created) {
          const admins = (
            await db.all(
              "SELECT id FROM users WHERE role = 'admin' AND active = 1 AND id != ?",
              user.id,
            )
          ).map((admin) => admin.id);
          await notifyUsers(
            db,
            admins,
            `${user.first_name ? fullName(user) : user.display_name || identifier} requested a password reset`,
            '/settings?tab=users',
          );
          await audit(db, user, 'password.reset_request', 'user', user.id);
        }
      }
    });
    res.json({ ok: true, message });
  });

  r.post('/auth/password-reset', async (req, res) => {
    loginThrottle(`admin-reset-complete:${req.ip}`).failed();
    await completeAdminReset(db, req.body?.token, req.body?.password);
    res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
  });

  // pause: true stops the work clock; the next sign-in asks why the employee was away.
  r.post('/auth/logout', async (req, res) => {
    let paused = null;
    if (req.user?.employeeId && req.body?.pause)
      paused = await endSession(db, {
        employeeId: req.user.employeeId,
        date: workDate(await today(db), await getSettings(db)),
        by: 'signout',
        userId: req.user.id,
      });
    await destroySession(db, req, res);
    res.json({ ok: true, paused: Boolean(paused) });
  });

  r.get('/auth/me', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in' });
    const s = await getSettings(db);
    res.json({
      user: req.user,
      companyName: s.companyName,
      demo: exposeDemo(s),
      ai: aiEnabled(),
      sessionExpiresAt: req.sessionExpiresAt,
    });
  });

  r.post('/auth/change-password', async (req, res) => {
    if (!req.user) fail(401, 'Please sign in');
    if (String(req.body?.current || '').length > 200) fail(400, 'Password is too long');
    const row = await db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
    if (!verifyPassword(String(req.body?.current || ''), row.password_hash))
      fail(400, 'Current password is incorrect');
    const next = String(req.body?.next || '');
    checkPasswordStrength(next);
    await db.tx(async () => {
      await db.run(
        'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
        hashPassword(next),
        req.user.id,
      );
      await db.run('DELETE FROM sessions WHERE user_id = ?', req.user.id);
    });
    await createSession(db, req, res, req.user.id, { expiresAt: req.sessionExpiresAt });
    await audit(db, req.user, 'password.change', 'user', req.user.id);
    res.json({ ok: true });
  });
}
