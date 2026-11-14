// Which days can be opened (Day screen, calendar): from your first day with
// data (something logged, or a weigh-in) up to DAYS_AHEAD days after today.
// With no data yet, the first open day is today.

import { store } from './store.js';
import { today, addDays } from './dates.js';

export const DAYS_AHEAD = 7;

/** The earliest day with something logged or a weigh-in, or today if there is none (or it is later). */
export function firstOpenDay(db = store.db) {
  let first = today();
  for (const e of Object.values(db.entries)) if (!e.deleted && e.date && e.date < first) first = e.date;
  for (const w of Object.values(db.weights || {})) if (!w.deleted && w.date && w.kg > 0 && w.date < first) first = w.date;
  return first;
}

export const lastOpenDay = () => addDays(today(), DAYS_AHEAD);

/** Whether a day can be opened. Pass `first` when checking many days at once. */
export const isOpenDay = (key, first = firstOpenDay()) => key >= first && key <= lastOpenDay();

/** The nearest day that can be opened. */
export function clampDay(key) {
  const first = firstOpenDay();
  const last = lastOpenDay();
  return key < first ? first : key > last ? last : key;
}
