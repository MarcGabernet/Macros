// Pieces of interface shared by several screens.

import { h, icon, openSheet, add } from './dom.js';
import { store } from '../core/store.js';
import { KINDS, KIND_ORDER, isEnergyUnit } from '../core/schema.js';
import {
  perUnit, valuesFor, allowedAmountTypes, defaultAmount, convertAmount, foodIssues, isComposite,
} from '../core/calc.js';
import { nutrientNum, withUnit, unitLabel, amountSuffix, parseNum, inputStr, pieceName } from '../core/format.js';
import { openFoodEditor } from './views/foodEditor.js';

/** The nutrients in use, in display order. The first one is the headline. */
export function activeNutrients(db = store.db) {
  return Object.values(db.nutrients)
    .filter((n) => !n.deleted)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

const colorVar = (nutrient) => `var(--c-${nutrient.color || 'blue'})`;

export function dot(nutrient) {
  return h('span', { class: 'dot', style: { '--c': colorVar(nutrient) } });
}

/** "248 kcal · P 12 · C 30 · F 4": a compact line for list rows. */
export function macroLine(values, nutrients, { limit = 6 } = {}) {
  const line = h('span', { class: 'macro-line' });
  nutrients.slice(0, limit).forEach((n, i) => {
    const v = values[n.id] || 0;
    const text = isEnergyUnit(n.unit) ? `${nutrientNum(n, v)} ${n.unit}` : `${n.short || n.name} ${nutrientNum(n, v)}`;
    line.append(h('span', { class: i === 0 ? 'macro-main' : 'macro-part' }, text));
  });
  return line;
}

/** A bar showing a value against its target. The track is a lighter step of the same colour. */
export function meter(value, target, nutrient) {
  const ratio = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  return h('div', {
    class: 'meter', role: 'img', style: { '--c': colorVar(nutrient) },
    'aria-label': `${withUnit(nutrient, value)} of ${withUnit(nutrient, target)}`,
  }, h('div', { class: 'meter-fill', style: { width: `${(ratio * 100).toFixed(1)}%` } }));
}

// Rows of 3 tiles, except where that would leave one alone on the last row.
const tileColumns = (count) => (count <= 3 ? count : count % 3 === 1 ? 2 : 3);

/**
 * The summary of a set of values: the first nutrient as a headline number,
 * the rest as tiles. `days` scales the daily targets (1 for a single day).
 */
export function summaryCard(values, nutrients, { days = 1, caption } = {}) {
  const [main, ...rest] = nutrients;
  if (!main) return h('div', { class: 'card empty' }, 'No nutrients to show. Add one in Settings.');
  const target = main.target > 0 ? main.target * days : null;
  const value = values[main.id] || 0;
  const left = target != null ? target - value : null;
  return h('section', { class: 'card summary' },
    h('div', { class: 'hero' },
      h('div', { class: 'hero-label' }, dot(main), main.name, caption ? h('span', { class: 'hero-caption' }, ` · ${caption}`) : null),
      h('div', { class: 'hero-figure' },
        h('span', { class: 'hero-value' }, nutrientNum(main, value)),
        h('span', { class: 'hero-unit' }, target != null ? `/ ${withUnit(main, target)}` : main.unit)),
      target != null ? meter(value, target, main) : null,
      target != null ? h('div', { class: 'hero-note' }, left >= 0 ? `${withUnit(main, left)} left` : `${withUnit(main, -left)} over`) : null),
    rest.length ? h('div', { class: 'tiles', style: { gridTemplateColumns: `repeat(${tileColumns(rest.length)}, minmax(0, 1fr))` } }, rest.map((n) => {
      const t = n.target > 0 ? n.target * days : null;
      const v = values[n.id] || 0;
      return h('div', { class: 'tile' },
        h('div', { class: 'tile-label' }, dot(n), n.name),
        h('div', { class: 'tile-value' }, nutrientNum(n, v), h('span', { class: 'tile-unit' }, ` ${n.unit}`)),
        t != null ? meter(v, t, n) : null,
        t != null ? h('div', { class: 'tile-note' }, `of ${withUnit(n, t)}`) : null);
    })) : null);
}

/** A row of mutually exclusive buttons. Returns the element; it has `.setValue(v)`. */
export function segmented(options, value, onChange, { small = false, label } = {}) {
  const el = h('div', { class: `seg${small ? ' seg-small' : ''}`, role: 'group', 'aria-label': label });
  const buttons = options.map((opt) => {
    const b = h('button', {
      type: 'button', class: 'seg-btn', disabled: !!opt.disabled, title: opt.title,
      onClick: () => { if (el.value !== opt.value) { el.setValue(opt.value); onChange(opt.value); } },
    }, opt.label);
    b.dataset.value = opt.value;
    return b;
  });
  el.setValue = (v) => {
    el.value = v;
    for (const b of buttons) {
      const on = b.dataset.value === String(v);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  el.append(...buttons);
  el.setValue(value);
  return el;
}

/** A text box for a number with a unit shown after it. Returns { el, input, setSuffix }. */
export function numberField({ value = '', placeholder = '0', suffix = '', label, onInput, large = false }) {
  const input = h('input', {
    class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done',
    placeholder, 'aria-label': label, value,
    onInput: () => onInput?.(input.value),
    onFocus: () => input.select(),
  });
  const suffixEl = h('span', { class: 'input-suffix' }, suffix);
  const el = h('label', { class: `input-wrap${large ? ' input-large' : ''}` }, input, suffixEl);
  return { el, input, setSuffix: (s) => { suffixEl.textContent = s; } };
}

export function field(label, control, hint) {
  return h('div', { class: 'field' },
    h('div', { class: 'field-label' }, label),
    control,
    hint ? h('div', { class: 'field-hint' }, hint) : null);
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-title' }, title),
    text ? h('div', { class: 'empty-text' }, text) : null,
    action || null);
}

/** One food in a list: name, what a unit is, and its values per unit. */
export function foodRow(food, db, nutrients, { onClick, showKind = false, trailing } = {}) {
  const values = perUnit(food, db.foods);
  const incomplete = foodIssues(food, db.foods).length > 0;
  const sub = [showKind ? KINDS[food.kind].label : null, unitLabel(food, db.foods)].filter(Boolean).join(' · ');
  return h('div', { class: 'row-wrap' },
    h('button', { class: 'row', type: 'button', onClick },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, food.name, incomplete ? h('span', { class: 'warn-mark', title: 'Some parts are incomplete' }, icon('alert', 14)) : null),
        h('div', { class: 'row-sub' }, sub)),
      h('div', { class: 'row-side' }, macroLine(values, nutrients, { limit: 4 }))),
    trailing || null);
}

// ------------------------------------------------------------------ pickers

/**
 * Choose a food from the library. `kinds` limits what can be chosen (a dish may
 * only take ingredients, for example). `onPick(food, sheet)` decides what next.
 */
export function openFoodPicker({ title = 'Choose a food', kinds = KIND_ORDER, onPick }) {
  const sheet = openSheet({ title });
  sheet.el.classList.add('sheet-tall');
  let query = '';
  let filter = 'all';

  const lastUsed = new Map();
  for (const e of Object.values(store.db.entries)) {
    if (!e.deleted) lastUsed.set(e.foodId, Math.max(lastUsed.get(e.foodId) || 0, e.createdAt || 0));
  }

  const list = h('div', { class: 'list' });
  const search = h('input', {
    class: 'input search-input', type: 'search', placeholder: 'Search', autocomplete: 'off', 'aria-label': 'Search foods',
    onInput: () => { query = search.value.trim().toLowerCase(); renderList(); },
  });

  function renderList() {
    const db = store.db;
    const nutrients = activeNutrients(db);
    const foods = store.all('foods')
      .filter((f) => kinds.includes(f.kind) && (filter === 'all' || f.kind === filter))
      .filter((f) => !query || f.name.toLowerCase().includes(query))
      .sort((a, b) => (lastUsed.get(b.id) || 0) - (lastUsed.get(a.id) || 0) || a.name.localeCompare(b.name));
    list.replaceChildren(...(foods.length
      ? foods.map((f) => foodRow(f, db, nutrients, { showKind: kinds.length > 1 && filter === 'all', onClick: () => onPick(f, sheet) }))
      : [emptyState(query ? 'Nothing matches' : 'Nothing here yet', query ? 'Try another name, or create it below.' : 'Create your first one below.')]));
  }

  add(sheet.body,
    h('div', { class: 'search-wrap' }, icon('search', 18), search),
    kinds.length > 1
      ? segmented([{ value: 'all', label: 'All' }, ...kinds.map((k) => ({ value: k, label: KINDS[k].plural }))], filter,
        (v) => { filter = v; renderList(); }, { small: true, label: 'Kind of food' })
      : null,
    list);
  sheet.foot.append(h('div', { class: 'btn-row wrap' },
    kinds.map((k) => h('button', {
      class: 'btn', type: 'button',
      onClick: () => openFoodEditor({ kind: k, initialName: search.value.trim(), onSaved: (food) => { renderList(); onPick(food, sheet); } }),
    }, icon('plus', 16), `New ${KINDS[k].label.toLowerCase()}`))));
  renderList();
  return sheet;
}

const QUICK = { grams: [50, 100, 150, 200, 250], units: [0.5, 1, 2, 3], percent: [25, 50, 75, 100] };
const TYPE_LABELS = { grams: 'Grams', units: 'Units', percent: 'Percent' };

/**
 * Ask how much of a food. Used for logging and for the parts of a recipe.
 * `onConfirm(amount)` receives { type, value }; `onDelete` adds a delete button.
 */
export function openAmountSheet({ food, amount, title, confirmLabel = 'Add', onConfirm, onDelete }) {
  const db = store.db;
  const nutrients = activeNutrients(db);
  const types = allowedAmountTypes(food, db.foods);
  let current = amount && types.includes(amount.type) ? { ...amount } : defaultAmount(food);
  if (!types.includes(current.type)) current = { type: types[0], value: 1 };

  const sheet = openSheet({ title: title || food.name });
  const preview = h('div', { class: 'amount-preview' });
  const chips = h('div', { class: 'chips' });
  const confirm = h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: submit }, confirmLabel);
  const box = numberField({
    value: inputStr(current.value), suffix: amountSuffix(food, current.type), label: 'Amount', large: true,
    onInput: (text) => { current.value = parseNum(text); refresh(); },
  });
  box.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  const valid = () => Number.isFinite(current.value) && current.value > 0;

  function refresh() {
    confirm.disabled = !valid();
    preview.replaceChildren(valid()
      ? macroLine(valuesFor(food, current, db.foods), nutrients)
      : h('span', { class: 'muted' }, 'Enter an amount'));
  }

  function renderChips() {
    chips.replaceChildren(...QUICK[current.type].map((q) => h('button', {
      class: 'chip', type: 'button',
      onClick: () => { current.value = q; box.input.value = inputStr(q); refresh(); },
    }, current.type === 'grams' ? `${q} g` : current.type === 'percent' ? `${q}%` : q === 0.5 ? '½' : String(q))));
  }

  function setType(type) {
    const converted = valid() ? convertAmount(food, current, type, db.foods) : { type, value: null };
    current = { type, value: converted.value };
    box.input.value = inputStr(current.value);
    box.setSuffix(amountSuffix(food, type));
    renderChips();
    refresh();
  }

  function submit() {
    if (!valid()) return;
    const result = { type: current.type, value: Number(Number(current.value).toFixed(3)) };
    sheet.close();
    onConfirm(result);
  }

  add(sheet.body,
    h('div', { class: 'sheet-sub' }, [KINDS[food.kind].label, unitLabel(food, db.foods)].join(' · ')),
    types.length > 1
      ? segmented(types.map((t) => ({ value: t, label: t === 'units' ? `× ${pieceName(food)}` : TYPE_LABELS[t] })), current.type, setType, { label: 'Measure in' })
      : null,
    box.el, chips, preview,
    isComposite(food) && foodIssues(food, db.foods).length
      ? h('div', { class: 'notice' }, icon('alert', 16), 'Some parts of this food are incomplete, so its numbers may be low.')
      : null);
  sheet.foot.append(onDelete
    ? h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-danger-ghost', type: 'button', 'aria-label': 'Remove', onClick: () => { sheet.close(); onDelete(); } }, icon('trash', 18)),
      confirm)
    : confirm);
  renderChips();
  refresh();
  box.input.focus();
  box.input.select();
  return sheet;
}
