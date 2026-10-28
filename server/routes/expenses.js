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
  const view = (a) => ({
    ...a,
    expense_number: 'EXP-' + String(a.id).padStart(6, '0'),
    details: json(a.expense_details, null),
  });
  r.get('/expenses', async (req, res) => {
    const canReview = req.query.mine === '1' ? false : await reviewer(req.user);
    const items = await db.all(
      `SELECT a.*, e.first_name, e.last_name, e.code, e.designation, d.name AS department FROM payroll_adjustments a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE a.kind='Reimbursement' ${canReview ? '' : 'AND a.employee_id=?'} ORDER BY a.created_at DESC LIMIT 200`,
      ...(canReview ? [] : [req.user.employeeId]),
    );
    res.json({ canReview, items: items.map(view) });
  });
  r.get('/expenses/merchants', async (req, res) => {
    const rows = await db.all(
      "SELECT expense_details FROM payroll_adjustments WHERE kind='Reimbursement' AND employee_id=? AND expense_details IS NOT NULL ORDER BY created_at DESC",
      req.user.employeeId,
    );
    const names = new Map();
    for (const row of rows) {
      const name = json(row.expense_details, {})?.merchant?.trim();
      if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    res.json({ items: [...names.values()].sort((a, b) => a.localeCompare(b)) });
  });
  r.post(
    '/expenses',
    upload('expense-proofs', {
      maxMb: 10,
      exts: ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.xlsx'],
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
            reference: str(e.reference, { max: 120 }),
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
        '/expenses',
      );
      res.json({ ids });
    },
  );
  const authorizedExpense = async (req) => {
    const a = await db.get(
      "SELECT a.*, e.first_name, e.last_name, e.code, e.designation, d.name AS department FROM payroll_adjustments a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE a.id=? AND a.kind='Reimbursement'",
      id(req.params.id),
    );
    if (!a) fail(404, 'Expense not found');
    if (a.employee_id !== req.user.employeeId && !(await reviewer(req.user)))
      fail(403, 'Access denied');
    return a;
  };
  r.get('/expenses/:id', async (req, res) => {
    const a = await authorizedExpense(req);
    const canReview = await reviewer(req.user);
    res.json({ ...view(a), canReview, canAct: canReview && a.employee_id !== req.user.employeeId });
  });
  r.post('/expenses/:id/reimburse', async (req, res) => {
    if (!(await reviewer(req.user))) fail(403, 'Only Accounts or admin can record reimbursements');
    const T = await today(db);
    if (!isValidYmd(req.body.reimbursed_on) || req.body.reimbursed_on > T)
      fail(400, 'Enter a valid reimbursement date on or before today');
    const paidThrough = str(req.body.paid_through, { required: true, max: 80 });
    if (!['Bank transfer', 'Cash', 'UPI', 'Cheque'].includes(paidThrough))
      fail(400, 'Choose a payment method');
    await db.tx(async () => {
      const a = await db.get(
        "SELECT * FROM payroll_adjustments WHERE id=? AND kind='Reimbursement' FOR UPDATE",
        id(req.params.id),
      );
      if (!a) fail(404, 'Expense not found');
      if (a.employee_id === req.user.employeeId) fail(403, 'You cannot reimburse your own expense');
      if (a.status !== 'Approved') fail(409, 'Only an approved, unpaid expense can be reimbursed');
      const run = await db.get('SELECT status FROM payroll_runs WHERE month=? FOR UPDATE', a.month);
      if (run && !['In Review', 'Finance Reviewed'].includes(run.status))
        fail(
          409,
          'This claim is included in locked payroll. Reopen payroll before recording a separate reimbursement.',
        );
      const details = json(a.expense_details, {}) || {};
      details.reimbursement = {
        amount: a.amount,
        reimbursed_on: req.body.reimbursed_on,
        paid_through: paidThrough,
        notes: str(req.body.notes, { max: 1000 }),
        reference: str(req.body.reference, { max: 120 }),
        recorded_by: req.user.name,
        recorded_by_id: req.user.id,
        recorded_at: new Date().toISOString(),
      };
      await db.update('payroll_adjustments', a.id, {
        status: 'Reimbursed',
        expense_details: JSON.stringify(details),
      });
      // Reimbursed claims are excluded from salary adjustments, preventing a second payment.
      if (run) {
        const { processRun } = await import('../services/payroll.js');
        await processRun(db, req.user, a.month);
      }
      const owner = await db.get('SELECT id FROM users WHERE employee_id=?', a.employee_id);
      if (owner)
        await notifyUsers(
          db,
          [owner.id],
          'Expense EXP-' + String(a.id).padStart(6, '0') + ' reimbursed by ' + req.user.name,
          '/expenses/' + a.id,
        );
    });
    res.json({ ok: true });
  });
  const attachment = async (req, res, preview) => {
    const a = await authorizedExpense(req);
    const index = Number(req.params.index);
    const file =
      req.params.index === 'legacy' && a.proof_file
        ? { file: a.proof_file, name: a.proof_name || a.proof_file }
        : Number.isInteger(index) && json(a.expense_details, {})?.attachments?.[index];
    if (!file) fail(404, 'Attachment not found');
    const filePath = path.join(uploads, 'expense-proofs', path.basename(file.file));
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    if (!preview) return res.download(filePath, file.name);
    const ext = path.extname(file.name).toLowerCase();
    if (['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      res.type(ext);
      res.set('Content-Disposition', "inline; filename*=UTF-8''" + encodeURIComponent(file.name));
      return res.sendFile(filePath);
    }
    try {
      const { expenseDocumentPreview } = await import('../services/expense-preview.js');
      return res.json(await expenseDocumentPreview(filePath, file.name));
    } catch {
      fail(
        422,
        'This document could not be previewed. It may be damaged, encrypted or exceed preview limits.',
      );
    }
  };
  r.get('/expenses/:id/attachments/:index', (req, res) => attachment(req, res, false));
  r.get('/expenses/:id/attachments/:index/preview', (req, res) => attachment(req, res, true));
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
    await db.update('payroll_adjustments', a.id, {
      status: req.body.status,
      expense_details: JSON.stringify({
        ...(json(a.expense_details, {}) || {}),
        review: {
          by: req.user.name,
          user_id: req.user.id,
          at: new Date().toISOString(),
          status: req.body.status,
        },
      }),
    });
    if (run) await processRun(db, req.user, a.month);
    const owner = await db.get('SELECT id FROM users WHERE employee_id=?', a.employee_id);
    await notifyUsers(
      db,
      [...new Set([owner?.id, ...(await admins()).map((u) => u.id)].filter(Boolean))],
      `Expense claim: ${a.note || a.id} — ${req.body.status.toLowerCase()} by ${req.user.name}`,
      '/expenses/' + a.id,
    );
    res.json({ ok: true });
  });
}
