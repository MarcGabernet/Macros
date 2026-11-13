// The library: every ingredient, dish and meal you have defined.

import { h, icon } from '../dom.js';
import { store } from '../../core/store.js';
import { KINDS, KIND_ORDER } from '../../core/schema.js';
import { activeNutrients, segmented, foodRow, emptyState } from '../components.js';
import { openFoodEditor } from './foodEditor.js';

export function renderFoods({ ui, go }) {
  const db = store.db;
  const nutrients = activeNutrients(db);
  const kind = KINDS[ui.foodKind];
  const label = kind.label.toLowerCase();
  const all = store.all('foods').filter((f) => f.kind === ui.foodKind);
  const list = h('div', {});

  function renderList() {
    const q = ui.foodQuery.trim().toLowerCase();
    const foods = all.filter((f) => !q || f.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren(foods.length
      ? h('div', { class: 'card list' }, foods.map((f) => foodRow(f, db, nutrients, { onClick: () => openFoodEditor({ food: f }) })))
      : h('div', { class: 'card' }, all.length
        ? emptyState('Nothing matches', 'Try another name.')
        : emptyState(`No ${kind.plural.toLowerCase()} yet`, kind.hint,
          h('button', { class: 'btn btn-primary', type: 'button', onClick: create }, icon('plus', 16), `New ${label}`))));
  }

  function create() {
    openFoodEditor({ kind: ui.foodKind });
  }

  // Typing in the search box updates only the list, so the keyboard stays open.
  const search = h('input', {
    class: 'input search-input', type: 'search', placeholder: `Search ${kind.plural.toLowerCase()}`, autocomplete: 'off',
    'aria-label': `Search ${kind.plural.toLowerCase()}`, value: ui.foodQuery,
    onInput: () => { ui.foodQuery = search.value; renderList(); },
  });

  renderList();
  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {}, h('h1', {}, 'Foods'), h('div', { class: 'view-sub' }, kind.hint)),
      all.length ? h('div', { class: 'head-actions' },
        h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: create }, icon('plus', 16), `New ${label}`)) : null),
    segmented(KIND_ORDER.map((k) => ({ value: k, label: KINDS[k].plural })), ui.foodKind,
      (v) => go({ foodKind: v, foodQuery: '' }), { label: 'Kind of food' }),
    all.length > 5 ? h('div', { class: 'search-wrap' }, icon('search', 18), search) : null,
    list);
}
