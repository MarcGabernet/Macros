// One day: what was eaten and what it adds up to.

import { h, icon, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { KINDS } from '../../core/schema.js';
import { entriesByDate, entryValues, sumValues } from '../../core/calc.js';
import { today, addDays, weekDays, fmt } from '../../core/dates.js';
import { isOpenDay, firstOpenDay, lastOpenDay } from '../../core/days.js';
import { amountLabel, num, parseNum, inputStr } from '../../core/format.js';
import { GROUPS } from '../../core/nutrients.js';
import { avatar } from '../picture.js';
import { weighIns, weighInOn, toWeightUnit, fromWeightUnit } from '../../core/weight.js';
import {
  activeNutrients, summaryCard, goalsStrip, nutrientListCard, macroLine, emptyState, openFoodPicker, openAmountSheet, numberField,
} from '../components.js';
import { t } from '../../texts.js';

/**
 * "Current weight" (only when weigh-ins are on in Settings). Shown on today
 * only: a weigh-in can't be logged for past or future days.
 */
function weightCard(db, date) {
  const unit = db.settings.weightUnit || 'kg';
  const own = weighInOn(db, date);
  const earlier = weighIns(db).filter((w) => w.date < date).pop();
  const box = numberField({
    value: own ? inputStr(toWeightUnit(own.kg, unit), 1) : '',
    // Hint: your last weigh-in, else the weight typed in Settings.
    placeholder: (earlier?.kg ?? db.settings.weightKg) > 0 ? inputStr(toWeightUnit(earlier?.kg ?? db.settings.weightKg, unit), 1) : '0',
    suffix: unit, label: t('weight.label'),
  });
  const save = () => {
    const text = box.input.value.trim();
    if (!text) {
      if (own) { store.remove('weights', date); toast(t('weight.removed')); }
      return;
    }
    const value = parseNum(text);
    if (!(value > 0) || value > 1000) { toast(t('weight.invalid')); box.input.value = own ? inputStr(toWeightUnit(own.kg, unit), 1) : ''; return; }
    const kg = Number(fromWeightUnit(value, unit).toFixed(3));
    if (own && Math.abs(own.kg - kg) < 0.0005) return;
    store.put('weights', { id: date, date, kg });
    toast(t('weight.saved'));
  };
  box.input.addEventListener('change', save);
  box.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.input.blur(); });
  const sub = own
    ? t('weight.loggedToday')
    : earlier ? t('weight.last', { value: `${num(toWeightUnit(earlier.kg, unit), 1)} ${unit}`, date: fmt(earlier.date, { day: 'numeric', month: 'short' }) }) : t('weight.prompt');
  return h('div', { class: 'card weight-card' },
    h('div', { class: 'weight-text' }, h('div', { class: 'weight-title' }, t('weight.current')), h('div', { class: 'weight-sub' }, sub)),
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
  const when = date === today() ? t('common.todayLower') : fmt(date, { weekday: 'short', day: 'numeric', month: 'short' });
  openFoodPicker({
    title: t('day.addTo', { when }),
    onPick: (food, picker) => openAmountSheet({
      food, amount: lastAmount.get(food.id)?.amount, confirmLabel: t('common.add'),
      onConfirm: (amount) => {
        picker.close();
        store.put('entries', { date, foodId: food.id, amount });
        toast(t('day.added', { name: food.name }));
      },
    }),
  });
}

function relativeName(date) {
  const tday = today();
  if (date === tday) return t('common.today');
  if (date === addDays(tday, -1)) return t('common.yesterday');
  if (date === addDays(tday, 1)) return t('common.tomorrow');
  return fmt(date, { weekday: 'long' });
}

export function renderDay({ ui, go }) {
  const db = store.db;
  const nutrients = activeNutrients(db, ui.date);
  const byDate = entriesByDate(db);
  const entries = byDate.get(ui.date) || [];
  const totals = sumValues(entries.map((e) => entryValues(e, db.foods)));
  const tday = today();
  const first = firstOpenDay(db);

  const strip = h('div', { class: 'week-strip' }, weekDays(ui.date).map((d) => h('button', {
    type: 'button', class: `strip-day${d === ui.date ? ' on' : ''}${d === tday ? ' is-today' : ''}`, disabled: !isOpenDay(d, first),
    'aria-label': fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }), 'aria-current': d === ui.date ? 'date' : null,
    onClick: () => go({ date: d }),
  },
  h('span', { class: 'strip-name' }, fmt(d, { weekday: 'narrow' })),
  h('span', { class: 'strip-num' }, fmt(d, { day: 'numeric' })),
  h('span', { class: `strip-dot${byDate.has(d) ? ' has' : ''}` }))));

  const rows = entries.map((entry) => {
    const food = db.foods[entry.foodId];
    const edit = () => food && openAmountSheet({
      food, amount: entry.amount, confirmLabel: t('common.save'),
      onConfirm: (amount) => store.put('entries', { ...entry, amount }),
      onDelete: () => { store.remove('entries', entry.id); toast(t('day.removed', { name: food.name })); },
    });
    return h('div', { class: 'row-wrap' },
      h('button', { class: 'row', type: 'button', onClick: edit },
        avatar(food, 40),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, food ? food.name : t('day.unknownFood')),
          h('div', { class: 'row-sub' }, food ? `${amountLabel(food, entry.amount)} · ${KINDS[food.kind].label}` : '')),
        h('div', { class: 'row-side' }, macroLine(entryValues(entry, db.foods), nutrients, { limit: 4 }))),
      food ? null : h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove'), onClick: () => store.remove('entries', entry.id) }, icon('close', 18)));
  });

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h1', {}, relativeName(ui.date)),
        h('div', { class: 'view-sub' }, fmt(ui.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))),
      h('div', { class: 'head-actions' },
        ui.date !== tday ? h('button', { class: 'pill', type: 'button', onClick: () => go({ date: tday }) }, t('common.today')) : null,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('day.previous'), disabled: ui.date <= first, onClick: () => go({ date: addDays(ui.date, -1) }) }, icon('left')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('day.next'), disabled: ui.date >= lastOpenDay(), onClick: () => go({ date: addDays(ui.date, 1) }) }, icon('right')))),
    strip,
    goalsStrip(totals, nutrients, { isToday: ui.date === tday }),
    summaryCard(totals, nutrients),
    // Minerals and vitamins, each in its own section under the macros.
    GROUPS.filter((g) => g.id !== 'macro').map((g) => {
      const list = nutrients.filter((n) => n.group === g.id);
      return list.length ? h('section', {},
        h('div', { class: 'section-head' }, h('h2', {}, g.label)),
        nutrientListCard(totals, list)) : null;
    }),
    (db.settings.weightMode || 'weighins') === 'weighins' && ui.date === tday ? weightCard(db, ui.date) : null,
    h('section', {},
      h('div', { class: 'section-head' },
        h('h2', {}, t('day.eaten')),
        entries.length ? h('span', { class: 'muted' }, t('day.items', { n: entries.length })) : null),
      entries.length
        ? h('div', { class: 'card list' }, rows)
        : h('div', { class: 'card' }, emptyState(t('day.emptyTitle'), t('day.emptyText'),
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => logFood(ui.date) }, icon('plus', 16), t('tab.addFood'))))));
}
