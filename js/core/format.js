// Turning numbers and amounts into text, and typed text back into numbers.

import { KINDS } from './schema.js';
import { toDisplay, isEnergy } from './nutrients.js';
import { LOCALE } from './dates.js';
import { unitGrams, isComposite } from './calc.js';
import { t } from '../i18n.js';

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
  return value.toLocaleString(LOCALE(), { maximumFractionDigits: d });
}

/** A number as it should appear inside an input box (no thousands separators). */
export function inputStr(value, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return String(Number(Number(value).toFixed(decimals)));
}

/** A stored (base unit) value as text in the nutrient's chosen unit. */
export function nutrientNum(nutrient, value) {
  const shown = toDisplay(nutrient, value || 0);
  if (isEnergy(nutrient)) return num(Math.round(shown), 0);
  return num(shown, Math.abs(shown) < 1 && shown !== 0 ? 2 : 1);
}

export const withUnit = (nutrient, value) => `${nutrientNum(nutrient, value)} ${nutrient.unit}`;

/** What one unit of a food is called: "egg", "dish", "meal"... */
export function pieceName(food) {
  return food.unit?.name?.trim() || t(`kind.${food.kind}.piece`);
}

/** "per 100 g", "per egg · 60 g", "whole dish · 450 g" */
export function unitLabel(food, foods) {
  if (food.unit?.type === 'mass') return t('unit.perGrams', { g: num(Number(food.unit.grams), 1) });
  const grams = unitGrams(food, foods);
  const head = isComposite(food) ? t(`kind.${food.kind}.whole`) : t('unit.perPiece', { piece: pieceName(food) });
  return grams ? `${head} · ${num(grams, 0)} g` : head;
}

/** "150 g", "2 × egg", "50% of dish" */
export function amountLabel(food, amount) {
  if (!amount) return '';
  const v = num(Number(amount.value), 2);
  if (amount.type === 'grams') return `${v} g`;
  if (amount.type === 'percent') return t('amount.percentOf', { v, piece: food ? pieceName(food) : t('kind.ingredient.piece') });
  return `${v} × ${food ? pieceName(food) : t('kind.ingredient.piece')}`;
}

/** The suffix shown next to an amount input for a given amount type. */
export function amountSuffix(food, type) {
  if (type === 'grams') return 'g';
  if (type === 'percent') return '%';
  return `× ${pieceName(food)}`;
}
