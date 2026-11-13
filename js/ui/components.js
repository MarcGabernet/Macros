// Pieces of interface shared by several screens.

import { h, icon, openSheet, add } from './dom.js';
import { store } from '../core/store.js';
import { KINDS, KIND_ORDER } from '../core/schema.js';
import { resolveNutrients, isEnergy } from '../core/nutrients.js';
import { currentWeightKg } from '../core/weight.js';
import {
  perUnit, valuesFor, allowedAmountTypes, defaultAmount, convertAmount, foodIssues, isComposite,
} from '../core/calc.js';
import { nutrientNum, withUnit, unitLabel, amountSuffix, parseNum, inputStr, pieceName } from '../core/format.js';
import { openFoodEditor } from './views/foodEditor.js';

/**
 * Every nutrient, enabled or not, with your unit/target settings and its daily
 * reference (which can depend on your weight as of `date`). Label order; the
 * first one (energy) is the headline. Sub-nutrients ("of which ...") have depth 1.
 */
export function allNutrients(db = store.db, date) {
  const list = resolveNutrients(db.nutrients, { weightKg: currentWeightKg(db, date) });
  // "Hide daily intake references" in Settings: no reference anywhere, as if none existed.
  return db.settings.hideReferences ? list.map((n) => ({ ...n, reference: null })) : list;
}

/** The nutrients switched on in Settings: the only ones shown anywhere else. */
export function activeNutrients(db = store.db, date) {
  return allNutrients(db, date).filter((n) => n.enabled);
}

/** The sub-nutrients ("of which ...") listed under a nutrient. */
export const childrenOf = (nutrient, nutrients) => nutrients.filter((n) => n.parent === nutrient.id);

const colorVar = (nutrient) => `var(--c-${nutrient.color || 'blue'})`;

export function dot(nutrient) {
  return h('span', { class: 'dot', style: { '--c': colorVar(nutrient) } });
}

/** "248 kcal · P 12 · C 30 · F 4": a compact line for list rows (the nutrients marked `line`). */
export function macroLine(values, nutrients, { limit = 6 } = {}) {
  const line = h('span', { class: 'macro-line' });
  nutrients.filter((n) => n.line).sort((a, b) => a.line - b.line).slice(0, limit).forEach((n, i) => {
    const v = values[n.id] || 0;
    const text = isEnergy(n) ? `${nutrientNum(n, v)} ${n.unit}` : `${n.short || n.name} ${nutrientNum(n, v)}`;
    line.append(h('span', { class: i === 0 ? 'macro-main' : 'macro-part' }, text));
  });
  return line;
}

/** A bar showing a value against a goal. The track is a lighter step of the same colour. */
export function meter(value, goal, nutrient, { soft = false } = {}) {
  const ratio = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
  return h('div', {
    class: `meter${soft ? ' meter-soft' : ''}`, role: 'img', style: { '--c': colorVar(nutrient) },
    'aria-label': `${withUnit(nutrient, value)} of ${withUnit(nutrient, goal)}`,
  }, h('div', { class: 'meter-fill', style: { width: `${(ratio * 100).toFixed(1)}%` } }));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

/**
 * A progress ring (like an activity ring): fills clockwise towards the target.
 * Past 100% a darker second lap starts over the first, so "over" stays visible.
 */
export function ring(value, target, nutrient, { size = 56, stroke = 7, center = null } = {}) {
  const ratio = target > 0 ? Math.max(0, value / target) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const arc = (fraction, cls) => svg('circle', {
    class: cls, cx: mid, cy: mid, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round',
    'stroke-dasharray': `${Math.max(0.001, Math.min(1, fraction) * c)} ${c}`,
    transform: `rotate(-90 ${mid} ${mid})`,
  });
  const g = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' },
    svg('circle', { class: 'ring-track', cx: mid, cy: mid, r, fill: 'none', 'stroke-width': stroke }),
    ratio > 0 ? arc(Math.min(ratio, 1), 'ring-fill') : null,
    ratio > 1 ? arc(ratio - 1, 'ring-over') : null);
  return h('div', {
    class: 'ring', role: 'img', style: { '--c': colorVar(nutrient), width: `${size}px`, height: `${size}px` },
    'aria-label': `${withUnit(nutrient, value)} of ${withUnit(nutrient, target)} (${Math.round(ratio * 100)}%)`,
  }, g, center ? h('div', { class: 'ring-center' }, center) : null);
}

/** "Ref 70 g": the fixed daily reference, shown next to targets. */
export const refText = (n, days = 1) => (n.reference ? `Ref ${withUnit(n, n.reference * days)}` : null);

// Two tiles per row (room for the "of which" lines); three or fewer fit on one row.
const tileColumns = (count, hasSubs) => (count <= 3 && !hasSubs ? count : 2);

/**
 * The macros card: energy as the headline (a big ring once it has a target),
 * then a tile per other macro (a small ring once it has a target), with its
 * "of which" lines. Only the 'macro' group; minerals and vitamins have their own cards.
 */
export function summaryCard(values, nutrients, { caption } = {}) {
  const macros = nutrients.filter((n) => n.group === 'macro');
  const main = macros.find((n) => !n.depth);
  if (!main) return null;
  const rest = macros.filter((n) => !n.depth && n !== main);
  const target = main.target > 0 ? main.target : null;
  const value = values[main.id] || 0;
  const left = target != null ? target - value : null;
  const ref = refText(main);
  const label = h('div', { class: 'hero-label' }, dot(main), main.name, caption ? h('span', { class: 'hero-caption' }, ` · ${caption}`) : null);

  const hero = target != null
    ? h('div', { class: 'hero hero-ring' },
      ring(value, target, main, {
        size: 132, stroke: 13,
        center: [h('span', { class: 'ring-value' }, nutrientNum(main, value)), h('span', { class: 'ring-unit' }, main.unit)],
      }),
      h('div', { class: 'hero-side' },
        label,
        h('div', { class: 'hero-goal' }, `of ${withUnit(main, target)}`),
        h('div', { class: 'hero-note' }, left >= 0 ? `${withUnit(main, left)} left` : `${withUnit(main, -left)} over`),
        ref ? h('div', { class: 'hero-ref' }, ref) : null))
    : h('div', { class: 'hero' },
      label,
      h('div', { class: 'hero-figure' },
        h('span', { class: 'hero-value' }, nutrientNum(main, value)),
        h('span', { class: 'hero-unit' }, main.unit)),
      ref ? h('div', { class: 'hero-ref' }, ref) : null);

  return h('section', { class: 'card summary' },
    hero,
    rest.length ? h('div', { class: 'tiles', style: { gridTemplateColumns: `repeat(${tileColumns(rest.length, macros.some((x) => x.depth))}, minmax(0, 1fr))` } }, rest.map((n, i) => {
      const t = n.target > 0 ? n.target : null;
      const v = values[n.id] || 0;
      const r = refText(n);
      // A last tile left alone on its row takes the full width.
      const alone = i === rest.length - 1 && rest.length % 2 === 1 && rest.length > 3;
      return h('div', { class: 'tile', style: alone ? { gridColumn: '1 / -1' } : null },
        h('div', { class: 'tile-label' }, dot(n), n.name),
        h('div', { class: 'tile-main' },
          t != null ? ring(v, t, n, { size: 46, stroke: 6 }) : null,
          h('div', { class: 'tile-figures' },
            h('div', { class: 'tile-value' }, nutrientNum(n, v), h('span', { class: 'tile-unit' }, ` ${n.unit}`)),
            t != null ? h('div', { class: 'tile-note' }, `of ${withUnit(n, t)}`) : null,
            r ? h('div', { class: 'tile-note' }, r) : null)),
        childrenOf(n, macros).map((c) => h('div', { class: 'tile-sub' },
          h('span', { class: 'tile-sub-name' }, c.brief || c.name),
          h('span', { class: 'tile-sub-value' }, withUnit(c, values[c.id] || 0)))));
    })) : null);
}

/**
 * A card for one group (minerals, vitamins): each with its amount, and a bar
 * towards its target, or towards its reference (lighter) when it has no target.
 */
export function nutrientListCard(values, nutrients) {
  return h('div', { class: 'card micro-list' }, nutrients.map((n) => {
    const v = values[n.id] || 0;
    const t = n.target > 0 ? n.target : null;
    const goal = t ?? n.reference;
    return h('div', { class: 'micro-row' },
      h('div', { class: 'micro-head' },
        h('span', { class: 'micro-name' }, dot(n), n.name),
        h('span', { class: 'micro-value' }, withUnit(n, v), t != null ? h('span', { class: 'micro-goal' }, ` / ${withUnit(n, t)}`) : null)),
      goal ? meter(v, goal, n, { soft: t == null }) : null,
      n.reference ? h('div', { class: 'micro-ref' }, `${refText(n)} · ${Math.round((v / n.reference) * 100)}% of it`) : null);
  }));
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
      : [emptyState(query ? 'Nothing matches' : 'Nothing here yet', query ? 'Try another name, or create it below' : 'Create your first one below')]));
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
      ? h('div', { class: 'notice' }, icon('alert', 16), 'Some parts of this food are incomplete, so its numbers may be low')
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
