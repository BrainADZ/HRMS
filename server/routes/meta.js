import { lanAddresses, isLoopback } from '../lib/network.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  getSettings,
  isHR,
  today,
  str,
  oneOf,
  id,
  fail,
  notFound,
  requireHR,
  fullName,
  notifyUsers,
  scopeIds,
  DOC_CATEGORIES,
} from '../core.js';
import { aiEnabled } from '../services/ai.js';
import { canUploadDocuments, SELF_UPLOAD_DOCUMENTS } from '../services/document-access.js';
import { geofencePolicy, exemption } from '../services/geofence.js';

export default function metaRoutes(r, { db, uploads }) {
  r.get('/meta', async (req, res) => {
    const s = await getSettings(db);
    res.json({
      today: await today(db),
      settings: {
        companyName: s.companyName,
        weeklyOffs: s.weeklyOffs,
        timezone: s.timezone,
        noticePeriodDays: s.noticePeriodDays,
        noticePeriodSeniorDays: s.noticePeriodSeniorDays,
        demo: Boolean(s.demo),
        workHours: s.workHours,
        requiredDocuments: s.requiredDocuments,
      },
      documentCategories: DOC_CATEGORIES,
      selfUploadDocumentCategories: req.user.employeeId ? SELF_UPLOAD_DOCUMENTS : [],
      canUploadDocuments: await canUploadDocuments(db, req.user),
      verticals: await db.all('SELECT * FROM verticals ORDER BY id'),
      departments: await db.all('SELECT * FROM departments ORDER BY name'),
      locations: await db.all('SELECT * FROM locations ORDER BY name'),
      leaveTypes: await db.all('SELECT * FROM leave_types WHERE active = 1 ORDER BY sort, id'),
      employees: await db.all(`
        SELECT e.id, e.code, e.first_name || CASE WHEN e.last_name != '' THEN ' ' || e.last_name ELSE '' END AS name,
               e.designation, e.department_id, e.vertical_id, e.location_id, e.status, e.gender, e.manager_id,
               e.photo IS NOT NULL AS has_photo, e.email
        FROM employees e WHERE e.status != 'Exited' ORDER BY e.first_name, e.last_name`),
      ai: aiEnabled(),
      icc: await isIcc(db, req.user),
      geofence: {
        mode: geofencePolicy(s).mode,
        exempt: (await exemption(db, req.user, s, await today(db)))?.reason || null,
      },
    });
  });

  r.get('/meta/addresses', (req, res) => {
    const port = req.socket?.localPort;
    res.json({
      urls:
        isLoopback(req.socket?.remoteAddress) && port
          ? lanAddresses().map((ip) => `http://${ip}:${port}`)
          : [],
    });
  });

  r.get('/files/photo/:employeeId', async (req, res) => {
    const photo = await db.value(
      'SELECT photo FROM employees WHERE id = ?',
      id(req.params.employeeId),
    );
    if (!photo) notFound('Photo');
    const file = path.join(uploads, 'photos', path.basename(photo));
    if (!fs.existsSync(file)) notFound('Photo');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.sendFile(file);
  });

  r.get('/files/avatar/:userId', async (req, res) => {
    const uid = id(req.params.userId);
    if (uid !== req.user.id && !isHR(req.user)) fail(403, 'You cannot view this account photo');
    const photo = await db.value('SELECT photo FROM users WHERE id=?', uid);
    if (!photo) notFound('Photo');
    const file = path.join(uploads, 'photos', path.basename(photo));
    if (!fs.existsSync(file)) notFound('Photo');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.sendFile(file);
  });

  r.get('/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const vertical = req.query.vertical ? Number(req.query.vertical) : null;
    const vf = vertical ? 'AND e.vertical_id = ?' : '';
    const vp = vertical ? [vertical] : [];
    const results = [];
    for (const e of await db.all(
      `
      SELECT e.id, e.first_name, e.last_name, e.code, e.designation, e.status FROM employees e
      WHERE (e.first_name || ' ' || e.last_name LIKE ? OR e.code LIKE ? OR e.email LIKE ? OR e.designation LIKE ?) ${vf}
      ORDER BY e.status = 'Exited', e.first_name LIMIT 8`,
      like,
      like,
      like,
      like,
      ...vp,
    )) {
      results.push({
        type: 'Employee',
        id: e.id,
        title: fullName(e),
        subtitle: `${e.code} · ${e.designation || ''}${e.status === 'Exited' ? ' · Exited' : ''}`,
        link: `/employees/${e.id}`,
      });
    }
    if (isHR(req.user)) {
      for (const c of await db.all(
        `SELECT c.id, c.name, c.stage, j.title FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id
        WHERE (c.name LIKE ? OR c.email LIKE ? OR c.skills LIKE ?) ${vertical ? 'AND j.vertical_id = ?' : ''} LIMIT 6`,
        like,
        like,
        like,
        ...vp,
      )) {
        results.push({
          type: 'Candidate',
          id: c.id,
          title: c.name,
          subtitle: `${c.title || 'No job'} · ${c.stage}`,
          link: `/hiring?candidate=${c.id}`,
        });
      }
      for (const j of await db.all(
        `SELECT id, title, status FROM jobs WHERE title LIKE ? ${vertical ? 'AND vertical_id = ?' : ''} LIMIT 4`,
        like,
        ...vp,
      )) {
        results.push({
          type: 'Job',
          id: j.id,
          title: j.title,
          subtitle: j.status,
          link: `/hiring?job=${j.id}`,
        });
      }
    }
    for (const p of await db.all(
      'SELECT id, title, version FROM policies WHERE title LIKE ? OR content LIKE ? LIMIT 4',
      like,
      like,
    )) {
      results.push({
        type: 'Policy',
        id: p.id,
        title: p.title,
        subtitle: `v${p.version}`,
        link: `/leave?tab=policies&policy=${p.id}`,
      });
    }
    res.json({ results });
  });

  // ---------- notifications ----------
  r.get('/notifications', async (req, res) => {
    res.json({
      items: await db.all(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30',
        req.user.id,
      ),
      unread: await db.value(
        'SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0',
        req.user.id,
      ),
    });
  });
  r.post('/notifications/:id/read', async (req, res) => {
    await db.run(
      'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
      id(req.params.id),
      req.user.id,
    );
    res.json({ ok: true });
  });
  r.post('/notifications/read-all', async (req, res) => {
    await db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
    res.json({ ok: true });
  });

  // ---------- notice board ----------
  r.get('/notices', async (_req, res) => {
    res.json({
      items: await db.all('SELECT * FROM notices ORDER BY created_at DESC, id DESC LIMIT 50'),
    });
  });
  r.post('/notices', async (req, res) => {
    if (!isHR(req.user) && req.user.role !== 'manager') fail(403, 'Managers or HR only');
    const title = str(req.body.title, { required: true, max: 120, name: 'Title' });
    const body = str(req.body.body, { max: 2000 });
    const kind = oneOf(
      req.body.kind || 'general',
      ['general', 'health', 'policy', 'award', 'event'],
      { name: 'Type' },
    );
    const nid = await db.insert('notices', { title, body, kind, created_by: req.user.id });
    await notifyUsers(
      db,
      (await db.all('SELECT id FROM users WHERE active = 1 AND id != ?', req.user.id)).map(
        (u) => u.id,
      ),
      `Notice: ${title}`,
      '/',
    );
    res.json({ id: nid });
  });
  r.delete('/notices/:id', async (req, res) => {
    if (!isHR(req.user) && req.user.role !== 'manager') fail(403, 'Managers or HR only');
    if (req.user.role === 'manager' && !(await db.value('SELECT 1 FROM notices WHERE id = ? AND created_by = ?', id(req.params.id), req.user.id))) fail(403, 'You can delete only your own announcements');
    await db.run('DELETE FROM notices WHERE id = ?', id(req.params.id));
    res.json({ ok: true });
  });

  // ---------- helpdesk requests ----------
  r.get('/requests', async (req, res) => {
    const scope = await scopeIds(db, req.user);
    const mine = req.query.mine === '1' || !isHR(req.user);
    const rows = await db.all(
      `
      SELECT q.*, e.first_name, e.last_name, e.code FROM requests q JOIN employees e ON e.id = q.employee_id
      WHERE 1=1 ${mine ? 'AND q.employee_id = ?' : ''} ${req.query.vertical ? 'AND e.vertical_id = ?' : ''} ORDER BY q.status = 'Resolved', q.created_at DESC LIMIT 200`,
      ...(mine ? [req.user.employeeId || 0] : []),
      ...(req.query.vertical ? [Number(req.query.vertical)] : []),
    );
    res.json({
      items: rows.map((q) => ({ ...q, employee: fullName(q) })),
      scope: scope === null ? 'all' : 'mine',
    });
  });
  r.post('/requests', async (req, res) => {
    if (!req.user.employeeId) fail(400, 'Your login is not linked to an employee record');
    const category = oneOf(req.body.category, ['HR', 'IT', 'Payroll', 'Admin', 'Other'], {
      required: true,
      name: 'Category',
    });
    const subject = str(req.body.subject, { required: true, max: 150, name: 'Subject' });
    const description = str(req.body.description, { max: 2000 });
    const rid = await db.insert('requests', {
      employee_id: req.user.employeeId,
      category,
      subject,
      description,
    });
    await notifyUsers(
      db,
      (await db.all("SELECT id FROM users WHERE role IN ('admin','hr') AND active = 1")).map(
        (u) => u.id,
      ),
      `${req.user.name} raised a ${category} request: ${subject}`,
      '/employees?tab=requests',
    );
    res.json({ id: rid });
  });
  r.put('/requests/:id', async (req, res) => {
    requireHR(req);
    const rid = id(req.params.id);
    const row = (await db.get('SELECT * FROM requests WHERE id = ?', rid)) || notFound('Request');
    const status = oneOf(req.body.status, ['Open', 'In Progress', 'Resolved'], {
      required: true,
      name: 'Status',
    });
    const response = str(req.body.response, { max: 2000 });
    await db.update('requests', rid, { status, response, updated_at: new Date().toISOString() });
    const uid = await db.value('SELECT id FROM users WHERE employee_id = ?', row.employee_id);
    await notifyUsers(
      db,
      [uid],
      `Your ${row.category} request "${row.subject}" is ${status.toLowerCase()}`,
      '/my',
    );
    res.json({ ok: true });
  });
}

export async function isIcc(db, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const icc = (await getSettings(db)).icc || {};
  return (
    Boolean(user.employeeId) &&
    (icc.presidingOfficerId === user.employeeId || (icc.memberIds || []).includes(user.employeeId))
  );
}
