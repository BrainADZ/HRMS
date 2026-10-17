import { createSession, destroySession, verifyPassword, hashPassword, checkPasswordStrength, loginThrottle, loadUser } from '../auth.js';
import { getSettings, str, fail, audit, today } from '../core.js';
import { endSession, workDate, shiftEnd } from '../services/workday.js';
import { checkLocation, logLocation, readCoords, geofencePolicy } from '../services/geofence.js';
import * as D from '../lib/dates.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../seed.js';
import { aiEnabled } from '../services/ai.js';

export default function authRoutes(r, { db }) {
  const exposeDemo = (settings) => Boolean(settings.demo) && process.env.NODE_ENV !== 'production' && process.env.EXPOSE_DEMO_LOGINS !== 'false';
  r.get('/auth/config', async (_req, res) => {
    const s = await getSettings(db);
    res.json({
      companyName: s.companyName,
      officeOnly: geofencePolicy(s).mode !== 'off',
      demo: exposeDemo(s),
      demoAccounts: exposeDemo(s) ? await Promise.all(DEMO_ACCOUNTS.map(async (a) => {
        const user = await db.get('SELECT role, username FROM users WHERE email = ?', a.email);
        return { ...a, username: user?.username, loginType: user?.role === 'admin' ? 'admin' : 'employee', password: DEMO_PASSWORD };
      })) : []
    });
  });

  r.post('/auth/login', async (req, res) => {
    const loginType = req.body?.loginType || (req.body?.username ? 'employee' : 'admin');
    if (!['admin', 'employee'].includes(loginType)) fail(400, 'Choose administrator or employee sign-in');
    const identifier = str(loginType === 'admin' ? req.body?.email : req.body?.username, { required: true, name: loginType === 'admin' ? 'Email' : 'Username', max: 200 }).toLowerCase();
    const password = String(req.body?.password || '');
    if (password.length > 200) fail(400, 'Password is too long');
    const guard = loginThrottle(`${req.ip}|${identifier}`);
    const user = loginType === 'admin'
      ? await db.get("SELECT id, password_hash, active FROM users WHERE LOWER(email) = ? AND role = 'admin'", identifier)
      : await db.get("SELECT id, password_hash, active FROM users WHERE LOWER(username) = ? AND role != 'admin'", identifier);
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      guard.failed();
      fail(401, 'Incorrect login details');
    }
    guard.succeeded();
    // Location check after the password, so it reveals nothing to strangers.
    const settings = await getSettings(db);
    if (process.env.NODE_ENV === 'production' && password === DEMO_PASSWORD) fail(403, 'Replace the shared demo password before using this account in production');
    const T = workDate(await today(db), settings);
    const who = await loadUser(db, user.id);
    const coords = readCoords(req.body?.location);
    const check = await checkLocation(db, { user: who, coords, ip: req.ip, today: T, settings });
    if (!check.ok) {
      if (check.code !== 'location_required') await logLocation(db, { user: who, event: 'sign-in blocked', coords, ip: req.ip, check });
      return res.status(403).json({ error: check.message, code: check.code, distance: check.distance ?? null, office: check.site?.name ?? null });
    }
    if (geofencePolicy(settings).mode !== 'off') await logLocation(db, { user: who, event: 'sign-in', coords, ip: req.ip, check });
    await db.run('UPDATE users SET last_login = ? WHERE id = ?', new Date().toISOString(), user.id);
    // Office-only sign-ins last until midnight, so each workday starts in the office.
    const expiresAt = settings.workdayEnd < settings.workdayStart ? shiftEnd(T, settings) : D.zonedIso(D.addDays(T, 1), '00:00', settings.timezone);
    await createSession(db, req, res, user.id, check.dayBound ? { expiresAt } : {});
    res.json({ ok: true, location: check.method === 'exempt' ? { exempt: check.exempt } : { office: check.site?.name, method: check.method, distance: check.distance ?? null } });
  });

  // pause: true stops the work clock; the next sign-in asks why the employee was away.
  r.post('/auth/logout', async (req, res) => {
    let paused = null;
    if (req.user?.employeeId && req.body?.pause) paused = await endSession(db, { employeeId: req.user.employeeId, date: workDate(await today(db), await getSettings(db)), by: 'signout', userId: req.user.id });
    await destroySession(db, req, res);
    res.json({ ok: true, paused: Boolean(paused) });
  });

  r.get('/auth/me', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in' });
    const s = await getSettings(db);
    res.json({ user: req.user, companyName: s.companyName, demo: exposeDemo(s), ai: aiEnabled(), sessionExpiresAt: req.sessionExpiresAt });
  });

  r.post('/auth/change-password', async (req, res) => {
    if (!req.user) fail(401, 'Please sign in');
    if (String(req.body?.current || '').length > 200) fail(400, 'Password is too long');
    const row = await db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
    if (!verifyPassword(String(req.body?.current || ''), row.password_hash)) fail(400, 'Current password is incorrect');
    const next = String(req.body?.next || '');
    checkPasswordStrength(next);
    await db.tx(async () => {
      await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', hashPassword(next), req.user.id);
      await db.run('DELETE FROM sessions WHERE user_id = ?', req.user.id);
    });
    await createSession(db, req, res, req.user.id, { expiresAt: req.sessionExpiresAt });
    await audit(db, req.user, 'password.change', 'user', req.user.id);
    res.json({ ok: true });
  });
}
