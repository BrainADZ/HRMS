// A small, deterministic company fixture for local demos. Every person is fictional.
import { hashPassword } from './auth.js';
import { isCompanyOwner } from './lib/employee-policy.js';
import { DEFAULT_SETTINGS, setSetting } from './core.js';
import * as D from './lib/dates.js';
import { estimateMonthlyTds } from './lib/payroll.js';
import { textPdf } from './lib/pdf.js';
import { processRun } from './services/payroll.js';
import { DEMO_PASSWORD, seedEmpty } from './seed.js';

const heads = [
  ['Kabir', 'Sethi', 'Live', 'Business Head', 'Mumbai'],
  ['Meera', 'Rao', 'Marketing', 'Business Head', 'Bengaluru'],
  ['Aditya', 'Khanna', 'Exhibits', 'Business Head', 'Delhi NCR'],
];

// Head -> team manager -> individual contributors. Counts: 1 + 3 + 10 + 36 = 50.
const teams = [
  {
    head: 'Kabir',
    lead: ['Vikram', 'Patel'],
    vertical: 'Live',
    department: 'Sales',
    title: 'Sales Manager',
    members: 5,
    roles: ['Sales Executive', 'Account Executive'],
  },
  {
    head: 'Kabir',
    lead: ['Ishita', 'Roy'],
    vertical: 'Live',
    department: 'Events',
    title: 'Event Manager',
    members: 4,
    roles: ['Event Coordinator', 'Production Executive'],
  },
  {
    head: 'Kabir',
    lead: ['Sameer', 'Khan'],
    vertical: 'Live',
    department: 'Client Servicing',
    title: 'Client Servicing Manager',
    members: 3,
    roles: ['Account Executive', 'Client Servicing Executive'],
  },
  {
    head: 'Meera',
    lead: ['Nandini', 'Joshi'],
    vertical: 'Marketing',
    department: 'Marketing',
    title: 'Marketing Manager',
    members: 4,
    roles: ['Marketing Executive', 'Digital Marketing Specialist'],
  },
  {
    head: 'Meera',
    lead: ['Rhea', 'Kapoor'],
    vertical: 'Marketing',
    department: 'Creative',
    title: 'Creative Lead',
    members: 4,
    roles: ['Graphic Designer', 'Content Strategist'],
  },
  {
    head: 'Aditya',
    lead: ['Arjun', 'Nair'],
    vertical: 'Exhibits',
    department: 'Design',
    title: 'Design Manager',
    members: 4,
    roles: ['Exhibition Designer', '3D Visualizer'],
  },
  {
    head: 'Aditya',
    lead: ['Tara', 'Shah'],
    vertical: 'Exhibits',
    department: 'Operations',
    title: 'Operations Manager',
    members: 4,
    roles: ['Project Executive', 'Site Supervisor'],
  },
  {
    head: 'Rajiv',
    lead: ['Priya', 'Sharma'],
    vertical: 'Corporate',
    department: 'HR',
    title: 'HR Manager',
    members: 3,
    roles: ['HR Executive', 'Recruiter'],
  },
  {
    head: 'Rajiv',
    lead: ['Neha', 'Bansal'],
    vertical: 'Corporate',
    department: 'Finance',
    title: 'Finance Manager',
    members: 3,
    roles: ['Finance Executive', 'Accounts Executive'],
  },
  {
    head: 'Rajiv',
    lead: ['Rohan', 'Desai'],
    vertical: 'Corporate',
    department: 'IT',
    title: 'IT Manager',
    members: 2,
    roles: ['IT Support Engineer', 'System Administrator'],
  },
];

const memberNames = [
  ['Dev', 'Saxena'],
  ['Pooja', 'Nair'],
  ['Karan', 'Bedi'],
  ['Aisha', 'Khan'],
  ['Ritika', 'Sen'],
  ['Sneha', 'Iyer'],
  ['Varun', 'Gupta'],
  ['Ananya', 'Singh'],
  ['Harsh', 'Jain'],
  ['Zoya', 'Ali'],
  ['Manav', 'Bose'],
  ['Diya', 'Chopra'],
  ['Aarav', 'Mehta'],
  ['Kavya', 'Singh'],
  ['Rohit', 'Verma'],
  ['Ira', 'Menon'],
  ['Sana', 'Mirza'],
  ['Yash', 'Tandon'],
  ['Anika', 'Das'],
  ['Nikhil', 'Arora'],
  ['Sahil', 'Kohli'],
  ['Mira', 'Pillai'],
  ['Tanmay', 'Jha'],
  ['Sonia', 'Mathur'],
  ['Ishaan', 'Mitra'],
  ['Nisha', 'Reddy'],
  ['Abhay', 'Kulkarni'],
  ['Farah', 'Qureshi'],
  ['Simran', 'Gill'],
  ['Vivek', 'Sood'],
  ['Aditi', 'Bhatt'],
  ['Parth', 'Sharma'],
  ['Leena', 'Dutta'],
  ['Mohit', 'Agarwal'],
  ['Juhi', 'Chawla'],
  ['Om', 'Prakash'],
];

const skillsByDepartment = {
  Leadership: ['Strategy', 'Budgeting', 'People Management'],
  Sales: ['B2B Sales', 'CRM', 'Negotiation'],
  Events: ['Event Planning', 'Vendor Management', 'Logistics'],
  'Client Servicing': ['Account Management', 'Presentation', 'Client Communication'],
  Marketing: ['Campaign Analytics', 'Digital Marketing', 'SEO'],
  Creative: ['Figma', 'Copywriting', 'Adobe Creative Cloud'],
  Technology: ['React', 'JavaScript', 'TypeScript', 'Redux', 'HTML', 'CSS'],
  Design: ['AutoCAD', '3ds Max', 'Spatial Design'],
  Operations: ['Project Management', 'Procurement', 'Site Supervision'],
  HR: ['Recruitment', 'Payroll', 'Employee Engagement'],
  Finance: ['Accounting', 'GST', 'Excel'],
  IT: ['IT Support', 'Networking', 'Security'],
};

const stamp = (date, time = '10:00') => D.zonedIso(date, time);
const weekday = (date) => ![0, 6].includes(D.dow(date));
const firstWorkday = (month, offset = 0) =>
  D.eachDay(D.monthStart(month), D.monthEnd(month)).filter(weekday)[offset];

export async function seed50Demo(db, { today = D.todayIn(), saveFile = null } = {}) {
  const month = D.monthOf(today);
  const start = D.monthStart(D.addMonths(month, -4));
  const existingEmployees = Number(await db.value('SELECT COUNT(*) FROM employees'));
  const existingUsers = await db.all('SELECT id, role, employee_id FROM users ORDER BY id');
  if (
    existingEmployees ||
    existingUsers.length > 1 ||
    existingUsers.some((u) => u.role !== 'admin' || u.employee_id)
  ) {
    throw new Error('Demo seed requires an empty company with at most one unlinked admin');
  }

  await db.tx(async () => {
    if (!existingUsers.length) {
      await seedEmpty(db, { adminEmail: 'demo.setup@brainadz.com', adminPassword: DEMO_PASSWORD });
    }
    await setSetting(db, 'companyName', 'BrainADZ');
    await setSetting(db, 'timezone', 'Asia/Kolkata');
    await setSetting(db, 'weeklyOffs', [0, 6]);
    await setSetting(db, 'payroll', DEFAULT_SETTINGS.payroll);
    await setSetting(db, 'demo', true);

    const ids = async (table, key) =>
      Object.fromEntries(
        (await db.all(`SELECT id, ${key} FROM ${table}`)).map((row) => [row[key], row.id]),
      );
    const verticals = await ids('verticals', 'short');
    const departments = await ids('departments', 'name');
    const locations = await ids('locations', 'name');
    const leaveTypes = await ids('leave_types', 'code');
    const people = [];
    const byFirst = new Map();
    const passwordHash = hashPassword(DEMO_PASSWORD);
    let memberIndex = 0;
    let hrUserId;
    let ceoUserId;

    async function addPerson(
      first,
      last,
      { vertical, department, title, grade, manager, location, role, joinDate },
    ) {
      const number = people.length + 1;
      const code = `BZ${String(number).padStart(3, '0')}`;
      const email = `${first}.${last}@brainadz.com`.toLowerCase();
      const ctc =
        { CXO: 7200000, Head: 3600000, Manager: 1800000, Executive: 750000 }[grade] +
        number * 12000;
      const employee = {
        code,
        first_name: first,
        last_name: last,
        email,
        phone: `+91 90000${String(number).padStart(5, '0')}`,
        gender:
          [
            'Priya',
            'Meera',
            'Ishita',
            'Nandini',
            'Rhea',
            'Tara',
            'Neha',
            'Pooja',
            'Aisha',
            'Ritika',
            'Sneha',
            'Ananya',
            'Zoya',
            'Diya',
            'Aarav',
            'Kavya',
            'Ira',
            'Sana',
            'Anika',
            'Mira',
            'Sonia',
            'Nisha',
            'Farah',
            'Simran',
            'Aditi',
            'Leena',
            'Juhi',
          ].includes(first) && first !== 'Aarav'
            ? 'F'
            : 'M',
        dob: `${1980 + (number % 19)}-${D.pad((number % 12) + 1)}-${D.pad((number % 26) + 1)}`,
        vertical_id: verticals[vertical],
        department_id: departments[department],
        designation: title,
        grade,
        manager_id: manager?.id ?? null,
        employment_type: 'Full-time',
        location_id: locations[location],
        work_place: 'onsite',
        join_date: joinDate,
        status: 'Active',
        about: `${title} in ${department}, reporting to ${manager ? `${manager.first_name} ${manager.last_name}` : 'the board'}. Supports BrainADZ ${vertical} projects.`,
        skills: skillsByDepartment[department],
        certifications: [
          {
            name: `${department} Essentials`,
            issuer: 'BrainADZ Learning',
            issued: D.addDays(today, -180),
          },
        ],
        ctc,
        monthly_tds: estimateMonthlyTds(ctc),
        pan: `ABCDE${String(1000 + number)}F`,
        uan: `1000000${String(number).padStart(5, '0')}`,
        bank_name: 'HDFC Bank',
        bank_account: `1000000000${String(number).padStart(5, '0')}`,
        ifsc: 'HDFC0001234',
        address: `${number + 100}, Sample Street, ${location}`,
        emergency_contact: `Demo Contact +91 91111${String(number).padStart(5, '0')}`,
      };
      employee.id = await db.insert('employees', employee);
      const userId =
        role === 'admin'
          ? existingUsers[0]?.id || (await db.value('SELECT id FROM users LIMIT 1'))
          : await db.insert('users', {
              email,
              password_hash: passwordHash,
              role,
              employee_id: employee.id,
            });
      if (role === 'admin') {
        await db.update('users', userId, {
          email,
          password_hash: passwordHash,
          role,
          employee_id: employee.id,
          must_change_password: 0,
          active: 1,
        });
      }
      employee.userId = userId;
      people.push(employee);
      byFirst.set(first, employee);
      if (first === 'Priya') hrUserId = userId;
      if (role === 'admin') ceoUserId = userId;
      return employee;
    }

    const ceo = await addPerson('Rajiv', 'Malhotra', {
      vertical: 'Corporate',
      department: 'Leadership',
      title: 'Chief Executive Officer',
      grade: 'CXO',
      location: 'Bengaluru',
      role: 'admin',
      joinDate: '2015-06-01',
    });
    for (const [first, last, vertical, title, location] of heads) {
      await addPerson(first, last, {
        vertical,
        department: 'Leadership',
        title,
        grade: 'Head',
        manager: ceo,
        location,
        role: 'manager',
        joinDate: '2018-04-02',
      });
    }
    for (const team of teams) {
      const manager = byFirst.get(team.head);
      const location =
        team.vertical === 'Live'
          ? 'Mumbai'
          : team.vertical === 'Exhibits'
            ? 'Delhi NCR'
            : 'Bengaluru';
      const lead = await addPerson(...team.lead, {
        vertical: team.vertical,
        department: team.department,
        title: team.title,
        grade: 'Manager',
        manager,
        location,
        role: team.department === 'HR' ? 'hr' : 'manager',
        joinDate: '2020-03-02',
      });
      for (let i = 0; i < team.members; i++) {
        const [first, last] = memberNames[memberIndex++];
        await addPerson(first, last, {
          vertical: team.vertical,
          department: team.department,
          title: team.roles[i % team.roles.length],
          grade: 'Executive',
          manager: lead,
          location,
          role: 'employee',
          joinDate: i === team.members - 1 ? D.addDays(start, 14) : '2022-04-15',
        });
      }
    }
    if (people.length !== 50 || memberIndex !== memberNames.length)
      throw new Error('Demo hierarchy must contain exactly 50 people');

    await db.update('users', byFirst.get('Neha').userId, {
      email: 'admin@brainadz.com',
      display_name: 'Admin / Accountant',
      password_hash: passwordHash,
      role: 'admin',
      must_change_password: 0,
      active: 1,
    });

    const demoCareer = byFirst.get('Aarav');
    const firstCtc = demoCareer.ctc - 120000;
    await db.insert('employee_career_events', {
      employee_id: demoCareer.id,
      effective_date: demoCareer.join_date,
      event_type: 'Joining',
      designation: `Junior ${demoCareer.designation}`,
      previous_ctc: null,
      new_ctc: firstCtc,
      note: 'Demo career history',
    });
    await db.insert('employee_career_events', {
      employee_id: demoCareer.id,
      effective_date: '2024-04-01',
      event_type: 'Increment',
      designation: `Junior ${demoCareer.designation}`,
      previous_ctc: firstCtc,
      new_ctc: firstCtc + 60000,
      note: 'Demo annual salary increment',
    });
    await db.insert('employee_career_events', {
      employee_id: demoCareer.id,
      effective_date: '2025-04-01',
      event_type: 'Promotion',
      designation: demoCareer.designation,
      previous_ctc: firstCtc + 60000,
      new_ctc: demoCareer.ctc,
      note: 'Demo promotion and salary increment',
    });

    // Four completed months and the current month: approved leave, work sessions and attendance.
    const holidays = new Set(
      (await db.all('SELECT date FROM holidays WHERE date >= ? AND date <= ?', start, today)).map(
        (h) => h.date,
      ),
    );
    for (const person of people) {
      for (let back = 4; back >= 0 && !isCompanyOwner(person); back--) {
        const m = D.addMonths(month, -back);
        const leaveDate = firstWorkday(m, 7 + (people.indexOf(person) % 6));
        if (
          leaveDate &&
          leaveDate >= person.join_date &&
          leaveDate <= today &&
          !holidays.has(leaveDate)
        ) {
          await db.insert('leave_requests', {
            employee_id: person.id,
            leave_type_id: leaveTypes[back % 2 ? 'CL' : 'EL'],
            from_date: leaveDate,
            to_date: leaveDate,
            days: 1,
            reason: back % 2 ? 'Personal appointment' : 'Family commitment',
            status: 'Approved',
            decided_by: person.manager_id
              ? byFirst.get(people.find((p) => p.id === person.manager_id)?.first_name)?.userId ||
                hrUserId
              : hrUserId,
            decided_at: stamp(D.addDays(leaveDate, -2), '15:00'),
            created_at: stamp(D.addDays(leaveDate, -3), '10:00'),
          });
        }
        for (const date of D.eachDay(D.monthStart(m), m === month ? today : D.monthEnd(m))) {
          if (date >= today || !weekday(date) || holidays.has(date) || date < person.join_date) continue;
          const onLeave = date === leaveDate;
          const checkIn = onLeave ? null : stamp(date, `09:${D.pad(25 + (person.id % 5) * 5)}`);
          const checkOut = onLeave ? null : stamp(date, `18:${D.pad(30 + (person.id % 4) * 5)}`);
          if (!onLeave) {
            await db.insert('attendance', {
              employee_id: person.id,
              date,
              status: 'P',
              check_in: checkIn,
              check_out: checkOut,
            });
            await db.insert('work_sessions', {
              employee_id: person.id,
              date,
              start_at: checkIn,
              end_at: checkOut,
              mode: 'office',
              ended_by: 'checkout',
            });
          }
        }
      }
      await db.insert('assets', {
        employee_id: person.id,
        type: 'Laptop',
        name: `BrainADZ laptop ${person.code}`,
        serial: `DEMO-LAP-${person.code}`,
        issued_on: person.join_date,
        status: 'Issued',
      });
      await db.insert('onboarding_tasks', {
        employee_id: person.id,
        title: 'Complete HR orientation',
        done: 1,
        done_at: stamp(person.join_date),
        sort: 1,
      });
      if (saveFile) {
        for (const [category, name, details] of [
          [
            'Offer Letter',
            'Offer Letter',
            [
              `Employee: ${person.first_name} ${person.last_name}`,
              `Role: ${person.designation}`,
              `Joining: ${person.join_date}`,
              `Annual CTC: INR ${person.ctc}`,
            ],
          ],
          [
            'ID Proof',
            'Employee ID',
            [
              `Code: ${person.code}`,
              `Department: ${people.find((p) => p.id === person.id)?.designation}`,
              `Email: ${person.email}`,
            ],
          ],
        ]) {
          const file = `demo-50-${person.code.toLowerCase()}-${category === 'ID Proof' ? 'id' : 'offer'}.pdf`;
          const bytes = textPdf(name, details, { footer: 'FICTIONAL DEMO DOCUMENT' });
          saveFile('documents', file, bytes);
          await db.insert('documents', {
            employee_id: person.id,
            name,
            category,
            file,
            mime: 'application/pdf',
            size: bytes.length,
            uploaded_by: hrUserId,
          });
        }
      }
    }

    const cycleId = await db.insert('review_cycles', {
      name: `Demo performance ${month}`,
      start_date: start,
      end_date: today,
      status: 'Active',
    });
    for (const person of people.filter((p) => p.grade !== 'CXO')) {
      await db.insert('goals', {
        cycle_id: cycleId,
        employee_id: person.id,
        title: `Deliver ${person.designation} quarterly objectives`,
        description: `Complete team priorities for ${person.designation}.`,
        weight: 100,
        progress: 45 + (person.id % 9) * 5,
        due_date: D.monthEnd(month),
      });
      await db.insert('reviews', {
        cycle_id: cycleId,
        employee_id: person.id,
        self_rating: 3 + (person.id % 3) * 0.5,
        self_comments: 'Progressing on agreed deliverables.',
        manager_rating: 3 + (person.id % 3) * 0.5,
        manager_comments: 'Strong ownership and collaboration.',
        final_rating: 3 + (person.id % 3) * 0.5,
        status: 'Completed',
      });
    }

    const policies = await db.all(
      'SELECT id, version FROM policies WHERE requires_ack = 1 ORDER BY id LIMIT 3',
    );
    for (const person of people) {
      for (const policy of policies) {
        await db.insert('policy_acks', {
          policy_id: policy.id,
          employee_id: person.id,
          version: policy.version,
          acked_at: stamp(D.addDays(today, -30)),
        });
      }
      await db.insert('posh_training', {
        employee_id: person.id,
        completed_at: stamp(D.addDays(today, -45)),
      });
      if (person.id % 5 === 0) {
        await db.insert('requests', {
          employee_id: person.id,
          category: 'IT',
          subject: 'Laptop accessory request',
          description: 'Requesting a spare charger for office travel.',
          status: person.id % 10 === 0 ? 'Resolved' : 'Open',
          response: person.id % 10 === 0 ? 'Accessory issued by IT.' : null,
          created_at: stamp(D.addDays(today, -person.id)),
        });
      }
    }

    const openings = [
      ['Event Producer', 'Live', 'Events', 'Mumbai', 'Ishita'],
      ['Digital Marketing Specialist', 'Marketing', 'Marketing', 'Bengaluru', 'Nandini'],
      ['Senior Frontend Developer', 'Marketing', 'Technology', 'Bengaluru', 'Rhea'],
      ['Exhibition Designer', 'Exhibits', 'Design', 'Delhi NCR', 'Arjun'],
    ];
    for (const [title, vertical, department, location, hiringManager] of openings) {
      const jobId = await db.insert('jobs', {
        title,
        vertical_id: verticals[vertical],
        department_id: departments[department],
        location_id: locations[location],
        openings: 2,
        posted_on: D.addDays(today, -28),
        description: `Join the BrainADZ ${department} team as ${title}.`,
        must_have:
          department === 'Technology'
            ? skillsByDepartment[department]
            : skillsByDepartment[department].slice(0, 2),
        nice_to_have: skillsByDepartment[department].slice(2),
        exp_min: 2,
        exp_max: 7,
        salary_min: 600000,
        salary_max: department === 'Technology' ? 2000000 : 1400000,
        hiring_manager_id: byFirst.get(hiringManager).id,
      });
      for (let i = 0; i < 3; i++) {
        const candidateId = await db.insert('candidates', {
          job_id: jobId,
          name: `Demo Applicant ${vertical} ${i + 1}`,
          email: `applicant.${vertical.toLowerCase()}.${i + 1}@example.test`,
          phone: `+91 92222${String(jobId * 10 + i).padStart(5, '0')}`,
          location,
          current_title: title,
          experience: 2 + i,
          education: 'Graduate',
          expected_ctc: 750000 + i * 100000,
          notice_days: 30,
          skills: skillsByDepartment[department],
          source: 'Company Website',
          stage: i === 0 ? 'Interview' : 'Applied',
          max_stage: i === 0 ? 3 : 0,
          applied_on: D.addDays(today, -20 + i * 3),
        });
        await db.insert('candidate_activity', {
          candidate_id: candidateId,
          text: 'Application received',
          by_name: 'Priya Sharma',
          created_at: stamp(D.addDays(today, -20 + i * 3)),
        });
        if (i === 0) {
          await db.insert('interviews', {
            candidate_id: candidateId,
            round: 'Hiring Manager',
            scheduled_at: stamp(D.addDays(today, 3), '11:00'),
            interviewer_id: byFirst.get(hiringManager).id,
            status: 'Scheduled',
          });
        }
      }
    }

    for (let back = 4; back >= 1; back--) {
      const payMonth = D.addMonths(month, -back);
      const run = await processRun(db, { id: hrUserId, name: 'Priya Sharma' }, payMonth, { today });
      const paidAt = stamp(D.monthEnd(payMonth), '17:00');
      await db.update('payroll_runs', run.id, {
        status: 'Completed',
        steps: {
          collation: paidAt,
          sync: paidAt,
          processing: paidAt,
          approvals: paidAt,
          transfer: paidAt,
          completed: paidAt,
        },
        approvals: [
          { stage: 'Prepared by HR', by: 'Priya Sharma', at: paidAt },
          { stage: 'Management Approval', by: 'Rajiv Malhotra', at: paidAt },
        ],
        bank_batch: { id: `DEMO-${payMonth}`, status: 'Completed', payDate: D.monthEnd(payMonth) },
      });
      await db.run("UPDATE payslips SET status = 'Paid' WHERE run_id = ?", run.id);
    }
    await db.insert('notices', {
      title: 'Welcome to BrainADZ demo',
      body: 'Explore the 50-person hierarchy, four months of attendance and payroll history.',
      kind: 'general',
      created_by: ceoUserId,
    });
  });
}
