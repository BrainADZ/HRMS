import { authorizePolicyUpload } from '../services/uploads.js';
import { asyncMap } from '../database/async.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  today,
  isHR,
  isAdmin,
  requireHR,
  requireAdmin,
  fullName,
  str,
  oneOf,
  id,
  fail,
  notFound,
  getSettings,
  setSetting,
  notifyUsers,
  userIdForEmployee,
  audit,
  date,
} from '../core.js';
import { json } from '../db.js';
import * as D from '../lib/dates.js';
import { isIcc } from './meta.js';

const CATEGORIES = ['Leave', 'General', 'Compliance', 'POSH', 'IT', 'Finance', 'HR'];

function bumpVersion(v) {
  const [maj, min = '0'] = String(v || '1.0').split('.');
  return `${maj}.${Number(min) + 1}`;
}

async function iccUserIds(db) {
  const icc = (await getSettings(db)).icc || {};
  const empIds = [icc.presidingOfficerId, ...(icc.memberIds || [])].filter(Boolean);
  const ids = (await asyncMap(empIds, async (e) => await userIdForEmployee(db, e))).filter(Boolean);
  return [
    ...ids,
    ...(await db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1")).map((u) => u.id),
  ];
}

export default function policyRoutes(r, { db, uploads, upload }) {
  r.get('/policies', async (req, res) => {
    const T = await today(db);
    const current = await db.all(
      "SELECT e.id, e.department_id, d.name AS department FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.status != 'Exited' AND e.join_date <= ?",
      T,
    );
    const items = await asyncMap(
      await db.all(
        'SELECT id, title, category, version, summary, requires_ack, file_name, updated_at FROM policies ORDER BY title',
      ),
      async (p) => {
        const acked = await db.value(
          "SELECT COUNT(*) FROM policy_acks a JOIN employees e ON e.id = a.employee_id AND e.status != 'Exited' WHERE a.policy_id = ? AND a.version = ?",
          p.id,
          p.version,
        );
        const mine = req.user.employeeId
          ? await db.get(
              'SELECT version, acked_at FROM policy_acks WHERE policy_id = ? AND employee_id = ?',
              p.id,
              req.user.employeeId,
            )
          : null;
        return {
          ...p,
          acked,
          total: current.length,
          myAck: mine && mine.version === p.version ? mine.acked_at : null,
          myAckOutdated: Boolean(mine && mine.version !== p.version),
        };
      },
    );
    // Acknowledgement of all required policies, by department.
    const required = await db.all('SELECT id, version FROM policies WHERE requires_ack = 1');
    const ackCount = new Map(
      (
        await db.all(
          `SELECT a.employee_id, COUNT(*) n FROM policy_acks a JOIN policies p ON p.id = a.policy_id AND p.version = a.version AND p.requires_ack = 1 GROUP BY a.employee_id`,
        )
      ).map((x) => [x.employee_id, x.n]),
    );
    const byDept = new Map();
    for (const e of current) {
      const k = e.department || 'Unassigned';
      const v = byDept.get(k) || { label: k, acked: 0, total: 0 };
      v.total++;
      if ((ackCount.get(e.id) || 0) >= required.length) v.acked++;
      byDept.set(k, v);
    }
    const fully = [...byDept.values()].reduce((t, d) => t + d.acked, 0);
    res.json({
      items,
      byDepartment: [...byDept.values()].sort((a, b) => b.total - a.total),
      overall: { acked: fully, total: current.length },
    });
  });

  r.get('/policies/:id', async (req, res) => {
    const p =
      (await db.get('SELECT * FROM policies WHERE id = ?', id(req.params.id))) ||
      notFound('Policy');
    const mine = req.user.employeeId
      ? await db.get(
          'SELECT version, acked_at FROM policy_acks WHERE policy_id = ? AND employee_id = ?',
          p.id,
          req.user.employeeId,
        )
      : null;
    const pending =
      isHR(req.user) && p.requires_ack
        ? (
            await db.all(
              `SELECT e.id, e.first_name, e.last_name, e.code, d.name AS department FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN policy_acks a ON a.employee_id = e.id AND a.policy_id = ? AND a.version = ?
      WHERE e.status != 'Exited' AND e.join_date <= ? AND a.policy_id IS NULL ORDER BY e.first_name`,
              p.id,
              p.version,
              await today(db),
            )
          ).map((e) => ({ ...e, name: fullName(e) }))
        : [];
    res.json({
      ...p,
      file: undefined,
      hasFile: Boolean(p.file),
      myAck: mine && mine.version === p.version ? mine.acked_at : null,
      pending,
    });
  });

  r.get('/policies/:id/file', async (req, res) => {
    const p =
      (await db.get('SELECT * FROM policies WHERE id = ?', id(req.params.id))) ||
      notFound('Policy');
    if (!p.file) notFound('File');
    const file = path.join(uploads, 'policies', path.basename(p.file));
    if (!fs.existsSync(file)) notFound('File');
    res.download(file, p.file_name || `${p.title}.pdf`);
  });

  const policyUpload = upload('policies', { maxMb: 15, exts: ['.pdf', '.doc', '.docx'] }).single(
    'file',
  );
  r.post('/policies', authorizePolicyUpload, policyUpload, async (req, res) => {
    requireHR(req);
    const pid = await db.insert('policies', {
      title: str(req.body.title, { required: true, max: 120, name: 'Title' }),
      category: oneOf(req.body.category || 'General', CATEGORIES, { name: 'Category' }),
      version: str(req.body.version, { max: 10 }) || '1.0',
      summary: str(req.body.summary, { max: 300 }),
      content: str(req.body.content, { max: 50000 }),
      requires_ack: req.body.requires_ack === 'false' || req.body.requires_ack === false ? 0 : 1,
      file: req.file?.filename || null,
      file_name: req.file?.originalname?.slice(0, 120) || null,
    });
    await notifyUsers(
      db,
      (await db.all('SELECT id FROM users WHERE active = 1')).map((u) => u.id),
      `New policy published: ${req.body.title}`,
      `/leave?tab=policies&policy=${pid}`,
    );
    await audit(db, req.user, 'policy.create', 'policy', pid);
    res.json({ id: pid });
  });

  r.put('/policies/:id', authorizePolicyUpload, policyUpload, async (req, res) => {
    requireHR(req);
    const p =
      (await db.get('SELECT * FROM policies WHERE id = ?', id(req.params.id))) ||
      notFound('Policy');
    const major = req.body.new_version === 'true' || req.body.new_version === true;
    const version = major ? bumpVersion(p.version) : p.version;
    const data = {
      title: str(req.body.title, { required: true, max: 120, name: 'Title' }),
      category: oneOf(req.body.category || p.category, CATEGORIES, { name: 'Category' }),
      summary: str(req.body.summary, { max: 300 }),
      content: str(req.body.content, { max: 50000 }),
      requires_ack: req.body.requires_ack === 'false' || req.body.requires_ack === false ? 0 : 1,
      version,
      updated_at: new Date().toISOString(),
    };
    if (req.file) {
      data.file = req.file.filename;
      data.file_name = req.file.originalname.slice(0, 120);
      if (p.file)
        fs.rm(path.join(uploads, 'policies', path.basename(p.file)), { force: true }, () => {});
    }
    await db.update('policies', p.id, data);
    if (major && data.requires_ack)
      await notifyUsers(
        db,
        (await db.all('SELECT id FROM users WHERE active = 1')).map((u) => u.id),
        `${data.title} updated to v${version}. Please acknowledge it.`,
        `/leave?tab=policies&policy=${p.id}`,
      );
    await audit(db, req.user, 'policy.update', 'policy', p.id, { version });
    res.json({ ok: true, version });
  });

  r.delete('/policies/:id', async (req, res) => {
    requireHR(req);
    const p =
      (await db.get('SELECT * FROM policies WHERE id = ?', id(req.params.id))) ||
      notFound('Policy');
    await db.run('DELETE FROM policies WHERE id = ?', p.id);
    if (p.file)
      fs.rm(path.join(uploads, 'policies', path.basename(p.file)), { force: true }, () => {});
    res.json({ ok: true });
  });

  r.post('/policies/:id/ack', async (req, res) => {
    if (!req.user.employeeId) fail(400, 'Your login is not linked to an employee record');
    const p =
      (await db.get('SELECT * FROM policies WHERE id = ?', id(req.params.id))) ||
      notFound('Policy');
    await db.run(
      `INSERT INTO policy_acks (policy_id, employee_id, version, acked_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(policy_id, employee_id) DO UPDATE SET version = excluded.version, acked_at = excluded.acked_at`,
      p.id,
      req.user.employeeId,
      p.version,
      new Date().toISOString(),
    );
    res.json({ ok: true });
  });

  r.post('/policies/:id/remind', async (req, res) => {
    requireHR(req);
    const p =
      (await db.get('SELECT * FROM policies WHERE id = ?', id(req.params.id))) ||
      notFound('Policy');
    const users = (
      await db.all(
        `SELECT u.id FROM users u JOIN employees e ON e.id = u.employee_id
      LEFT JOIN policy_acks a ON a.employee_id = e.id AND a.policy_id = ? AND a.version = ?
      WHERE u.active = 1 AND e.status != 'Exited' AND a.policy_id IS NULL`,
        p.id,
        p.version,
      )
    ).map((u) => u.id);
    await notifyUsers(
      db,
      users,
      `Reminder: please acknowledge ${p.title} v${p.version}`,
      `/leave?tab=policies&policy=${p.id}`,
    );
    res.json({ ok: true, sent: users.length });
  });

  // ---------- POSH ----------
  r.get('/posh', async (req, res) => {
    const T = await today(db);
    const vf = req.query.vertical ? 'AND e.vertical_id = ?' : '';
    const vp = req.query.vertical ? [Number(req.query.vertical)] : [];
    const current = await db.value(
      `SELECT COUNT(*) FROM employees e WHERE e.status != 'Exited' AND e.join_date <= ? ${vf}`,
      T,
      ...vp,
    );
    const trained = await db.value(
      `SELECT COUNT(*) FROM posh_training t JOIN employees e ON e.id = t.employee_id WHERE e.status != 'Exited' AND e.join_date <= ? ${vf}`,
      T,
      ...vp,
    );
    const policy = await db.get(
      "SELECT id, version FROM policies WHERE category = 'POSH' ORDER BY updated_at DESC LIMIT 1",
    );
    const acked = policy
      ? await db.value(
          `SELECT COUNT(*) FROM policy_acks a JOIN employees e ON e.id = a.employee_id AND e.status != 'Exited' WHERE a.policy_id = ? AND a.version = ? AND e.join_date <= ? ${vf}`,
          policy.id,
          policy.version,
          T,
          ...vp,
        )
      : 0;
    const icc = (await getSettings(db)).icc || {};
    const member = async (eid, role) => {
      const e = await db.get(
        'SELECT id, first_name, last_name, designation, photo IS NOT NULL AS has_photo FROM employees WHERE id = ?',
        eid,
      );
      return e ? { ...e, name: fullName(e), role } : null;
    };
    const members = [
      await member(icc.presidingOfficerId, 'Presiding Officer'),
      ...(await asyncMap(icc.memberIds || [], async (m) => await member(m, 'Member'))),
    ].filter(Boolean);
    const canSeeCases = await isIcc(db, req.user);
    const complaints = canSeeCases
      ? await asyncMap(
          await db.all('SELECT * FROM posh_complaints ORDER BY created_at DESC'),
          async (c) => ({
            ...c,
            updates: json(c.updates, []),
            complainant: c.anonymous
              ? 'Anonymous'
              : fullName(
                  await db.get(
                    'SELECT first_name, last_name FROM employees WHERE id = ?',
                    c.complainant_id,
                  ),
                ),
          }),
        )
      : [];
    const mine = req.user.employeeId
      ? await db.all(
          'SELECT id, ref_no, status, created_at, due_date FROM posh_complaints WHERE complainant_id = ? ORDER BY created_at DESC',
          req.user.employeeId,
        )
      : [];
    const untrained = isHR(req.user)
      ? (
          await db.all(
            `SELECT e.id, e.first_name, e.last_name, e.code, d.name AS department FROM employees e LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN posh_training t ON t.employee_id = e.id WHERE e.status != 'Exited' AND e.join_date <= ? AND t.employee_id IS NULL ${vf} ORDER BY e.first_name`,
            T,
            ...vp,
          )
        ).map((e) => ({ ...e, name: fullName(e) }))
      : [];
    res.json({
      stats: {
        headcount: current,
        trained,
        trainedPct: current ? Math.round((trained / current) * 100) : 0,
        acked,
        ackPct: current ? Math.round((acked / current) * 100) : 0,
      },
      policyId: policy?.id || null,
      icc: { members, externalMember: icc.externalMember || '' },
      canSeeCases,
      canManageIcc: isAdmin(req.user),
      complaints,
      caseStats: canSeeCases
        ? {
            total: complaints.length,
            open: complaints.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length,
            resolved: complaints.filter((c) => ['Resolved', 'Closed'].includes(c.status)).length,
            thisYear: complaints.filter((c) => c.created_at.slice(0, 4) === T.slice(0, 4)).length,
          }
        : null,
      mine,
      myTraining: req.user.employeeId
        ? (await db.value(
            'SELECT completed_at FROM posh_training WHERE employee_id = ?',
            req.user.employeeId,
          )) || null
        : null,
      untrained,
    });
  });

  r.post('/posh/training', async (req, res) => {
    const target = req.body.employee_id ? id(req.body.employee_id) : req.user.employeeId;
    if (!target) fail(400, 'Your login is not linked to an employee record');
    if (target !== req.user.employeeId) requireHR(req);
    await db.run(
      'INSERT INTO posh_training (employee_id, completed_at) VALUES (?, ?) ON CONFLICT(employee_id) DO UPDATE SET completed_at = excluded.completed_at',
      target,
      new Date().toISOString(),
    );
    res.json({ ok: true });
  });

  r.post('/posh/complaints', async (req, res) => {
    const anonymous = Boolean(req.body.anonymous);
    const T = await today(db);
    const year = T.slice(0, 4);
    const n =
      (await db.value(
        'SELECT COUNT(*) FROM posh_complaints WHERE ref_no LIKE ?',
        `POSH-${year}-%`,
      )) + 1;
    const ref = `POSH-${year}-${String(n).padStart(3, '0')}`;
    await db.insert('posh_complaints', {
      ref_no: ref,
      complainant_id: anonymous ? null : req.user.employeeId,
      anonymous,
      respondent: str(req.body.respondent, { max: 120 }),
      incident_date: date(req.body.incident_date, { name: 'Incident date' }),
      place: str(req.body.place, { max: 120 }),
      description: str(req.body.description, { required: true, max: 5000, name: 'Description' }),
      status: 'Received',
      due_date: D.addDays(T, 90),
      updates: [{ at: new Date().toISOString(), text: 'Complaint received by ICC.' }],
    });
    await notifyUsers(
      db,
      await iccUserIds(db),
      `A new POSH complaint (${ref}) was received. Please review it confidentially.`,
      '/posh',
    );
    res.json({ ref });
  });

  r.put('/posh/complaints/:id', async (req, res) => {
    if (!(await isIcc(db, req.user))) fail(403, 'Only ICC members can update complaints');
    const c =
      (await db.get('SELECT * FROM posh_complaints WHERE id = ?', id(req.params.id))) ||
      notFound('Complaint');
    const status = oneOf(
      req.body.status || c.status,
      ['Received', 'Under Inquiry', 'Resolved', 'Closed'],
      { name: 'Status' },
    );
    const note = str(req.body.note, { max: 1000 });
    const updates = json(c.updates, []);
    if (note || status !== c.status)
      updates.push({ at: new Date().toISOString(), text: note || `Status changed to ${status}.` });
    await db.update('posh_complaints', c.id, { status, updates });
    if (c.complainant_id && status !== c.status)
      await notifyUsers(
        db,
        [await userIdForEmployee(db, c.complainant_id)],
        `Your POSH complaint ${c.ref_no} is now: ${status}`,
        '/posh',
      );
    res.json({ ok: true });
  });

  r.put('/posh/icc', async (req, res) => {
    requireAdmin(req);
    const presidingOfficerId = req.body.presidingOfficerId ? id(req.body.presidingOfficerId) : null;
    const memberIds = [
      ...new Set((Array.isArray(req.body.memberIds) ? req.body.memberIds : []).map(id)),
    ]
      .slice(0, 10)
      .filter((member) => member !== presidingOfficerId);
    for (const employee of [presidingOfficerId, ...memberIds].filter(Boolean)) {
      if (!(await db.value("SELECT id FROM employees WHERE id=? AND status!='Exited'", employee)))
        fail(400, 'Committee members must be current employees');
    }
    const before = (await getSettings(db)).icc;
    await setSetting(db, 'icc', {
      presidingOfficerId,
      memberIds,
      externalMember: str(req.body.externalMember, { max: 120 }) || '',
    });
    await audit(db, req.user, 'icc.update', 'settings', null, {
      before,
      after: { presidingOfficerId, memberIds, externalMember: req.body.externalMember || '' },
    });
    res.json({ ok: true });
  });

  r.post('/posh/remind-training', async (req, res) => {
    requireHR(req);
    const users = (
      await db.all(`SELECT u.id FROM users u JOIN employees e ON e.id = u.employee_id LEFT JOIN posh_training t ON t.employee_id = e.id
      WHERE u.active = 1 AND e.status != 'Exited' AND t.employee_id IS NULL`)
    ).map((u) => u.id);
    await notifyUsers(db, users, 'Reminder: please complete your POSH awareness training', '/posh');
    res.json({ ok: true, sent: users.length });
  });
}
