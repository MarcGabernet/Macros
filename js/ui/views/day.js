// One day: what was eaten and what it adds up to.

import { h, icon, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { KINDS } from '../../core/schema.js';
import { entriesByDate, entryValues, sumValues } from '../../core/calc.js';
import { today, addDays, weekDays, fmt } from '../../core/dates.js';
import { amountLabel, num, parseNum, inputStr } from '../../core/format.js';
import { GROUPS } from '../../core/nutrients.js';
import { weighIns, weighInOn, toWeightUnit, fromWeightUnit } from '../../core/weight.js';
import {
  activeNutrients, summaryCard, goalsStrip, nutrientListCard, macroLine, emptyState, openFoodPicker, openAmountSheet, numberField,
} from '../components.js';

/**
 * "Current weight" for a day (only when weigh-ins are on in Settings).
 * Today or earlier only: a weigh-in can't be logged for the future.
 */
function weightCard(db, date) {
  const unit = db.settings.weightUnit || 'kg';
  const own = weighInOn(db, date);
  const earlier = weighIns(db).filter((w) => w.date < date).pop();
  const box = numberField({
    value: own ? inputStr(toWeightUnit(own.kg, unit), 1) : '',
    placeholder: earlier ? inputStr(toWeightUnit(earlier.kg, unit), 1) : '0',
    suffix: unit, label: 'Weight',
  });
  const save = () => {
    const text = box.input.value.trim();
    if (!text) {
      if (own) { store.remove('weights', date); toast('Weigh-in removed'); }
      return;
    }
    const value = parseNum(text);
    if (!(value > 0) || value > 1000) { toast('That weight isn’t valid'); box.input.value = own ? inputStr(toWeightUnit(own.kg, unit), 1) : ''; return; }
    const kg = Number(fromWeightUnit(value, unit).toFixed(3));
    if (own && Math.abs(own.kg - kg) < 0.0005) return;
    store.put('weights', { id: date, date, kg });
    toast('Weight saved');
  };
  box.input.addEventListener('change', save);
  box.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.input.blur(); });
  const sub = own
    ? 'Logged for this day'
    : earlier ? `Last: ${num(toWeightUnit(earlier.kg, unit), 1)} ${unit} on ${fmt(earlier.date, { day: 'numeric', month: 'short' })}` : 'Weighed yourself? Add it here';
  return h('div', { class: 'card weight-card' },
    h('div', { class: 'weight-text' }, h('div', { class: 'weight-title' }, 'Current weight'), h('div', { class: 'weight-sub' }, sub)),
    box.el);
}

/** Pick a food and an amount, then log it on `date`. */
export function logFood(date) {
  const lastAmount = new Map();
  for (const e of Object.values(store.db.entries)) {
    if (e.deleted) continue;
    const seen = lastAmount.get(e.foodId);
    if (!seen || (e.createdAt || 0) > seen.at) lastAmount.set(e.foodId, { at: e.createdAt || 0, amount: e.amount });
  }
  const when = date === today() ? 'today' : fmt(date, { weekday: 'short', day: 'numeric', month: 'short' });
  openFoodPicker({
    title: `Add to ${when}`,
    onPick: (food, picker) => openAmountSheet({
      food, amount: lastAmount.get(food.id)?.amount, confirmLabel: 'Add',
      onConfirm: (amount) => {
        picker.close();
        store.put('entries', { date, foodId: food.id, amount });
        toast(`${food.name} added`);
      },
    }),
  });
}

function relativeName(date) {
  const t = today();
  if (date === t) return 'Today';
  if (date === addDays(t, -1)) return 'Yesterday';
  if (date === addDays(t, 1)) return 'Tomorrow';
  return fmt(date, { weekday: 'long' });
}

export function renderDay({ ui, go }) {
  const db = store.db;
  const nutrients = activeNutrients(db, ui.date);
  const byDate = entriesByDate(db);
  const entries = byDate.get(ui.date) || [];
  const totals = sumValues(entries.map((e) => entryValues(e, db.foods)));
  const t = today();

  const strip = h('div', { class: 'week-strip' }, weekDays(ui.date, 1).map((d) => h('button', {
    type: 'button', class: `strip-day${d === ui.date ? ' on' : ''}${d === t ? ' is-today' : ''}`,
    'aria-label': fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }), 'aria-current': d === ui.date ? 'date' : null,
    onClick: () => go({ date: d }),
  },
  h('span', { class: 'strip-name' }, fmt(d, { weekday: 'narrow' })),
  h('span', { class: 'strip-num' }, fmt(d, { day: 'numeric' })),
  h('span', { class: `strip-dot${byDate.has(d) ? ' has' : ''}` }))));

  const rows = entries.map((entry) => {
    const food = db.foods[entry.foodId];
    const edit = () => food && openAmountSheet({
      food, amount: entry.amount, confirmLabel: 'Save',
      onConfirm: (amount) => store.put('entries', { ...entry, amount }),
      onDelete: () => { store.remove('entries', entry.id); toast(`${food.name} removed`); },
    });
    return h('div', { class: 'row-wrap' },
      h('button', { class: 'row', type: 'button', onClick: edit },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, food ? food.name : 'Unknown food'),
          h('div', { class: 'row-sub' }, food ? `${amountLabel(food, entry.amount)} · ${KINDS[food.kind].label}` : '')),
        h('div', { class: 'row-side' }, macroLine(entryValues(entry, db.foods), nutrients, { limit: 4 }))),
      food ? null : h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', onClick: () => store.remove('entries', entry.id) }, icon('close', 18)));
  });

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h1', {}, relativeName(ui.date)),
        h('div', { class: 'view-sub' }, fmt(ui.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))),
      h('div', { class: 'head-actions' },
        ui.date !== t ? h('button', { class: 'pill', type: 'button', onClick: () => go({ date: t }) }, 'Today') : null,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous day', onClick: () => go({ date: addDays(ui.date, -1) }) }, icon('left')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next day', onClick: () => go({ date: addDays(ui.date, 1) }) }, icon('right')))),
    strip,
    goalsStrip(totals, nutrients, { isToday: ui.date === t }),
    summaryCard(totals, nutrients),
    // Minerals and vitamins, each in its own section under the macros.
    GROUPS.filter((g) => g.id !== 'macro').map((g) => {
      const list = nutrients.filter((n) => n.group === g.id);
      return list.length ? h('section', {},
        h('div', { class: 'section-head' }, h('h2', {}, g.label)),
        nutrientListCard(totals, list)) : null;
    }),
    (db.settings.weightMode || 'weighins') === 'weighins' && ui.date <= t ? weightCard(db, ui.date) : null,
    h('section', {},
      h('div', { class: 'section-head' },
        h('h2', {}, 'Eaten'),
        entries.length ? h('span', { class: 'muted' }, `${entries.length} item${entries.length > 1 ? 's' : ''}`) : null),
      entries.length
        ? h('div', { class: 'card list' }, rows)
        : h('div', { class: 'card' }, emptyState('Nothing logged yet', 'Add what you ate and the totals appear above',
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => logFood(ui.date) }, icon('plus', 16), 'Add food')))));
}
