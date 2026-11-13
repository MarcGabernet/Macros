// Turning numbers and amounts into text, and typed text back into numbers.

import { KINDS, isEnergyUnit } from './schema.js';
import { LOCALE } from './dates.js';
import { unitGrams, isComposite } from './calc.js';

/** Read a typed number; accepts a comma or a dot as the decimal mark. */
export function parseNum(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const cleaned = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** A number for display: at most `decimals` decimals, none once it reaches 100. */
export function num(value, decimals = 1) {
  if (!Number.isFinite(value)) return '0';
  const d = Math.abs(value) >= 100 ? 0 : decimals;
  return value.toLocaleString(LOCALE, { maximumFractionDigits: d });
}

/** A number as it should appear inside an input box (no thousands separators). */
export function inputStr(value, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return String(Number(Number(value).toFixed(decimals)));
}

export function nutrientNum(nutrient, value) {
  return isEnergyUnit(nutrient.unit) ? num(Math.round(value || 0), 0) : num(value || 0, 1);
}

export const withUnit = (nutrient, value) => `${nutrientNum(nutrient, value)} ${nutrient.unit}`;

/** What one unit of a food is called: "egg", "dish", "meal"... */
export function pieceName(food) {
  return food.unit?.name?.trim() || (food.kind === 'ingredient' ? 'unit' : KINDS[food.kind].label.toLowerCase());
}

/** "per 100 g", "per egg · 60 g", "whole dish · 450 g" */
export function unitLabel(food, foods) {
  if (food.unit?.type === 'mass') return `per ${num(Number(food.unit.grams), 1)} g`;
  const grams = unitGrams(food, foods);
  const head = isComposite(food) ? `whole ${pieceName(food)}` : `per ${pieceName(food)}`;
  return grams ? `${head} · ${num(grams, 0)} g` : head;
}

/** "150 g", "2 × egg", "50% of dish" */
export function amountLabel(food, amount) {
  if (!amount) return '';
  const v = num(Number(amount.value), 2);
  if (amount.type === 'grams') return `${v} g`;
  if (amount.type === 'percent') return `${v}% of ${food ? pieceName(food) : 'unit'}`;
  return `${v} × ${food ? pieceName(food) : 'unit'}`;
}

/** The suffix shown next to an amount input for a given amount type. */
export function amountSuffix(food, type) {
  if (type === 'grams') return 'g';
  if (type === 'percent') return '%';
  return `× ${pieceName(food)}`;
}
