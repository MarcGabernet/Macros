// Settings: a menu of pages. Data (nutrients, goals, body weight),
// Account (Google Drive) and View (theme, daily references).

import { h, icon, openSheet, confirmSheet, add, fill } from '../dom.js';
import { store } from '../../core/store.js';
import { showsReferences } from '../../core/schema.js';
import { GROUPS, toDisplay, fromDisplay, isEnergy } from '../../core/nutrients.js';
import { WEIGHT_UNITS, toWeightUnit, fromWeightUnit, currentWeightKg, weighIns } from '../../core/weight.js';
import { parseNum, inputStr, withUnit, num } from '../../core/format.js';
import { LOCALE, fmt } from '../../core/dates.js';
import { allNutrients, segmented, numberField, field, dot, refText } from '../components.js';
import { sync } from '../../sync/engine.js';
import { redirectUri } from '../../sync/google.js';
import { APP_VERSION } from '../../config.js';
import { THEMES, getTheme, setTheme } from '../theme.js';

/** An on/off switch. */
function toggle(on, onChange, { label, disabled = false } = {}) {
  const el = h('button', {
    type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, disabled,
    onClick: (e) => { e.stopPropagation(); onChange(!on); },
  });
  return el;
}

const setNutrient = (id, patch) => store.put('nutrients', { ...(store.get('nutrients', id) || {}), id, ...patch });

/** Change how a nutrient is shown (unit) and its daily goal (a target or a limit). The list itself is fixed in code. */
function openNutrientEditor(nutrient) {
  const draft = {
    unit: nutrient.unit,
    targetOn: nutrient.target > 0,
    goalType: nutrient.goalType,
    target: nutrient.target ? inputStr(toDisplay(nutrient, nutrient.target), 4) : '',
  };
  const sheet = openSheet({ title: nutrient.depth ? `Of which ${nutrient.name.toLowerCase()}` : nutrient.name });
  const error = h('div', { class: 'form-error', role: 'alert' });
  const shown = () => ({ ...nutrient, unit: draft.unit });
  const refLine = h('div', { class: 'field-hint' });
  const paintRef = () => {
    refLine.textContent = nutrient.reference
      ? `${refText(shown())}${nutrient.refPerKg ? ` (${nutrient.refPerKg} g per kg of your weight)` : ''}`
      : 'No official daily reference for this one';
  };

  const targetBox = numberField({
    value: draft.target, placeholder: nutrient.reference ? inputStr(toDisplay(nutrient, nutrient.reference), 1) : '0', suffix: draft.unit, label: 'Daily target',
    onInput: (t) => { draft.target = t; },
  });

  function changeUnit(unit) {
    // Keep the same target, re-expressed in the new unit.
    const typed = parseNum(draft.target);
    if (typed != null) {
      const base = fromDisplay(shown(), typed);
      draft.unit = unit;
      draft.target = inputStr(toDisplay(shown(), base), 4);
      targetBox.input.value = draft.target;
    } else draft.unit = unit;
    targetBox.setSuffix(unit);
    paintRef();
  }

  function save() {
    let target = null;
    if (draft.targetOn) {
      const typed = parseNum(draft.target);
      const word = draft.goalType === 'limit' ? 'limit' : 'target';
      if (!(typed > 0)) { error.textContent = draft.target.trim() ? `The ${word} must be a number above zero` : `Enter a ${word}, or switch the goal off`; return; }
      target = fromDisplay(shown(), typed);
    }
    setNutrient(nutrient.id, { unit: draft.unit, target, goalType: draft.goalType });
    sheet.close();
  }

  // The goal is optional: a switch turns it on (showing the choice and the box) or off.
  // A target is an amount to reach, a limit one not to go over.
  const ringOrBar = nutrient.group === 'macro' && !nutrient.depth ? 'a progress ring' : 'a progress bar';
  const targetArea = h('div', { class: 'field' });
  const paintTarget = () => {
    error.textContent = '';
    fill(targetArea,
      h('div', { class: 'switch-line' },
        h('div', {},
          h('div', { class: 'switch-text' }, 'Daily goal'),
          h('div', { class: 'switch-sub' }, `With a goal you get ${ringOrBar} on each day`)),
        toggle(draft.targetOn, (on) => {
          draft.targetOn = on;
          paintTarget();
          if (on) targetBox.input.focus();
        }, { label: 'Daily goal' })),
      draft.targetOn
        ? [
          segmented([{ value: 'target', label: 'Target' }, { value: 'limit', label: 'Limit' }], draft.goalType,
            (v) => { draft.goalType = v; paintTarget(); }, { label: 'Kind of goal' }),
          targetBox.el,
          h('div', { class: 'field-hint' }, draft.goalType === 'limit'
            ? 'A limit is met while you stay at or under it'
            : 'A target is met once you reach it'),
        ]
        : null);
  };

  paintRef();
  paintTarget();
  add(sheet.body, h('div', { class: 'form' },
    nutrient.units.length > 1
      ? field('Show in', segmented(nutrient.units.map((u) => ({ value: u, label: u })), draft.unit, changeUnit, { label: 'Unit' }),
        isEnergy(nutrient) ? '1 kcal = 4.184 kJ. Everything already logged converts' : 'Everything already logged converts')
      : null,
    targetArea,
    showsReferences(store.db.settings) ? field('Daily reference', refLine) : null));
  sheet.foot.append(error, h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: save }, 'Save'));
}

function nutrientsSection(db) {
  const nutrients = allNutrients(db);
  return GROUPS.map((g) => {
    const list = nutrients.filter((n) => n.group === g.id);
    if (!list.length) return null;
    return h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, g.label)),
      h('div', { class: 'card list' }, list.map((n) => {
        const parentOff = Boolean(n.depth && !n.enabled && n.selfEnabled);
        const goal = n.target > 0 ? `${n.goalType === 'limit' ? 'Limit' : 'Target'} ${withUnit(n, n.target)}` : 'No goal';
        const side = [goal, refText(n)].filter(Boolean).join(' · ');
        return h('div', { class: `row-wrap${n.depth ? ' sub-row' : ''}${n.enabled ? '' : ' off'}` },
          h('button', { class: 'row', type: 'button', onClick: () => openNutrientEditor(n) },
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, n.depth ? `of which ${n.name.toLowerCase()}` : [dot(n), n.name]),
              h('div', { class: 'row-sub' }, parentOff ? `Hidden with ${nutrients.find((p) => p.id === n.parent).name.toLowerCase()}` : side))),
          h('div', { class: 'row-switch' },
            toggle(n.selfEnabled, (on) => setNutrient(n.id, { enabled: on }), { label: `Show ${n.name}`, disabled: parentOff })));
      })),
      g.id === 'macro' ? h('p', { class: 'section-note' }, 'Switch a nutrient off to hide it everywhere. Values you already typed are kept') : null);
  });
}

function referencesSection(db) {
  return h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, 'Daily references')),
    h('div', { class: 'card pad form' },
      h('div', { class: 'switch-line' },
        h('div', {},
          h('div', { class: 'switch-text' }, 'Show daily intake references'),
          h('div', { class: 'switch-sub' }, 'The "Ref" values are the EU reference intakes for an average adult (Regulation (EU) No 1169/2011, Annex XIII). Fibre comes from EFSA, and protein from EFSA’s 0.83 g per kg of body weight')),
        toggle(showsReferences(db.settings), (on) => store.setSettings({ showReferences: on }), { label: 'Show daily intake references' }))));
}

function weightSection(db) {
  const unit = db.settings.weightUnit || 'kg';
  const mode = db.settings.weightMode || 'weighins';
  const kg = currentWeightKg(db);
  const last = weighIns(db).pop();

  let body;
  if (mode === 'manual') {
    const box = numberField({
      value: kg ? inputStr(toWeightUnit(kg, unit), 1) : '', placeholder: 'not set', suffix: unit, label: 'Your weight',
    });
    box.input.addEventListener('change', () => {
      const v = parseNum(box.input.value);
      if (box.input.value.trim() === '') { store.setSettings({ weightKg: null }); return; }
      if (!(v > 0) || v > 1000) { box.input.value = kg ? inputStr(toWeightUnit(kg, unit), 1) : ''; return; }
      store.setSettings({ weightKg: Number(fromWeightUnit(v, unit).toFixed(3)) });
    });
    box.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.input.blur(); });
    body = field('Your weight', box.el, 'Used for references that depend on body weight, like protein');
  } else {
    body = h('div', { class: 'field' },
      h('div', { class: 'field-label' }, 'Your weight'),
      h('div', { class: 'weight-readout' }, kg ? `${num(toWeightUnit(kg, unit), 1)} ${unit}` : 'No weigh-ins yet'),
      h('div', { class: 'field-hint' }, last ? `Latest weigh-in, ${fmt(last.date, { day: 'numeric', month: 'long' })}. Log new ones on the Day screen` : 'Log your weight on the Day screen'));
  }

  return h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, 'Body weight')),
    h('div', { class: 'card pad form' },
      h('div', { class: 'switch-line' },
        h('div', {}, h('div', { class: 'switch-text' }, 'Daily weigh-ins'), h('div', { class: 'switch-sub' }, 'Log your weight on the Day screen. For comparable numbers, weigh yourself at the same time of day each time, ideally in the morning before eating')),
        toggle(mode === 'weighins', (on) => {
          // Switching to manual starts from your latest weigh-in, so nothing jumps.
          store.setSettings(on ? { weightMode: 'weighins' } : { weightMode: 'manual', weightKg: db.settings.weightKg || kg || null });
        }, { label: 'Daily weigh-ins' })),
      body,
      field('Unit', segmented(WEIGHT_UNITS.map((u) => ({ value: u, label: u })), unit, (u) => store.setSettings({ weightUnit: u }), { label: 'Weight unit' }))));
}

function syncCard() {
  const s = sync.status();
  if (!s.configured) {
    return h('div', { class: 'card pad' },
      h('div', { class: 'status-line' }, icon('cloud', 18), h('strong', {}, 'Not set up yet')),
      h('p', { class: 'card-text' }, 'Your data is saved on this device only. To keep it in your Google Drive and share it between devices, a Google client ID has to be added to the app once. The steps are in README.md'),
      h('p', { class: 'card-text muted' }, `Address to authorise in Google Cloud: ${redirectUri()}`));
  }
  if (!s.enabled) {
    return h('div', { class: 'card pad' },
      h('div', { class: 'status-line' }, icon('cloud', 18), h('strong', {}, 'Not connected')),
      h('p', { class: 'card-text' }, 'Keep your data in a hidden app folder of your Google Drive, and use it from any device'),
      s.message ? h('p', { class: 'card-text form-error' }, s.message) : null,
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sync.connect() }, 'Connect Google Drive'));
  }
  if (s.state === 'choose') {
    const c = s.choice;
    return h('div', { class: 'card pad' },
      h('div', { class: 'status-line' }, icon('alert', 18), h('strong', {}, 'Which data do you want to keep?')),
      h('p', { class: 'card-text' }, 'Your Google Drive already has Macros data, and this device has its own. Choose one: the other is replaced'),
      h('p', { class: 'card-text muted' }, `Drive: ${c.drive}`),
      h('p', { class: 'card-text muted' }, `This device: ${c.local}`),
      h('div', { class: 'btn-row wrap' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sync.choose('drive') }, 'Keep Drive'),
        h('button', { class: 'btn', type: 'button', onClick: () => sync.choose('local') }, 'Keep this device')));
  }
  const when = s.lastSync ? new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(s.lastSync) : 'never';
  const label = {
    idle: s.pending ? 'Changes waiting to upload' : 'Up to date',
    syncing: 'Syncing…',
    'needs-auth': s.message || 'Sign-in needed',
    offline: 'Offline. Will sync when the connection is back',
    error: s.message || 'Sync failed',
  }[s.state];
  return h('div', { class: 'card pad' },
    h('div', { class: 'status-line' }, icon(s.state === 'error' || s.state === 'needs-auth' ? 'alert' : 'cloud', 18), h('strong', {}, label)),
    h('p', { class: 'card-text muted' }, [s.email, `Last synced: ${when}`].filter(Boolean).join(' · ')),
    store.saveFailed ? h('p', { class: 'card-text form-error' }, 'The last change could not be saved on this device') : null,
    h('div', { class: 'btn-row wrap' },
      s.state === 'needs-auth'
        ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sync.connect() }, 'Reconnect')
        : h('button', { class: 'btn', type: 'button', disabled: s.state === 'syncing', onClick: () => sync.syncNow() }, 'Sync now'),
      h('button', {
        class: 'btn', type: 'button',
        onClick: async () => {
          const ok = await confirmSheet({
            title: 'Disconnect Google Drive?', confirmLabel: 'Disconnect',
            message: 'This device stops syncing. Your data stays here and the copy in Drive stays there',
          });
          if (ok) sync.disconnect();
        },
      }, 'Disconnect')));
}

function themeSection() {
  return h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, 'Theme')),
    segmented(THEMES, getTheme(), (t) => setTheme(t), { label: 'Theme' }),
    h('p', { class: 'section-note' }, 'Saved on this device only'));
}

// Settings is a menu of pages; each page holds its own options.
const PAGES = [
  {
    id: 'data', title: 'Data', icon: 'foods',
    render: (db) => [nutrientsSection(db), weightSection(db)],
  },
  {
    id: 'account', title: 'Account', icon: 'cloud',
    render: () => [h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Google Drive')), syncCard())],
  },
  {
    id: 'view', title: 'View', icon: 'eye',
    render: (db) => [themeSection(), referencesSection(db)],
  },
];

export function renderSettings({ ui, go }) {
  const db = store.db;
  const page = PAGES.find((p) => p.id === ui.settingsPage);

  if (page) {
    return h('div', { class: 'view' },
      h('header', { class: 'view-head sub-head' },
        h('div', {},
          h('button', { class: 'back-link', type: 'button', onClick: () => go({ settingsPage: null }) }, icon('left', 18), 'Settings'),
          h('h1', {}, page.title))),
      page.render(db));
  }

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {}, h('h1', {}, 'Settings'))),
    h('div', { class: 'card list' }, PAGES.map((p) => h('div', { class: 'row-wrap' },
      h('button', { class: 'row', type: 'button', onClick: () => go({ settingsPage: p.id }) },
        h('span', { class: 'menu-icon' }, icon(p.icon, 20)),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.title)),
        h('span', { class: 'chevron' }, icon('right', 18)))))),
    h('p', { class: 'footnote' }, `Macros ${APP_VERSION}`));
}
