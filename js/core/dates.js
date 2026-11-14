// Days are handled as 'YYYY-MM-DD' strings in the device's own time zone.

import { locale } from '../texts.js';

// Dates and numbers are written the way the chosen language writes them.
export const LOCALE = locale; // a function: LOCALE() -> 'en-GB' | 'ca-ES' | 'es-ES'

const pad = (n) => String(n).padStart(2, '0');

export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => keyOf(new Date());

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

/** The first day of the month `n` months away. */
export function addMonths(key, n) {
  const d = parseKey(key);
  return keyOf(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/** The first day of the week holding `key` (weekStart: 1 Monday, 0 Sunday). */
export function weekStart(key, start = 1) {
  const diff = (parseKey(key).getDay() - start + 7) % 7;
  return addDays(key, -diff);
}

export function weekDays(key, start = 1) {
  const first = weekStart(key, start);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export function monthDays(key) {
  const d = parseKey(key);
  const count = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => keyOf(new Date(d.getFullYear(), d.getMonth(), i + 1)));
}

/** The weeks (each 7 days) that cover the month holding `key`. */
export function monthWeeks(key, start = 1) {
  const days = monthDays(key);
  const weeks = [];
  let first = weekStart(days[0], start);
  while (first <= days[days.length - 1]) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(first, i)));
    first = addDays(first, 7);
  }
  return weeks;
}

export const sameMonth = (a, b) => a.slice(0, 7) === b.slice(0, 7);


export function fmt(key, options) {
  return new Intl.DateTimeFormat(LOCALE(), options).format(parseKey(key));
}

/** "9 – 15 Nov 2026", or "30 Nov – 6 Dec 2026" across months. */
export function fmtRange(from, to) {
  const year = fmt(to, { year: 'numeric' });
  if (sameMonth(from, to)) return `${fmt(from, { day: 'numeric' })} – ${fmt(to, { day: 'numeric', month: 'short' })} ${year}`;
  return `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(to, { day: 'numeric', month: 'short' })} ${year}`;
}
