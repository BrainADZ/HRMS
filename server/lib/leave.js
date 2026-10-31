// Leave arithmetic: working-day counting and entitlement. Pure functions.
import { dow, eachDay, yearOf } from './dates.js';

// ctx: { weeklyOffs: number[] (0 = Sunday), holidays: Set<'YYYY-MM-DD'> }
export function isWorkingDay(date, ctx) {
  return !ctx.weeklyOffs.includes(dow(date)) && !ctx.holidays.has(date);
}

// Returns a Map of year -> days for a request, so a leave spanning
// 31 Dec - 2 Jan is charged to the right year's balance.
export function leaveDaysByYear({ from, to, halfDay, calendarDays }, ctx) {
  const out = new Map();
  if (halfDay) {
    if (calendarDays || isWorkingDay(from, ctx)) out.set(yearOf(from), 0.5);
    return out;
  }
  for (const d of eachDay(from, to)) {
    if (calendarDays || isWorkingDay(d, ctx)) out.set(yearOf(d), (out.get(yearOf(d)) || 0) + 1);
  }
  return out;
}

export function countLeaveDays(req, ctx) {
  let total = 0;
  for (const v of leaveDaysByYear(req, ctx).values()) total += v;
  return total;
}

export const roundHalf = (x) => Math.round(x * 2) / 2;

// Policy years are labelled by the April in which they start.
export function leaveYear(date) {
  return yearOf(date) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
}

export function leaveYearBounds(year) {
  return { start: `${year}-04-01`, end: `${year + 1}-03-31` };
}

export function leaveDaysByPolicyYear(request, ctx) {
  const out = new Map();
  for (const day of eachDay(request.from, request.to)) {
    if (request.halfDay && day !== request.from) break;
    if (request.calendarDays || isWorkingDay(day, ctx)) {
      const year = leaveYear(day);
      out.set(year, (out.get(year) || 0) + (request.halfDay ? 0.5 : 1));
    }
  }
  return out;
}

function completedMonths(from, until) {
  return Math.max(
    0,
    (yearOf(until) - yearOf(from)) * 12 +
      Number(until.slice(5, 7)) -
      Number(from.slice(5, 7)) -
      (until.slice(8) < from.slice(8) ? 1 : 0),
  );
}

// EL is earned after each completed month. Quarterly leave is credited at
// quarter start, with the joining quarter pro-rated for remaining months.
export function entitlement(type, joinDate, year, asOf) {
  if (type.annual_quota == null) return null;
  const { start: yStart, end: yEnd } = leaveYearBounds(year);
  if (joinDate > yEnd || asOf < yStart || asOf < joinDate) return 0;
  const start = joinDate > yStart ? joinDate : yStart;
  const until = asOf < yEnd ? asOf : yEnd;
  const monthIndex = (date) => (yearOf(date) - year) * 12 + Number(date.slice(5, 7)) - 4;
  if (type.accrual === 'monthly') {
    // Include the last service day when evaluating a completed policy year.
    const cutoff = until === yEnd ? `${year + 1}-04-01` : until;
    return roundHalf((type.annual_quota * Math.min(12, completedMonths(start, cutoff))) / 12);
  }
  if (type.accrual === 'quarterly') {
    const first = monthIndex(start);
    const last = Math.min(11, Math.floor(monthIndex(until) / 3) * 3 + 2);
    return roundHalf((type.annual_quota * Math.max(0, last - first + 1)) / 12);
  }
  // Family leave is an event allowance, not a join-month pro-rated quota.
  if (type.accrual === 'event') return type.annual_quota;
  return roundHalf((type.annual_quota * (12 - monthIndex(start))) / 12);
}
