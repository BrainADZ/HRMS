import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countLeaveDays,
  leaveDaysByYear,
  leaveDaysByPolicyYear,
  leaveYear,
  entitlement,
} from '../lib/leave.js';

const ctx = { weeklyOffs: [0, 6], holidays: new Set(['2026-10-02']) };

test('weekends and company holidays are not counted', () => {
  // Thu 1 Oct to Tue 6 Oct 2026: Fri 2 Oct holiday, Sat/Sun off
  assert.equal(countLeaveDays({ from: '2026-10-01', to: '2026-10-06' }, ctx), 3);
});

test('calendar-day leave counts every day', () => {
  assert.equal(
    countLeaveDays({ from: '2026-10-01', to: '2026-10-06', calendarDays: true }, ctx),
    6,
  );
});

test('half day counts 0.5 and nothing on a weekly off', () => {
  assert.equal(countLeaveDays({ from: '2026-10-05', to: '2026-10-05', halfDay: true }, ctx), 0.5);
  assert.equal(countLeaveDays({ from: '2026-10-03', to: '2026-10-03', halfDay: true }, ctx), 0);
});

test('leave across the new year is split by year', () => {
  const m = leaveDaysByYear(
    { from: '2026-12-30', to: '2027-01-04' },
    { weeklyOffs: [0, 6], holidays: new Set() },
  );
  assert.equal(m.get(2026), 2);
  assert.equal(m.get(2027), 2);
});

test('annual entitlement is pro-rated from the joining month', () => {
  const cl = { annual_quota: 12, accrual: 'annual' };
  assert.equal(entitlement(cl, '2020-01-10', 2026, '2026-10-12'), 12);
  assert.equal(entitlement(cl, '2026-07-15', 2026, '2026-10-12'), 9);
  assert.equal(entitlement(cl, '2027-04-01', 2026, '2026-10-12'), 0);
});

test('monthly accrual credits up to the current month', () => {
  const el = { annual_quota: 6, accrual: 'monthly' };
  assert.equal(entitlement(el, '2020-01-01', 2026, '2026-10-12'), 3);
  assert.equal(entitlement(el, '2020-01-01', 2025, '2026-10-12'), 6);
});

test('unlimited types have no entitlement cap', () => {
  assert.equal(entitlement({ annual_quota: null }, '2020-01-01', 2026, '2026-10-12'), null);
});

test('EL credits only after completed months, including policy year end', () => {
  const el = { annual_quota: 6, accrual: 'monthly' };
  assert.equal(entitlement(el, '2020-01-01', 2026, '2026-04-30'), 0);
  assert.equal(entitlement(el, '2020-01-01', 2026, '2026-05-01'), 0.5);
  assert.equal(entitlement(el, '2026-07-15', 2026, '2026-08-14'), 0);
  assert.equal(entitlement(el, '2026-07-15', 2026, '2026-08-15'), 0.5);
  assert.equal(entitlement(el, '2020-01-01', 2026, '2027-03-31'), 6);
  assert.equal(entitlement(el, '2020-01-01', 2026, '2027-02-01'), 5);
});

test('shared CL/SL credits quarterly and is pro-rated for joiners', () => {
  const cl = { annual_quota: 12, accrual: 'quarterly' };
  for (const [day, expected] of [
    ['2026-04-01', 3],
    ['2026-06-30', 3],
    ['2026-07-01', 6],
    ['2026-10-01', 9],
    ['2027-01-01', 12],
    ['2027-03-31', 12],
  ]) {
    assert.equal(entitlement(cl, '2020-01-01', 2026, day), expected, day);
  }
  assert.equal(entitlement(cl, '2026-05-15', 2026, '2026-06-30'), 2);
  assert.equal(entitlement(cl, '2026-05-15', 2026, '2027-03-31'), 11);
  assert.equal(entitlement(cl, '2026-08-15', 2026, '2026-07-01'), 0);
});

test('paternity allowance is six days without joining-month proration', () => {
  assert.equal(
    entitlement({ annual_quota: 6, accrual: 'event' }, '2027-03-01', 2026, '2027-03-01'),
    6,
  );
});

test('policy years reset on April 1, not January 1', () => {
  assert.equal(leaveYear('2027-03-31'), 2026);
  assert.equal(leaveYear('2027-04-01'), 2027);
  const m = leaveDaysByPolicyYear({ from: '2027-03-31', to: '2027-04-02' }, ctx);
  assert.equal(m.get(2026), 1);
  assert.equal(m.get(2027), 2);
  const jan = leaveDaysByPolicyYear({ from: '2026-12-31', to: '2027-01-01' }, ctx);
  assert.equal(jan.size, 1);
  assert.equal(jan.get(2026), 2);
});
