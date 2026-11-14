// Nutrition maths. Pure functions over the data: no storage, no screen.
//
// A food's values are stored for its "value unit":
// - unit.type 'mass':  per a reference weight (unit.grams, e.g. 100 g); unit.pieceGrams,
//   if set, is the weight of one countable unit (an egg, a slice), so it can be logged in units.
// - unit.type 'piece': per one unit of the food (1 egg, 1 whole meal); unit.grams, if set,
//   is that unit's weight, so it can also be logged in grams.
// Without any weight a food can only be logged in units.
// A composite food (built from components) has no stored values: they are
// worked out from its components every time.

import { KINDS } from './schema.js';
import { t } from '../texts.js';

const MAX_DEPTH = 4; // meal -> product is 2 deep; this is only a safety net

export const isComposite = (food) => !!food && food.source === 'components';

export function addInto(target, values) {
  for (const [k, v] of Object.entries(values || {})) {
    if (Number.isFinite(v)) target[k] = (target[k] || 0) + v;
  }
  return target;
}

export function scale(values, factor) {
  const out = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (Number.isFinite(v)) out[k] = v * factor;
  }
  return out;
}

export const sumValues = (list) => list.reduce(addInto, {});

/** Grams in one unit of the food, or null when it has no known weight. */
export function unitGrams(food, foods, depth = 0) {
  if (!food || depth > MAX_DEPTH) return null;
  const own = Number(food.unit?.grams);
  if (own > 0) return own;
  if (!isComposite(food) || !food.components?.length) return null;
  let total = 0;
  for (const c of food.components) {
    const g = amountGrams(foods[c.foodId], c.amount, foods, depth + 1);
    if (g == null) return null;
    total += g;
  }
  return total > 0 ? total : null;
}

/** How many value units (see the top of this file) an amount is, or null when it can't be told. */
export function amountFactor(food, amount, foods, depth = 0) {
  if (!food || !amount) return null;
  const v = Number(amount.value);
  if (!Number.isFinite(v)) return null;
  if (amount.type === 'units' || amount.type === 'percent') {
    const count = amount.type === 'units' ? v : v / 100; // how many countable units
    if (food.unit?.type !== 'mass') return count;
    // Values are per reference weight: convert through the weight of one unit.
    const piece = Number(food.unit.pieceGrams);
    const ref = Number(food.unit.grams);
    return piece > 0 && ref > 0 ? (count * piece) / ref : null;
  }
  if (amount.type === 'grams') {
    const g = unitGrams(food, foods, depth);
    return g ? v / g : null;
  }
  return null;
}

/** The weight of an amount of the food in grams, or null when unknown. */
export function amountGrams(food, amount, foods, depth = 0) {
  if (!food || !amount) return null;
  const v = Number(amount.value);
  if (!Number.isFinite(v)) return null;
  if (amount.type === 'grams') return v;
  const g = unitGrams(food, foods, depth);
  const f = amountFactor(food, amount, foods, depth);
  return g != null && f != null ? g * f : null;
}

/** Nutrient values in one unit of the food: { nutrientId: number }. */
export function perUnit(food, foods, depth = 0) {
  if (!food || depth > MAX_DEPTH) return {};
  if (!isComposite(food)) return scale(food.values, 1);
  const out = {};
  for (const c of food.components || []) {
    addInto(out, valuesFor(foods[c.foodId], c.amount, foods, depth + 1));
  }
  return out;
}

/** Nutrient values in a given amount of the food. */
export function valuesFor(food, amount, foods, depth = 0) {
  const f = amountFactor(food, amount, foods, depth);
  return f == null ? {} : scale(perUnit(food, foods, depth), f);
}

export const entryValues = (entry, foods) => valuesFor(foods[entry.foodId], entry.amount, foods);

/** Which ways of measuring make sense for this food. */
export function allowedAmountTypes(food, foods) {
  if (!food) return [];
  if (food.unit?.type === 'mass') return Number(food.unit.pieceGrams) > 0 ? ['grams', 'units', 'percent'] : ['grams'];
  return unitGrams(food, foods) ? ['units', 'percent', 'grams'] : ['units', 'percent'];
}

export function defaultAmount(food) {
  if (food.unit?.type === 'mass') return { type: 'grams', value: Number(food.unit.grams) || 100 };
  return { type: 'units', value: 1 };
}

/** Re-express an amount in another type, keeping the same quantity of food. */
export function convertAmount(food, amount, type, foods) {
  const f = amountFactor(food, amount, foods);
  if (f == null) return { type, value: null };
  if (type === 'units' || type === 'percent') {
    // Value units -> countable units (they differ when values are per a reference weight).
    let count = f;
    if (food.unit?.type === 'mass') {
      const piece = Number(food.unit.pieceGrams);
      if (!(piece > 0)) return { type, value: null };
      count = (f * Number(food.unit.grams)) / piece;
    }
    return { type, value: type === 'units' ? count : count * 100 };
  }
  const g = unitGrams(food, foods);
  return { type, value: g ? f * g : null };
}

/** Problems that make a composite food's numbers incomplete. */
export function foodIssues(food, foods) {
  const issues = [];
  if (!isComposite(food)) return issues;
  const allowed = KINDS[food.kind]?.components ?? [];
  for (const c of food.components || []) {
    const part = foods[c.foodId];
    if (!part) issues.push(t('issue.missingPart'));
    else if (!allowed.includes(part.kind)) issues.push(t('issue.notAllowed', { name: part.name }));
    else if (amountFactor(part, c.amount, foods) == null) issues.push(t('issue.needsWeight', { name: part.name }));
  }
  return issues;
}

// Percentages: "13% protein" of a 100 g unit is 13 g. Only for weight nutrients,
// whose stored values are in grams.
export const canBePercent = (nutrient) => nutrient.dimension === 'mass';
export const toPercent = (grams, unitGrams) => (grams / unitGrams) * 100;
export const fromPercent = (pct, unitGrams) => (pct / 100) * unitGrams;

/** Live entries grouped by day: Map 'YYYY-MM-DD' -> entries in the order added. */
export function entriesByDate(db) {
  const map = new Map();
  for (const e of Object.values(db.entries)) {
    if (e.deleted || !e.date) continue;
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  }
  for (const list of map.values()) list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return map;
}

/** Totals over a list of days: per-day values, the grand total and the average per logged day. */
export function rangeTotals(days, byDate, foods) {
  const perDay = new Map();
  const total = {};
  let logged = 0;
  for (const day of days) {
    const entries = byDate.get(day) || [];
    const values = sumValues(entries.map((e) => entryValues(e, foods)));
    perDay.set(day, { values, count: entries.length });
    if (entries.length) {
      logged += 1;
      addInto(total, values);
    }
  }
  return { perDay, total, logged, average: logged ? scale(total, 1 / logged) : {} };
}
