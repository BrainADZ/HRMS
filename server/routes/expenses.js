import path from 'node:path';
import { fail, id, num, str, notifyUsers, today, isAdmin } from '../core.js';
import { json } from '../db.js';
import { isValidYmd } from '../lib/dates.js';

export default function expenseRoutes(r, { db, upload, uploads }) {
  const accounts = async () =>
    db.all(
      `SELECT u.id FROM users u JOIN employees e ON e.id=u.employee_id JOIN departments d ON d.id=e.department_id WHERE u.active=1 AND LOWER(d.name) IN ('accounts','finance','accounts & finance','finance & accounts','accounting')`,
    );
  const admins = async () => db.all("SELECT id FROM users WHERE role='admin' AND active=1");
  const reviewer = async (user) =>
    isAdmin(user) || (await accounts()).some((u) => u.id === user.id);
  const view = (a) => ({ ...a, details: json(a.expense_details, null) });
  r.get('/expenses', async (req, res) => {
    const canReview = await reviewer(req.user);
    const items = await db.all(
      `SELECT a.*, e.first_name, e.last_name, e.code, e.designation, d.name AS department FROM payroll_adjustments a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE a.kind='Reimbursement' ${canReview ? '' : 'AND a.employee_id=?'} ORDER BY a.created_at DESC LIMIT 200`,
      ...(canReview ? [] : [req.user.employeeId]),
    );
    res.json({ canReview, items: items.map(view) });
  });
  r.post(
    '/expenses',
    upload('expense-proofs', {
      maxMb: 10,
      exts: ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx'],
    }).array('proofs', 30),
    async (req, res) => {
      if (!req.user.employeeId) fail(400, 'An employee profile is required to submit expenses');
      let entries;
      try {
        entries = JSON.parse(req.body.entries);
      } catch {
        fail(400, 'Invalid expense entries');
      }
      if (!Array.isArray(entries) || !entries.length || entries.length > 20)
        fail(400, 'Submit between 1 and 20 expenses');
      const files = req.files || [];
      const assigned = new Set();
      const T = await today(db);
      const month = T.slice(0, 7);
      const run = await db.get('SELECT status FROM payroll_runs WHERE month=?', month);
      if (run && !['In Review', 'Finance Reviewed'].includes(run.status))
        fail(409, 'This payroll month is locked. Please submit in the next payroll month.');
      const validated = entries.map((e) => {
        if (
          !isValidYmd(e.start_date) ||
          !isValidYmd(e.end_date) ||
          e.end_date < e.start_date ||
          e.end_date > T
        )
          fail(400, 'Enter a valid expense date range, ending on or before today');
        const purpose = str(e.purpose, { required: true, max: 200 });
        const amount = num(e.amount, {
          required: true,
          min: 1,
          max: 10000000,
          int: true,
          name: 'Amount',
        });
        if (!Array.isArray(e.files) || e.files.length > 10)
          fail(400, 'Up to 10 attachments per expense');
        const attachments = e.files.map((i) => {
          if (!Number.isInteger(i) || !files[i] || assigned.has(i))
            fail(400, 'Invalid attachment reference');
          assigned.add(i);
          return { file: files[i].filename, name: files[i].originalname };
        });
        return {
          amount,
          purpose,
          details: {
            start_date: e.start_date,
            end_date: e.end_date,
            purpose,
            category: str(e.category, { required: true, max: 80 }),
            merchant: str(e.merchant, { max: 120 }),
            description: str(e.description, { max: 1000 }),
            attachments,
          },
        };
      });
      if (assigned.size !== files.length) fail(400, 'Every attachment must belong to an expense');
      const ids = [];
      for (const e of validated)
        ids.push(
          await db.insert('payroll_adjustments', {
            employee_id: req.user.employeeId,
            month,
            kind: 'Reimbursement',
            amount: e.amount,
            note: e.purpose,
            status: 'Pending',
            expense_details: JSON.stringify(e.details),
          }),
        );
      await notifyUsers(
        db,
        [...new Set([...(await accounts()), ...(await admins())].map((u) => u.id))],
        `${req.user.name} submitted ${ids.length} expense claim(s) for Accounts review`,
        '/my?tab=payslips',
      );
      res.json({ ids });
    },
  );
  r.get('/expenses/:id/attachments/:index', async (req, res) => {
    const a = await db.get('SELECT * FROM payroll_adjustments WHERE id=?', id(req.params.id));
    if (!a) fail(404, 'Expense not found');
    if (a.employee_id !== req.user.employeeId && !(await reviewer(req.user)))
      fail(403, 'Access denied');
    const index = Number(req.params.index);
    const file = Number.isInteger(index) && json(a.expense_details, {}).attachments?.[index];
    if (!file) fail(404, 'Attachment not found');
    res.set('X-Content-Type-Options', 'nosniff');
    res.download(path.join(uploads, 'expense-proofs', path.basename(file.file)), file.name);
  });
  r.put('/expenses/:id', async (req, res) => {
    if (!(await reviewer(req.user))) fail(403, 'Only Accounts or admin can review expenses');
    if (!['Approved', 'Rejected'].includes(req.body.status))
      fail(400, 'Choose Approved or Rejected');
    const a = await db.get(
      'SELECT * FROM payroll_adjustments WHERE id=? FOR UPDATE',
      id(req.params.id),
    );
    if (!a || a.kind !== 'Reimbursement') fail(404, 'Expense not found');
    if (a.employee_id === req.user.employeeId) fail(403, 'You cannot review your own expense');
    if (a.status !== 'Pending') fail(409, 'This expense has already been reviewed');
    const run = await db.get('SELECT status FROM payroll_runs WHERE month=? FOR UPDATE', a.month);
    if (run && !['In Review', 'Finance Reviewed'].includes(run.status))
      fail(409, 'Payroll is locked');
    // Reuse the payroll adjustment review so draft payslips are recalculated.
    const { processRun } = await import('../services/payroll.js');
    await db.update('payroll_adjustments', a.id, { status: req.body.status });
    if (run) await processRun(db, req.user, a.month);
    const owner = await db.get('SELECT id FROM users WHERE employee_id=?', a.employee_id);
    await notifyUsers(
      db,
      [...new Set([owner?.id, ...(await admins()).map((u) => u.id)].filter(Boolean))],
      `Expense claim: ${a.note || a.id} — ${req.body.status.toLowerCase()} by ${req.user.name}`,
      '/my?tab=payslips',
    );
    res.json({ ok: true });
  });
}
