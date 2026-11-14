// Body weight: kept in kg, shown in kg or lb.
//
// Two ways to know your weight, chosen in Settings (`settings.weightMode`):
//  'weighins': you log weigh-ins on the Day screen (collection `weights`, one per
//              day, keyed by date); your weight is the latest one up to a given day.
//              Before your first weigh-in, the weight typed in Settings is used.
//  'manual':   you type one weight in Settings (`settings.weightKg`).

import { today } from './dates.js';

export const LB_PER_KG = 2.20462262;
export const WEIGHT_UNITS = ['kg', 'lb'];

export const toWeightUnit = (kg, unit) => (unit === 'lb' ? kg * LB_PER_KG : kg);
export const fromWeightUnit = (value, unit) => (unit === 'lb' ? value / LB_PER_KG : value);

/** Live weigh-ins, oldest first. */
export function weighIns(db) {
  return Object.values(db.weights || {})
    .filter((w) => !w.deleted && w.kg > 0 && w.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The weigh-in logged on exactly that day, or null. */
export const weighInOn = (db, date) => {
  const w = db.weights?.[date];
  return w && !w.deleted && w.kg > 0 ? w : null;
};

/** Your weight in kg as of a day (today by default), or null when unknown. */
export function currentWeightKg(db, date = today()) {
  const typed = Number(db.settings.weightKg) > 0 ? Number(db.settings.weightKg) : null;
  if ((db.settings.weightMode || 'weighins') === 'manual') return typed;
  const before = weighIns(db).filter((w) => w.date <= date);
  return before.length ? before[before.length - 1].kg : typed;
}
