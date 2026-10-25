import type { ISO, Settings } from './types';

/**
 * Working calendar (SC-01, D07): Sunday–Thursday by default, company holidays, and per-contract
 * day type. Dates are reckoned in Riyadh time (UTC+3, no DST).
 */
const OFFSET = 3 * 3600_000;
const DAY = 86_400_000;

const local = (iso: ISO) => new Date(Date.parse(iso) + OFFSET);
export const dateKey = (iso: ISO) => local(iso).toISOString().slice(0, 10);
export const weekday = (iso: ISO) => local(iso).getUTCDay();

export const addCalendarDays = (iso: ISO, n: number): ISO => new Date(Date.parse(iso) + n * DAY).toISOString();
export const addHours = (iso: ISO, h: number): ISO => new Date(Date.parse(iso) + h * 3600_000).toISOString();

export function isWorkingDay(iso: ISO, s: Settings) {
  return s.workWeek.includes(weekday(iso)) && !s.holidays.some((h) => h.date === dateKey(iso));
}

/** N working days later at the same time of day; starts counting from the next working day. */
export function addWorkingDays(iso: ISO, n: number, s: Settings): ISO {
  let d = iso;
  let left = n;
  while (left > 0) {
    d = addCalendarDays(d, 1);
    if (isWorkingDay(d, s)) left--;
  }
  return d;
}

export const addDays = (iso: ISO, n: number, dayType: 'working' | 'calendar', s: Settings) =>
  dayType === 'working' ? addWorkingDays(iso, n, s) : addCalendarDays(iso, n);

/** Whole days from a to b (b later), counting working days only when asked. */
export function daysBetween(a: ISO, b: ISO, dayType: 'working' | 'calendar', s: Settings): number {
  const start = Date.parse(a);
  const end = Date.parse(b);
  if (end <= start) return 0;
  if (dayType === 'calendar') return Math.floor((end - start) / DAY);
  let n = 0;
  for (let t = start + DAY; t <= end; t += DAY) if (isWorkingDay(new Date(t).toISOString(), s)) n++;
  return n;
}

export const isAfter = (a: ISO | undefined, b: ISO) => !!a && Date.parse(a) > Date.parse(b);
export const isBefore = (a: ISO | undefined, b: ISO) => !!a && Date.parse(a) < Date.parse(b);

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', ...opts });
const dateFmt = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = fmt({ day: 'numeric', month: 'short' });
const dateTimeFmt = fmt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const weekdayFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const fmtDate = (iso?: ISO) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const fmtShort = (iso?: ISO) => (iso ? shortFmt.format(new Date(iso)) : '—');
export const fmtDateTime = (iso?: ISO) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');
export const fmtLong = (iso?: ISO) => (iso ? weekdayFmt.format(new Date(iso)) : '—');

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const fmtMoney = (n: number) => `${money.format(n)} ر.س`;

/** A date-only input value (yyyy-mm-dd) in Riyadh time, and back to an ISO at 09:00. */
export const toInputDate = (iso?: ISO) => (iso ? dateKey(iso) : '');
export const fromInputDate = (v: string): ISO => new Date(`${v}T09:00:00+03:00`).toISOString();
