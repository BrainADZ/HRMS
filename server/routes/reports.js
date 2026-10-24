import { asyncMap } from '../database/async.js';
import { today, requireHR, fullName, sendCsv, date, num } from '../core.js';
import { employeeFilter } from '../services/report-filters.js';
import { json } from '../db.js';
import * as D from '../lib/dates.js';
import { calendarCtx } from '../services/calendar.js';
import { balances } from '../services/leave.js';
import { headcountOn } from './dashboard.js';
import { countLeaveDays } from '../lib/leave.js';

export default function reportRoutes(r, { db }) {
  r.get('/reports/summary', async (req, res) => {
    requireHR(req);
    const T = req.query.as_of ? date(req.query.as_of, { required: true }) : await today(db);
    const month = D.monthOf(T);
    const all = employeeFilter(req.query);
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const m = D.addMonths(month, -i);
      const end = m === month ? T : D.monthEnd(m);
      const hc = await headcountOn(db, end, all);
      const exits = await db.value(
        `SELECT COUNT(*) FROM employees e WHERE exit_date BETWEEN ? AND ? AND ${all.sql}`,
        D.monthStart(m),
        end,
        ...all.params,
      );
      const joins = await db.value(
        `SELECT COUNT(*) FROM employees e WHERE join_date BETWEEN ? AND ? AND ${all.sql}`,
        D.monthStart(m),
        end,
        ...all.params,
      );
      const avg = ((await headcountOn(db, D.monthStart(m), all)) + hc) / 2;
      const run = await db.get('SELECT id FROM payroll_runs WHERE month = ?', m);
      const cost = run
        ? await db.value(
            `SELECT COALESCE(SUM(p.employer_cost),0) FROM payslips p JOIN employees e ON e.id=p.employee_id WHERE p.run_id = ? AND ${all.sql}`,
            run.id,
            ...all.params,
          )
        : null;
      months.push({
        month: m,
        label: D.shortMonth(m),
        headcount: hc,
        joins,
        exits,
        attrition: avg ? Math.round((exits / avg) * 1000) / 10 : 0,
        payrollCost: cost,
      });
    }
    const year = D.yearOf(T);
    const leaveUse = (
      await db.all('SELECT id, code, name, color FROM leave_types ORDER BY sort')
    ).map((type) => ({ ...type, days: 0, requests: 0 }));
    const calendar = await calendarCtx(db);
    const approved = await db.all(
      `SELECT r.*, t.calendar_days FROM leave_requests r JOIN leave_types t ON t.id=r.leave_type_id JOIN employees e ON e.id=r.employee_id WHERE r.status='Approved' AND r.from_date<=? AND r.to_date>=? AND ${all.sql}`,
      T,
      `${year}-01-01`,
      ...all.params,
    );
    for (const request of approved) {
      const type = leaveUse.find((item) => item.id === request.leave_type_id);
      type.days += countLeaveDays(
        {
          from: request.from_date < `${year}-01-01` ? `${year}-01-01` : request.from_date,
          to: request.to_date > T ? T : request.to_date,
          halfDay: Boolean(request.half_day),
          calendarDays: Boolean(request.calendar_days),
        },
        calendar,
      );
      type.requests++;
    }
    const byVertical = await db.all(
      `SELECT v.name AS label, v.color, COUNT(e.id) AS value, COALESCE(SUM(e.ctc),0) AS ctc FROM verticals v
      LEFT JOIN employees e ON e.vertical_id = v.id AND e.join_date <= ? AND (e.exit_date IS NULL OR e.exit_date >= ?) AND ${all.sql} GROUP BY v.id ORDER BY v.id`,
      T,
      T,
      ...all.params,
    );
    const ttm = months.reduce((t, m) => t + m.exits, 0);
    const avgHc = months.reduce((t, m) => t + m.headcount, 0) / months.length;
    res.json({
      months,
      leaveUse,
      byVertical,
      annualAttrition: avgHc ? Math.round((ttm / avgHc) * 1000) / 10 : 0,
      totalCtc: byVertical.reduce((t, v) => t + v.ctc, 0),
      headcount: months[months.length - 1].headcount,
    });
  });

  r.get('/reports/leave-register.csv', async (req, res) => {
    requireHR(req);
    const T = await today(db);
    const year = req.query.year
      ? num(req.query.year, { min: 1900, max: 2200, int: true, required: true, name: 'Year' })
      : D.yearOf(T);
    const filter = employeeFilter(req.query);
    const ctx = await calendarCtx(db);
    const types = await db.all('SELECT * FROM leave_types WHERE active = 1 ORDER BY sort');
    const rows = await asyncMap(
      await db.all(
        `SELECT e.*, d.name AS department FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.join_date <= ? AND (e.exit_date IS NULL OR e.exit_date >= ?) AND ${filter.sql} ORDER BY e.code`,
        `${year}-12-31`,
        `${year}-01-01`,
        ...filter.params,
      ),
      async (e) => ({
        e,
        b: new Map(
          (await balances(db, e, year, year === D.yearOf(T) ? T : `${year}-12-31`, ctx)).map(
            (x) => [x.code, x],
          ),
        ),
      }),
    );
    sendCsv(res, `leave-register-${year}.csv`, rows, [
      { label: 'Employee ID', value: (x) => x.e.code },
      { label: 'Name', value: (x) => fullName(x.e) },
      { label: 'Department', value: (x) => x.e.department },
      ...types.flatMap((t) => [
        {
          label: `${t.code} Entitled`,
          value: (x) => (x.b.get(t.code) ? (x.b.get(t.code).entitled ?? 'Unlimited') : 'N/A'),
        },
        { label: `${t.code} Used`, value: (x) => x.b.get(t.code)?.used ?? '' },
        { label: `${t.code} Available`, value: (x) => x.b.get(t.code)?.available ?? '' },
      ]),
    ]);
  });

  r.get('/reports/leave-requests.csv', async (req, res) => {
    requireHR(req);
    const filter = employeeFilter(req.query);
    const until = req.query.as_of ? date(req.query.as_of, { required: true }) : '9999-12-31';
    const rows = await db.all(
      `SELECT r.*, t.name AS type, e.first_name, e.last_name, e.code FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
      JOIN employees e ON e.id = r.employee_id WHERE ${filter.sql} AND r.from_date<=? ORDER BY r.from_date DESC`,
      ...filter.params,
      until,
    );
    sendCsv(res, 'leave-requests.csv', rows, [
      { label: 'Employee ID', value: 'code' },
      { label: 'Name', value: (x) => fullName(x) },
      { label: 'Type', value: 'type' },
      { label: 'From', value: 'from_date' },
      { label: 'To', value: 'to_date' },
      { label: 'Days', value: 'days' },
      { label: 'Status', value: 'status' },
      { label: 'Reason', value: 'reason' },
      { label: 'Applied On', value: (x) => x.created_at.slice(0, 10) },
    ]);
  });

  r.get('/reports/hiring.csv', async (req, res) => {
    requireHR(req);
    const filter = employeeFilter(
      { vertical: req.query.vertical, department: req.query.department },
      'j',
    );
    const until = req.query.as_of ? date(req.query.as_of, { required: true }) : '9999-12-31';
    const rows = await db.all(
      `SELECT c.*, j.title FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id WHERE ${filter.sql} AND c.applied_on<=? ORDER BY c.applied_on DESC`,
      ...filter.params,
      until,
    );
    sendCsv(res, 'candidates.csv', rows, [
      { label: 'Name', value: 'name' },
      { label: 'Email', value: 'email' },
      { label: 'Phone', value: 'phone' },
      { label: 'Job', value: 'title' },
      { label: 'Stage', value: 'stage' },
      { label: 'Source', value: 'source' },
      { label: 'Match %', value: 'ai_score' },
      { label: 'Experience (yrs)', value: 'experience' },
      { label: 'Expected CTC (LPA)', value: 'expected_ctc' },
      { label: 'Location', value: 'location' },
      { label: 'Applied On', value: 'applied_on' },
      { label: 'Offer Status', value: 'offer_status' },
    ]);
  });

  r.get('/reports/attrition.csv', async (req, res) => {
    requireHR(req);
    const filter = employeeFilter(req.query);
    const until = req.query.as_of ? date(req.query.as_of, { required: true }) : '9999-12-31';
    const rows = await db.all(
      `SELECT r.*, e.first_name, e.last_name, e.code, e.join_date, d.name AS department FROM resignations r JOIN employees e ON e.id = r.employee_id
      LEFT JOIN departments d ON d.id = e.department_id WHERE ${filter.sql} AND r.submitted_on<=? ORDER BY r.submitted_on DESC`,
      ...filter.params,
      until,
    );
    sendCsv(res, 'resignations.csv', rows, [
      { label: 'Employee ID', value: 'code' },
      { label: 'Name', value: (x) => fullName(x) },
      { label: 'Department', value: 'department' },
      { label: 'Joined', value: 'join_date' },
      { label: 'Submitted', value: 'submitted_on' },
      { label: 'Last Working Day', value: 'last_working_day' },
      { label: 'Reason', value: 'reason_category' },
      { label: 'Status', value: 'status' },
      {
        label: 'Rehire Eligible',
        value: (x) => (x.rehire_eligible == null ? '' : x.rehire_eligible ? 'Yes' : 'No'),
      },
      { label: 'F&F Amount', value: (x) => json(x.settlement, {})?.amount ?? '' },
    ]);
  });

  r.get('/reports/performance.csv', async (req, res) => {
    requireHR(req);
    const filter = employeeFilter(req.query);
    const until = req.query.as_of ? date(req.query.as_of, { required: true }) : '9999-12-31';
    const rows = await db.all(
      `SELECT rv.*, c.name AS cycle, e.first_name, e.last_name, e.code, d.name AS department FROM reviews rv JOIN review_cycles c ON c.id = rv.cycle_id
      JOIN employees e ON e.id = rv.employee_id LEFT JOIN departments d ON d.id = e.department_id WHERE ${filter.sql} AND c.start_date<=? ORDER BY c.start_date DESC, e.code`,
      ...filter.params,
      until,
    );
    sendCsv(res, 'performance.csv', rows, [
      { label: 'Cycle', value: 'cycle' },
      { label: 'Employee ID', value: 'code' },
      { label: 'Name', value: (x) => fullName(x) },
      { label: 'Department', value: 'department' },
      { label: 'Status', value: 'status' },
      { label: 'Self Rating', value: 'self_rating' },
      { label: 'Manager Rating', value: 'manager_rating' },
      { label: 'Final Rating', value: 'final_rating' },
    ]);
  });

  r.get('/reports/headcount.csv', async (req, res) => {
    requireHR(req);
    const T = req.query.as_of ? date(req.query.as_of, { required: true }) : await today(db);
    const filter = employeeFilter(req.query);
    const rows = await db.all(
      `SELECT v.name AS vertical, d.name AS department, l.name AS location, COUNT(*) AS n, SUM(CASE WHEN e.gender = 'F' THEN 1 ELSE 0 END) AS women, SUM(CASE WHEN e.gender = 'M' THEN 1 ELSE 0 END) AS men, ROUND(AVG(e.ctc)) AS avg_ctc
      FROM employees e LEFT JOIN verticals v ON v.id = e.vertical_id LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN locations l ON l.id = e.location_id
      WHERE e.join_date <= ? AND (e.exit_date IS NULL OR e.exit_date >= ?) AND ${filter.sql} GROUP BY v.name, d.name, l.name ORDER BY v.name, d.name`,
      T,
      T,
      ...filter.params,
    );
    sendCsv(res, 'headcount.csv', rows, [
      { label: 'Vertical', value: 'vertical' },
      { label: 'Department', value: 'department' },
      { label: 'Location', value: 'location' },
      { label: 'Headcount', value: 'n' },
      { label: 'Women', value: 'women' },
      { label: 'Men', value: 'men' },
      { label: 'Average CTC', value: 'avg_ctc' },
    ]);
  });
}
