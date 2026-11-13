// One day: what was eaten and what it adds up to.

import { h, icon, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { KINDS } from '../../core/schema.js';
import { entriesByDate, entryValues, sumValues } from '../../core/calc.js';
import { today, addDays, weekDays, fmt } from '../../core/dates.js';
import { amountLabel } from '../../core/format.js';
import { activeNutrients, summaryCard, macroLine, emptyState, openFoodPicker, openAmountSheet } from '../components.js';

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
  const nutrients = activeNutrients(db);
  const byDate = entriesByDate(db);
  const entries = byDate.get(ui.date) || [];
  const totals = sumValues(entries.map((e) => entryValues(e, db.foods)));
  const t = today();

  const strip = h('div', { class: 'week-strip' }, weekDays(ui.date, db.settings.weekStart).map((d) => h('button', {
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
    summaryCard(totals, nutrients),
    h('section', {},
      h('div', { class: 'section-head' },
        h('h2', {}, 'Eaten'),
        entries.length ? h('span', { class: 'muted' }, `${entries.length} item${entries.length > 1 ? 's' : ''}`) : null),
      entries.length
        ? h('div', { class: 'card list' }, rows)
        : h('div', { class: 'card' }, emptyState('Nothing logged yet', 'Add what you ate and the totals appear above.',
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => logFood(ui.date) }, icon('plus', 16), 'Add food')))));
}
