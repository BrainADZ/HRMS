// Shared master records and policies for clean and demo company setup.
import { asyncForEach } from './database/async.js';
import { hashPassword } from './auth.js';
import { setSetting } from './core.js';
import * as D from './lib/dates.js';

export const DEMO_PASSWORD = 'Brainadz@2026';
export const DEMO_ACCOUNTS = [
  { email: 'rajiv.malhotra@brainadz.com', role: 'admin', label: 'CEO · Admin' },
  { email: 'priya.sharma@brainadz.com', role: 'hr', label: 'HR Manager' },
  { email: 'vikram.patel@brainadz.com', role: 'manager', label: 'Sales Manager' },
  { email: 'aarav.mehta@brainadz.com', role: 'employee', label: 'Employee' },
];

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTICALS = [
  { name: 'BrainADZ Live', short: 'Live', tagline: 'From Vision to Visibility', color: '#E5243B' },
  {
    name: 'BrainADZ Marketing',
    short: 'Marketing',
    tagline: 'Ideas That Spark Momentum',
    color: '#1FB2D6',
  },
  {
    name: 'BrainADZ Exhibits',
    short: 'Exhibits',
    tagline: 'Where Elegance Meets Execution',
    color: '#8CC63F',
  },
  { name: 'Corporate', short: 'Corporate', tagline: 'Shared services', color: '#7C5CFC' },
];

const DEPARTMENTS = [
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
];
const LOCATIONS = ['Bengaluru', 'Mumbai', 'Delhi NCR'];

export const LEAVE_TYPES = [
  {
    code: 'EL',
    name: 'Earned Leave',
    annual_quota: 20,
    accrual: 'monthly',
    carry_forward_max: 5,
    color: '#2F6FED',
    icon: 'calendar',
    rule: 'Accrued monthly · Carry forward up to 5 days',
  },
  {
    code: 'CL',
    name: 'Casual Leave',
    annual_quota: 12,
    color: '#22B05B',
    icon: 'palm',
    rule: '12 days/year · No carry forward',
  },
  {
    code: 'SL',
    name: 'Sick Leave',
    annual_quota: 10,
    color: '#F0457A',
    icon: 'cross',
    rule: 'Medical certificate after 3 days',
  },
  {
    code: 'ML',
    name: 'Maternity Leave',
    annual_quota: 182,
    calendar_days: 1,
    gender: 'F',
    color: '#8B5CF6',
    icon: 'baby',
    rule: '26 weeks as per the Maternity Benefit Act',
  },
  {
    code: 'PL',
    name: 'Paternity Leave',
    annual_quota: 15,
    gender: 'M',
    color: '#1BA7E0',
    icon: 'user',
    rule: 'To be availed within 6 months of birth',
  },
  {
    code: 'WFH',
    name: 'Work From Home',
    annual_quota: 30,
    kind: 'wfh',
    color: '#F5B400',
    icon: 'home',
    rule: 'Manager approval required',
  },
  {
    code: 'LOP',
    name: 'Loss of Pay',
    annual_quota: null,
    paid: 0,
    color: '#6B7A90',
    icon: 'ban',
    rule: 'Unpaid · deducted in payroll',
  },
];

export function holidaysFor(year) {
  const list = [
    [`${year}-01-14`, 'Makar Sankranti / Pongal', 'Restricted'],
    [`${year}-01-26`, 'Republic Day', 'Company'],
    [`${year}-05-01`, 'Labour Day', 'Company'],
    [`${year}-08-15`, 'Independence Day', 'Company'],
    [`${year}-10-02`, 'Gandhi Jayanti', 'Company'],
    [`${year}-12-25`, 'Christmas', 'Company'],
  ];

  // Festival dates move every year; only 2026 is pre-filled. Add the rest in Leave & Policies.
  if (year === 2026) {
    list.push(
      ['2026-03-04', 'Holi', 'Company'],
      ['2026-03-20', 'Eid ul-Fitr', 'Restricted'],
      ['2026-04-03', 'Good Friday', 'Restricted'],
      ['2026-09-14', 'Ganesh Chaturthi', 'Company'],
      ['2026-10-20', 'Dussehra', 'Company'],
      ['2026-11-08', 'Diwali', 'Company'],
      ['2026-11-09', 'Govardhan Puja', 'Restricted'],
    );
  }
  return list;
}

export function policyLibrary(T) {
  const d = (n) => new Date(`${D.addDays(T, -n)}T10:00:00+05:30`).toISOString();
  return [
    {
      title: 'Leave Policy',
      category: 'Leave',
      version: '3.2',
      requires_ack: 1,
      updated_at: d(4),
      created_at: d(900),
      summary: 'Leave entitlements, accrual, carry forward, approvals and holidays.',
      content: `## 1. Purpose\nThis policy sets out the leave every BrainADZ employee is entitled to and how to apply for it.\n\n## 2. Entitlements (per calendar year)\n- Earned Leave (EL): 20 days, accrued monthly. Up to 5 unused days carry forward to the next year.\n- Casual Leave (CL): 12 days, credited in January (pro-rated for joiners). No carry forward.\n- Sick Leave (SL): 10 days. A medical certificate is required for absences longer than 3 days.\n- Maternity Leave: 26 weeks as per the Maternity Benefit Act, 1961.\n- Paternity Leave: 15 days, to be availed within 6 months of birth or adoption.\n- Work From Home: up to 30 days a year with manager approval.\n- Loss of Pay: any absence beyond available balance is unpaid and deducted in payroll.\n\n## 3. Applying for leave\nApply in BrainADZ HRMS before the leave starts (sick leave may be applied on the day). Your reporting manager approves; HR can approve when the manager is unavailable.\n\n## 4. Weekly offs and holidays\nSaturdays and Sundays are weekly offs. Company holidays are published in the holiday calendar each January. Restricted holidays may be taken as Casual Leave.\n\n## 5. Attendance\nMark attendance daily in HRMS. Unapproved absence is treated as Loss of Pay.`,
    },
    {
      title: 'Employee Handbook',
      category: 'General',
      version: '2.1',
      requires_ack: 1,
      updated_at: d(210),
      created_at: d(1200),
      summary: 'How we work at BrainADZ: values, working hours, benefits and conduct.',
      content: `## Welcome to BrainADZ\nBrainADZ brings brands to life through Live events, Marketing and Exhibits.\n\n## Working hours\nCore hours are 9:30 am to 6:30 pm, Monday to Friday. Event and exhibition teams follow project schedules and receive compensatory off for weekend work.\n\n## Probation\nNew employees serve a 6-month probation with a review at the end of month 3 and month 6.\n\n## Benefits\n- Group health insurance for employee, spouse and two children\n- Provident Fund and gratuity as per law\n- Annual health check-up\n- Learning budget of Rs 15,000 per year\n\n## Notice period\n30 days for executives and 60 days for managers and above.`,
    },
    {
      title: 'Code of Conduct',
      category: 'Compliance',
      version: '1.8',
      requires_ack: 1,
      updated_at: d(240),
      created_at: d(1300),
      summary: 'Ethics, conflicts of interest, gifts, confidentiality and client conduct.',
      content: `## Our standards\nAct with integrity with clients, vendors and colleagues.\n\n## Conflicts of interest\nDeclare any personal interest in a vendor or client to your manager and HR.\n\n## Gifts\nGifts above Rs 2,000 from vendors must be declared and may not be accepted during an active tender.\n\n## Confidentiality\nClient briefs, budgets and designs are confidential and may not be shared outside BrainADZ.\n\n## Reporting concerns\nRaise concerns with your manager, HR, or the ethics mailbox. Retaliation against anyone raising a concern in good faith is prohibited.`,
    },
    {
      title: 'POSH Policy',
      category: 'POSH',
      version: '2.5',
      requires_ack: 1,
      updated_at: d(190),
      created_at: d(1300),
      summary:
        'Prevention of Sexual Harassment at the Workplace, the ICC and how to raise a complaint.',
      content: `## 1. Commitment\nBrainADZ provides a safe workplace free from sexual harassment, in line with the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013. This policy covers offices, client sites, events, travel and online communication.\n\n## 2. Internal Committee (ICC)\nThe ICC is chaired by a senior woman employee and includes at least two employee members and one external member from an NGO or with legal expertise. At least half the members are women.\n\n## 3. Raising a complaint\nA complaint may be made in writing to the ICC within 3 months of the incident (extendable by 3 months). Use HRMS → POSH → Raise a concern, or email the ICC. Complaints are confidential.\n\n## 4. Inquiry\nThe ICC completes its inquiry within 90 days and submits its report within 10 days of completion. Both parties are heard. Interim relief such as a change of reporting line or leave may be granted.\n\n## 5. Confidentiality and non-retaliation\nThe identity of the parties, witnesses and the proceedings are confidential. Retaliation is misconduct.\n\n## 6. Training\nEvery employee completes POSH awareness training on joining and once a year.`,
    },
    {
      title: 'IT & Information Security Policy',
      category: 'IT',
      version: '1.3',
      requires_ack: 1,
      updated_at: d(130),
      created_at: d(800),
      summary: 'Acceptable use of laptops, accounts, passwords and client data.',
      content: `## Devices\nCompany laptops must have disk encryption and automatic updates enabled. Report a lost device to IT within 2 hours.\n\n## Accounts and passwords\nUse a password manager and multi-factor authentication. Never share passwords.\n\n## Client data\nStore client files only in approved company drives. Do not use personal email or USB drives for client data.\n\n## Exit\nReturn all devices and access cards on your last working day.`,
    },
    {
      title: 'Travel & Expense Policy',
      category: 'Finance',
      version: '1.0',
      requires_ack: 0,
      updated_at: d(320),
      created_at: d(320),
      summary: 'Booking travel, daily allowances and filing reimbursement claims.',
      content: `## Booking\nBook travel through the Admin travel desk at least 7 days ahead where possible.\n\n## Allowances\n- Metro cities: Rs 1,500 per day\n- Other cities: Rs 1,000 per day\n\n## Claims\nSubmit reimbursement claims with bills within 30 days. Approved claims are paid with the next payroll.`,
    },
  ];
}

export async function hasData(db) {
  return Boolean(await db.value('SELECT COUNT(*) FROM employees'));
}

// First run without demo data: a company record and one administrator.
export async function seedEmpty(db, { adminEmail, adminPassword }) {
  await db.tx(async () => {
    await setSetting(db, 'demo', false);
    for (const v of VERTICALS) await db.insert('verticals', v);
    for (const d of DEPARTMENTS) await db.insert('departments', { name: d });
    for (const l of LOCATIONS) await db.insert('locations', { name: l });
    await asyncForEach(
      LEAVE_TYPES,
      async (t, i) => await db.insert('leave_types', { ...t, sort: i }),
    );
    const year = D.yearOf(D.todayIn('Asia/Kolkata'));
    for (const y of [year, year + 1])
      for (const [date, name, type] of holidaysFor(y))
        await db.insert('holidays', { date, name, type });
    for (const p of policyLibrary(D.todayIn('Asia/Kolkata'))) await db.insert('policies', p);
    await db.insert('users', {
      email: adminEmail,
      password_hash: hashPassword(adminPassword),
      role: 'admin',
      must_change_password: 1,
    });
  });
}
