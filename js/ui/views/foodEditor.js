// Create or edit a food (a product, or a meal built from products).
//
// A product has its values typed in; a meal is built from products (see schema.js).

import { h, icon, openSheet, confirmSheet, toast, fill } from '../dom.js';
import { store } from '../../core/store.js';
import { allowedComponentKinds, canBeDirect } from '../../core/schema.js';
import {
  perUnit, unitGrams, valuesFor, scale, canBePercent, toPercent, fromPercent, foodIssues,
} from '../../core/calc.js';
import { parseNum, inputStr, num, amountLabel, withUnit } from '../../core/format.js';
import { GROUPS, toDisplay, fromDisplay, isEnergy, ofWhich } from '../../core/nutrients.js';
import { pictureField, photoFromUrl } from '../picture.js';
import {
  activeNutrients, segmented, numberField, field, macroLine, dot, openFoodPicker, openAmountSheet,
} from '../components.js';
import { t } from '../../texts.js';


/**
 * `food`: an existing food to edit. Otherwise a new one of `kind`, optionally
 * pre-filled from `initial` (e.g. a scanned product: { name, unit, values, barcode, imageUrl, sourceNote }).
 */
export function openFoodEditor({ food, kind, initialName = '', initial = null, onSaved } = {}) {
  const k = food?.kind || initial?.kind || kind;
  // Where the form's starting values come from: the food being edited, or the pre-fill.
  const src = food || (initial ? { source: 'direct', ...initial } : null);
  const partKinds = allowedComponentKinds(k);
  const built = !canBeDirect(k); // meals are built from products; products are typed
  const nutrients = activeNutrients();

  // What is being edited. Numbers stay as typed text until saving.
  const draft = {
    name: src?.name ?? initialName,
    // Reference weight: the values are for this many grams (empty: for one unit).
    refGrams: src ? (src.unit?.type === 'mass' ? inputStr(src.unit.grams) : '') : (built ? '' : '100'),
    // Weight of one unit of this food (optional); for a built food, its total weight.
    unitG: src?.unit?.type === 'mass' ? inputStr(src.unit.pieceGrams) : inputStr(src?.unit?.grams),
    mode: src?.inputMode ?? 'amount', // 'amount' | 'percent': how values are typed
    barcode: src?.barcode ?? '',
    image: src?.image ?? null, // { kind: 'photo', data } | { kind: 'emoji', value } | null
    inputs: {},
    components: (src?.components ?? []).map((c) => ({ foodId: c.foodId, amount: { ...c.amount } })),
  };

  const positive = (text) => { const g = parseNum(text); return g > 0 ? g : null; };
  /** The grams the typed values are for: the reference weight, else one unit's weight, else null. */
  const directGrams = () => positive(draft.refGrams) ?? positive(draft.unitG);
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
    const base = { ...(food || {}), kind: k, name: draft.name.trim(), source: built ? 'components' : 'direct' };
    // A barcode, so scanning it again finds this food (products only).
    const code = k === 'ingredient' ? draft.barcode.replace(/\D/g, '') : '';
    if (code) base.barcode = code; else delete base.barcode;
    if (draft.image) base.image = draft.image; else delete base.image;
    if (built) {
      return {
        ...base,
        unit: { type: 'piece', grams: positive(draft.unitG) },
        components: draft.components.map((c) => ({ foodId: c.foodId, amount: { ...c.amount } })),
        values: {}, inputMode: 'amount',
      };
    }
    // With a reference weight the values are per that weight ('mass'); without
    // one they are per unit ('piece'). The unit weight is optional either way.
    const unit = positive(draft.refGrams)
      ? { type: 'mass', grams: positive(draft.refGrams), pieceGrams: positive(draft.unitG) }
      : { type: 'piece', grams: positive(draft.unitG) };
    // Keep the values of nutrients that aren't shown here (switched off in Settings,
    // or unknown to this version of the app) so they aren't lost; a cleared box removes its value.
    const shown = new Set(nutrients.map((n) => n.id));
    const kept = Object.fromEntries(Object.entries(src?.source === 'direct' ? src.values || {} : {}).filter(([id]) => !shown.has(id)));
    return { ...base, unit, values: { ...kept, ...typedValues() }, inputMode: draft.mode, components: [] };
  }

  function validate() {
    const name = draft.name.trim();
    if (!name) return t('editor.needName');
    // Names are unique among all foods, and a barcode belongs to one product only.
    const others = store.all('foods').filter((f) => f.id !== food?.id);
    const sameName = others.find((f) => f.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (sameName) return t('editor.nameTaken', { name: sameName.name });
    const code = k === 'ingredient' ? draft.barcode.replace(/\D/g, '') : '';
    const sameCode = code && others.find((f) => f.barcode && f.barcode.replace(/\D/g, '') === code);
    if (sameCode) return t('editor.barcodeTaken', { name: sameCode.name });
    if (built) return draft.components.length ? null : t('kind.meal.needsParts');
    if (draft.refGrams.trim() && !positive(draft.refGrams)) return t('editor.badRefWeight');
    if (draft.unitG.trim() && !positive(draft.unitG)) return t('editor.badUnitWeight');
    if (draft.mode === 'percent' && !directGrams()) return t('editor.percentNeedsWeight');
    for (const n of nutrients) {
      const text = draft.inputs[n.id].trim();
      if (text && (parseNum(text) == null || parseNum(text) < 0)) return t('editor.invalidNumber', { name: n.name });
    }
    // "Of which" can't be more than the whole (labels round, hence the small margin).
    const values = typedValues();
    for (const n of nutrients.filter((x) => x.parent)) {
      const parent = nutrients.find((p) => p.id === n.parent);
      if ((values[n.id] ?? 0) > (values[parent.id] ?? 0) + 0.05) {
        return t('editor.subTooBig', { name: n.name, value: withUnit(n, values[n.id]), parent: parent.name.toLowerCase(), parentValue: withUnit(parent, values[parent.id] ?? 0) });
      }
    }
    return null;
  }

  const sheet = openSheet({ title: t(food ? `kind.${k}.edit` : `kind.${k}.new`) });
  const picture = pictureField({
    get: () => draft.image,
    onChange: (image) => { draft.image = image; },
    getName: () => draft.name,
  });
  // A scanned product: use its photo from Open Food Facts, unless one is already set.
  if (initial?.imageUrl && !draft.image) {
    picture.setNote(t('editor.gettingPhoto'));
    photoFromUrl(initial.imageUrl).then((image) => {
      if (image && !draft.image) { draft.image = image; picture.setNote(t('editor.photoFromOff')); } else picture.setNote('');
      picture.paint();
    });
  }
  const barcodeInput = h('input', {
    class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: t('common.none'),
    'aria-label': t('editor.barcode'), value: draft.barcode,
    onInput: () => { draft.barcode = barcodeInput.value; },
  });
  sheet.el.classList.add('sheet-tall');
  const error = h('div', { class: 'form-error', role: 'alert' });
  const form = h('div', { class: 'form' });
  sheet.body.append(form);

  const nameInput = h('input', {
    class: 'input', type: 'text', placeholder: t(`kind.${k}.example`),
    autocomplete: 'off', autocapitalize: 'sentences', 'aria-label': t('editor.name'), value: draft.name,
    onInput: () => { draft.name = nameInput.value; if (!draft.image) picture.paint(); refreshDirect(); },
  });

  // ---- sections (rebuilt when the structure changes, not on every keystroke)

  const nameForUnit = () => draft.name.trim() || t(`kind.${k}.this`);

  function unitSection() {
    const refBox = numberField({
      value: draft.refGrams, placeholder: t('common.optional'), suffix: 'g', label: t('editor.refWeight'),
      onInput: (text) => { draft.refGrams = text; refreshDirect(); },
    });
    const unitBox = numberField({
      value: draft.unitG, placeholder: t('common.optional'), suffix: 'g', label: t('editor.unitWeightAria'),
      onInput: (text) => { draft.unitG = text; refreshDirect(); },
    });
    const unitLabelEl = h('div', { class: 'field-label' });
    const canLog = h('div', { class: 'field-hint can-log' });
    paintUnit = () => {
      unitLabelEl.textContent = t('editor.unitWeight', { name: nameForUnit() });
      const ref = positive(draft.refGrams);
      const unit = positive(draft.unitG);
      canLog.textContent = t(ref ? (unit ? 'editor.logBoth' : 'editor.logGrams') : (unit ? 'editor.logBoth' : 'editor.logUnits'), { name: nameForUnit() });
    };
    paintUnit();
    return h('section', { class: 'form-section' },
      h('h3', {}, t('editor.weights')),
      field(t('editor.refWeight'), refBox.el, t('editor.refWeightHint')),
      h('div', { class: 'field' }, unitLabelEl, unitBox.el, h('div', { class: 'field-hint' }, t('editor.unitWeightHint'))),
      canLog);
  }

  let paintUnit = () => {};
  let refreshDirect = () => {};

  function switchMode(mode) {
    if (mode === draft.mode) return;
    const grams = directGrams();
    if (grams) {
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
      [{ value: 'amount', label: t('editor.amounts') }, { value: 'percent', label: t('editor.percentOfUnit') }], draft.mode,
      (v) => { switchMode(v); render(); }, { small: true, label: t('editor.typeValuesAs') });
    const percentBtn = modeSeg.querySelector('[data-value="percent"]');
    const hint = h('div', { class: 'field-hint' });

    refreshDirect = () => {
      paintUnit();
      const grams = directGrams();
      const ref = positive(draft.refGrams);
      heading.textContent = ref
        ? t('editor.nutritionInGrams', { g: num(ref, 1) })
        : t('editor.nutritionInPiece', { piece: nameForUnit() });
      percentBtn.disabled = !grams && draft.mode !== 'percent';
      hint.textContent = draft.mode === 'percent'
        ? (grams ? t('editor.percentHint', { g: num(grams, 1) }) : t('editor.percentNeedsWeightHint'))
        : (!grams ? t('editor.giveWeightHint') : '');
    };

    const row = (n) => {
      const box = numberField({
        value: draft.inputs[n.id], suffix: usesPercent(n) ? '%' : n.unit, label: n.name,
        onInput: (text) => { draft.inputs[n.id] = text; },
      });
      return n.depth
        ? h('div', { class: 'value-row sub' }, h('div', { class: 'value-name' }, ofWhich(n)), box.el)
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
        food: part, amount: c.amount, confirmLabel: t('common.save'),
        onConfirm: (amount) => { c.amount = amount; render(); },
      });
      return h('div', { class: 'row-wrap' },
        h('button', { class: 'row', type: 'button', onClick: edit },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, part ? part.name : t('editor.missingFood')),
            h('div', { class: 'row-sub' }, part ? `${amountLabel(part, c.amount)}${part.deleted ? ` · ${t('editor.deletedFromFoods')}` : ''}` : t('editor.foodRemoved'))),
          h('div', { class: 'row-side' }, part ? macroLine(valuesFor(part, c.amount, db.foods), nutrients, { limit: 4 }) : null)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('editor.removePart', { name: part?.name || '' }), onClick: () => { draft.components.splice(i, 1); render(); } }, icon('close', 18)));
    });

    const weightBox = numberField({
      value: draft.unitG, placeholder: autoGrams ? t('editor.sumOfParts', { g: num(autoGrams, 0) }) : t('common.optional'), suffix: 'g', label: t('editor.totalWeight'),
      onInput: (text) => { draft.unitG = text; },
    });
    weightBox.input.addEventListener('change', render);

    return [
      h('section', { class: 'form-section' },
        h('h3', {}, t('editor.madeOf')),
        rows.length ? h('div', { class: 'list list-inset' }, rows) : h('div', { class: 'field-hint' }, t('kind.meal.needsParts')),
        h('button', {
          class: 'btn btn-block', type: 'button',
          onClick: () => openFoodPicker({
            title: t('kind.meal.addParts'), kinds: partKinds,
            onPick: (part, picker) => openAmountSheet({
              food: part, confirmLabel: t('common.add'),
              onConfirm: (amount) => { draft.components.push({ foodId: part.id, amount }); picker.close(); render(); },
            }),
          }),
        }, icon('plus', 16), t('kind.meal.addParts')),
        issues.length ? h('div', { class: 'notice' }, icon('alert', 16), [...new Set(issues)].join(' ')) : null),
      h('section', { class: 'form-section' },
        h('h3', {}, t('kind.meal.theWhole')),
        h('div', { class: 'totals-box' }, macroLine(totals, nutrients)),
        grams ? h('div', { class: 'totals-box totals-sub' }, h('span', { class: 'muted' }, t('editor.per100')), macroLine(scale(totals, 100 / grams), nutrients)) : null,
        field(t('editor.totalWeight'), weightBox.el, t('editor.totalWeightHint'))),
    ];
  }

  function render() {
    error.textContent = '';
    fill(form,
      initial?.sourceNote ? h('div', { class: 'notice notice-info' }, icon('alert', 16), initial.sourceNote) : null,
      field(t('editor.picture'), picture.el),
      field(t('editor.name'), nameInput),
      k === 'ingredient' ? field(t('editor.barcode'), barcodeInput, t('editor.barcodeHint')) : null,
      ...(built ? componentsSection() : [unitSection(), valuesSection()]),
      food ? h('button', { class: 'btn btn-danger-ghost btn-block', type: 'button', onClick: remove }, icon('trash', 16), t(`kind.${k}.delete`)) : null);
  }

  async function remove() {
    const usedIn = store.all('foods').filter((f) => f.components?.some((c) => c.foodId === food.id));
    const note = usedIn.length ? t('editor.deleteUsedIn', { n: usedIn.length }) : '';
    const ok = await confirmSheet({
      title: t('editor.deleteTitle', { name: food.name }),
      message: t('editor.deleteMessage', { note }),
    });
    if (!ok) return;
    store.remove('foods', food.id);
    sheet.close();
    toast(t('editor.deleted', { name: food.name }));
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

  sheet.foot.append(error, h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: save }, food ? t('common.save') : t(`kind.${k}.create`)));
  render();
  if (!food) nameInput.focus();
  return sheet;
}
