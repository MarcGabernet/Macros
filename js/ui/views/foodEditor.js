// Create or edit a food (ingredient, dish or meal).
//
// A food either has its values typed in directly, or is built from components
// (other foods). Which kinds of food may be components is set in schema.js.

import { h, icon, openSheet, confirmSheet, toast, fill } from '../dom.js';
import { store } from '../../core/store.js';
import { KINDS, allowedComponentKinds, canBeComposite } from '../../core/schema.js';
import {
  perUnit, unitGrams, valuesFor, scale, canBePercent, toPercent, fromPercent, foodIssues,
} from '../../core/calc.js';
import { parseNum, inputStr, num, amountLabel, withUnit } from '../../core/format.js';
import { GROUPS, toDisplay, fromDisplay, isEnergy } from '../../core/nutrients.js';
import {
  activeNutrients, segmented, numberField, field, macroLine, dot, openFoodPicker, openAmountSheet,
} from '../components.js';

const listKinds = (kinds) => kinds.map((k) => KINDS[k].label.toLowerCase()).join(' or ');

/**
 * `food`: an existing food to edit. Otherwise a new one of `kind`, optionally
 * pre-filled from `initial` (e.g. a scanned product: { name, unit, values, barcode, sourceNote }).
 */
export function openFoodEditor({ food, kind, initialName = '', initial = null, onSaved } = {}) {
  const k = food?.kind || initial?.kind || kind;
  // Where the form's starting values come from: the food being edited, or the pre-fill.
  const src = food || (initial ? { source: 'direct', ...initial } : null);
  const kindLabel = KINDS[k].label.toLowerCase();
  const partKinds = allowedComponentKinds(k);
  const composable = canBeComposite(k);
  const nutrients = activeNutrients();

  // What is being edited. Numbers stay as typed text until saving.
  const draft = {
    name: src?.name ?? initialName,
    source: src ? src.source : (composable ? 'components' : 'direct'),
    unitType: src?.unit?.type ?? (composable ? 'piece' : 'mass'),
    massGrams: src?.unit?.type === 'mass' ? inputStr(src.unit.grams) : '100',
    pieceName: src?.unit?.name ?? '',
    pieceGrams: src?.unit?.type === 'piece' ? inputStr(src.unit.grams) : '',
    mode: src?.inputMode ?? 'amount', // 'amount' | 'percent': how values are typed
    barcode: src?.barcode ?? '',
    inputs: {},
    components: (src?.components ?? []).map((c) => ({ foodId: c.foodId, amount: { ...c.amount } })),
  };

  /** Grams in one unit while typing values directly, or null. */
  const directGrams = () => {
    const g = parseNum(draft.unitType === 'mass' ? draft.massGrams : draft.pieceGrams);
    return g > 0 ? g : null;
  };
  const usesPercent = (n) => draft.mode === 'percent' && canBePercent(n);

  // Fill the value boxes from the stored (per unit) values.
  {
    const grams = directGrams();
    if (draft.mode === 'percent' && !grams) draft.mode = 'amount';
    for (const n of nutrients) {
      const v = src?.source === 'direct' ? src.values?.[n.id] : null;
      draft.inputs[n.id] = v == null ? '' : inputStr(usesPercent(n) ? toPercent(v, grams) : toDisplay(n, v), isEnergy(n) ? 1 : 4);
    }
  }

  /** The values per unit, as currently typed. */
  function typedValues() {
    const grams = directGrams();
    const values = {};
    for (const n of nutrients) {
      const typed = parseNum(draft.inputs[n.id]);
      if (typed == null) continue;
      // Typed in the nutrient's chosen unit (or %); stored in its base unit.
      const value = usesPercent(n) ? (grams ? fromPercent(typed, grams) : 0) : fromDisplay(n, typed);
      // Drop floating-point dust (3.5000000000000004) without losing tiny µg amounts (2.5 µg = 0.0000025 g).
      values[n.id] = Number(value.toPrecision(12));
    }
    return values;
  }

  /** The food record the draft describes. */
  function build() {
    const base = { ...(food || {}), kind: k, name: draft.name.trim(), source: draft.source };
    // A product barcode, so scanning it again finds this food (ingredients only).
    const code = k === 'ingredient' ? draft.barcode.replace(/\D/g, '') : '';
    if (code) base.barcode = code; else delete base.barcode;
    if (draft.source === 'components') {
      return {
        ...base,
        unit: { type: 'piece', name: draft.pieceName.trim(), grams: parseNum(draft.pieceGrams) > 0 ? parseNum(draft.pieceGrams) : null },
        components: draft.components.map((c) => ({ foodId: c.foodId, amount: { ...c.amount } })),
        values: {}, inputMode: 'amount',
      };
    }
    const unit = draft.unitType === 'mass'
      ? { type: 'mass', grams: parseNum(draft.massGrams) }
      : { type: 'piece', name: draft.pieceName.trim(), grams: directGrams() };
    // Keep the values of nutrients that aren't shown here (switched off in Settings,
    // or unknown to this version of the app) so they aren't lost; a cleared box removes its value.
    const shown = new Set(nutrients.map((n) => n.id));
    const kept = Object.fromEntries(Object.entries(src?.source === 'direct' ? src.values || {} : {}).filter(([id]) => !shown.has(id)));
    return { ...base, unit, values: { ...kept, ...typedValues() }, inputMode: draft.mode, components: [] };
  }

  function validate() {
    if (!draft.name.trim()) return 'Give it a name';
    if (draft.source === 'components') {
      if (!draft.components.length) return `Add at least one ${listKinds(partKinds)}`;
      return null;
    }
    if (draft.unitType === 'mass' && !(parseNum(draft.massGrams) > 0)) return 'Enter the weight the values are for';
    if (draft.mode === 'percent' && !directGrams()) return 'Percentages need the weight of one unit';
    for (const n of nutrients) {
      const text = draft.inputs[n.id].trim();
      if (text && (parseNum(text) == null || parseNum(text) < 0)) return `${n.name} isn't a valid number`;
    }
    // "Of which" can't be more than the whole (labels round, hence the small margin).
    const values = typedValues();
    for (const n of nutrients.filter((x) => x.parent)) {
      const parent = nutrients.find((p) => p.id === n.parent);
      if ((values[n.id] ?? 0) > (values[parent.id] ?? 0) + 0.05) {
        return `${n.name} (${withUnit(n, values[n.id])}) can't be more than ${parent.name.toLowerCase()} (${withUnit(parent, values[parent.id] ?? 0)})`;
      }
    }
    return null;
  }

  const sheet = openSheet({ title: food ? `Edit ${kindLabel}` : `New ${kindLabel}` });
  const barcodeInput = h('input', {
    class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'none',
    'aria-label': 'Barcode', value: draft.barcode,
    onInput: () => { draft.barcode = barcodeInput.value; },
  });
  sheet.el.classList.add('sheet-tall');
  const error = h('div', { class: 'form-error', role: 'alert' });
  const form = h('div', { class: 'form' });
  sheet.body.append(form);

  const nameInput = h('input', {
    class: 'input', type: 'text', placeholder: k === 'ingredient' ? 'e.g. Egg' : k === 'dish' ? 'e.g. Tomato pasta' : 'e.g. Usual breakfast',
    autocomplete: 'off', autocapitalize: 'sentences', 'aria-label': 'Name', value: draft.name,
    onInput: () => { draft.name = nameInput.value; },
  });

  // ---- sections (rebuilt when the structure changes, not on every keystroke)

  function unitSection() {
    const weightBox = numberField({
      value: draft.massGrams, suffix: 'g', label: 'Weight the values are for',
      onInput: (t) => { draft.massGrams = t; refreshDirect(); },
    });
    const nameBox = h('input', {
      class: 'input', type: 'text', placeholder: k === 'ingredient' ? 'e.g. egg, slice, can' : 'e.g. portion, bowl',
      autocomplete: 'off', autocapitalize: 'none', 'aria-label': 'Name of one unit', value: draft.pieceName,
      onInput: () => { draft.pieceName = nameBox.value; refreshDirect(); },
    });
    const pieceWeightBox = numberField({
      value: draft.pieceGrams, placeholder: 'optional', suffix: 'g', label: 'Weight of one unit',
      onInput: (t) => { draft.pieceGrams = t; refreshDirect(); },
    });
    return h('section', { class: 'form-section' },
      h('h3', {}, 'One unit is'),
      segmented([{ value: 'mass', label: 'A weight' }, { value: 'piece', label: 'One piece' }], draft.unitType,
        (v) => { draft.unitType = v; if (!directGrams()) switchMode('amount', false); render(); }, { label: 'Unit' }),
      draft.unitType === 'mass'
        ? field('Values below are for', weightBox.el)
        : [
          field('What one piece is called', nameBox),
          field('Weight of one piece', pieceWeightBox.el, 'Optional. With a weight you can also log it in grams and type values as %'),
        ]);
  }

  let refreshDirect = () => {};

  function switchMode(mode, convert = true) {
    if (mode === draft.mode) return;
    const grams = directGrams();
    if (convert && grams) {
      for (const n of nutrients) {
        if (!canBePercent(n)) continue;
        const typed = parseNum(draft.inputs[n.id]);
        if (typed == null) continue;
        draft.inputs[n.id] = inputStr(mode === 'percent'
          ? toPercent(fromDisplay(n, typed), grams)
          : toDisplay(n, fromPercent(typed, grams)), 4);
      }
    }
    draft.mode = mode;
  }

  function valuesSection() {
    const heading = h('h3', {});
    const modeSeg = segmented(
      [{ value: 'amount', label: 'Amounts' }, { value: 'percent', label: '% of unit' }], draft.mode,
      (v) => { switchMode(v); render(); }, { small: true, label: 'Type values as' });
    const percentBtn = modeSeg.querySelector('[data-value="percent"]');
    const hint = h('div', { class: 'field-hint' });

    refreshDirect = () => {
      const grams = directGrams();
      heading.textContent = draft.unitType === 'mass'
        ? `Nutrition in ${grams ? `${num(grams, 1)} g` : 'one unit'}`
        : `Nutrition in one ${draft.pieceName.trim() || 'piece'}`;
      percentBtn.disabled = !grams && draft.mode !== 'percent';
      hint.textContent = draft.mode === 'percent'
        ? (grams ? `Percent of the unit's ${num(grams, 1)} g. Calories stay as an amount` : 'Set the weight of one unit to use percentages')
        : (!grams ? 'Give the unit a weight to type values as percentages' : '');
    };

    const row = (n) => {
      const box = numberField({
        value: draft.inputs[n.id], suffix: usesPercent(n) ? '%' : n.unit, label: n.name,
        onInput: (t) => { draft.inputs[n.id] = t; },
      });
      return n.depth
        ? h('div', { class: 'value-row sub' }, h('div', { class: 'value-name' }, `of which ${n.name.toLowerCase()}`), box.el)
        : h('div', { class: 'value-row' }, h('div', { class: 'value-name' }, dot(n), n.name), box.el);
    };
    // Grouped like the Day screen: macros, then minerals, then vitamins.
    const rows = GROUPS.map((g) => {
      const list = nutrients.filter((n) => n.group === g.id);
      if (!list.length) return null;
      return [g.id === 'macro' ? null : h('div', { class: 'value-group' }, g.label), list.map(row)];
    });
    const section = h('section', { class: 'form-section' },
      h('div', { class: 'section-head' }, heading, modeSeg), rows, hint);
    refreshDirect();
    return section;
  }

  function componentsSection() {
    const db = store.db;
    const record = build();
    const totals = perUnit(record, db.foods);
    const autoGrams = unitGrams({ ...record, unit: { ...record.unit, grams: null } }, db.foods);
    const grams = unitGrams(record, db.foods);
    const issues = foodIssues(record, db.foods);

    const rows = draft.components.map((c, i) => {
      const part = db.foods[c.foodId];
      const edit = () => part && openAmountSheet({
        food: part, amount: c.amount, confirmLabel: 'Save',
        onConfirm: (amount) => { c.amount = amount; render(); },
      });
      return h('div', { class: 'row-wrap' },
        h('button', { class: 'row', type: 'button', onClick: edit },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, part ? part.name : 'Missing food'),
            h('div', { class: 'row-sub' }, part ? `${amountLabel(part, c.amount)}${part.deleted ? ' · deleted from your foods' : ''}` : 'This food was removed')),
          h('div', { class: 'row-side' }, part ? macroLine(valuesFor(part, c.amount, db.foods), nutrients, { limit: 4 }) : null)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove ${part?.name || 'part'}`, onClick: () => { draft.components.splice(i, 1); render(); } }, icon('close', 18)));
    });

    const weightBox = numberField({
      value: draft.pieceGrams, placeholder: autoGrams ? `${num(autoGrams, 0)} (sum of parts)` : 'optional', suffix: 'g', label: 'Total weight',
      onInput: (t) => { draft.pieceGrams = t; },
    });
    weightBox.input.addEventListener('change', render);

    return [
      h('section', { class: 'form-section' },
        h('h3', {}, 'Made of'),
        rows.length ? h('div', { class: 'list list-inset' }, rows) : h('div', { class: 'field-hint' }, `A ${kindLabel} needs at least one ${listKinds(partKinds)}`),
        h('button', {
          class: 'btn btn-block', type: 'button',
          onClick: () => openFoodPicker({
            title: `Add ${listKinds(partKinds)}`, kinds: partKinds,
            onPick: (part, picker) => openAmountSheet({
              food: part, confirmLabel: 'Add',
              onConfirm: (amount) => { draft.components.push({ foodId: part.id, amount }); picker.close(); render(); },
            }),
          }),
        }, icon('plus', 16), `Add ${listKinds(partKinds)}`),
        issues.length ? h('div', { class: 'notice' }, icon('alert', 16), [...new Set(issues)].join(' ')) : null),
      h('section', { class: 'form-section' },
        h('h3', {}, `The whole ${kindLabel}`),
        h('div', { class: 'totals-box' }, macroLine(totals, nutrients)),
        grams ? h('div', { class: 'totals-box totals-sub' }, h('span', { class: 'muted' }, 'Per 100 g'), macroLine(scale(totals, 100 / grams), nutrients)) : null,
        field('Total weight', weightBox.el, 'Optional: the finished weight if it differs from the sum of its parts (e.g. after cooking)')),
    ];
  }

  function render() {
    error.textContent = '';
    fill(form,
      initial?.sourceNote ? h('div', { class: 'notice notice-info' }, icon('alert', 16), initial.sourceNote) : null,
      field('Name', nameInput),
      k === 'ingredient' ? field('Barcode', barcodeInput, 'Optional. Scanning this barcode later finds this ingredient') : null,
      composable
        ? segmented([{ value: 'components', label: `Build from ${partKinds.length > 1 ? 'foods' : 'ingredients'}` }, { value: 'direct', label: 'Type the values' }], draft.source,
          (v) => {
            draft.source = v;
            // A composite is always "one piece"; its weight box means something else.
            if (v === 'components') { draft.unitType = 'piece'; switchMode('amount', false); }
            render();
          }, { label: 'How to define it' })
        : null,
      ...(draft.source === 'components' ? componentsSection() : [unitSection(), valuesSection()]),
      food ? h('button', { class: 'btn btn-danger-ghost btn-block', type: 'button', onClick: remove }, icon('trash', 16), `Delete ${kindLabel}`) : null);
  }

  async function remove() {
    const usedIn = store.all('foods').filter((f) => f.components?.some((c) => c.foodId === food.id));
    const note = usedIn.length ? `. It is part of ${usedIn.length} other food${usedIn.length > 1 ? 's' : ''}, which keep counting it` : '';
    const ok = await confirmSheet({
      title: `Delete ${food.name}?`,
      message: `It disappears from your foods. Days already logged with it keep their numbers${note}`,
    });
    if (!ok) return;
    store.remove('foods', food.id);
    sheet.close();
    toast(`${food.name} deleted`);
  }

  function save() {
    const problem = validate();
    if (problem) {
      error.textContent = problem;
      return;
    }
    const saved = store.put('foods', build());
    sheet.close();
    onSaved?.(saved);
  }

  sheet.foot.append(error, h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: save }, food ? 'Save' : `Create ${kindLabel}`));
  render();
  if (!food) nameInput.focus();
  return sheet;
}
