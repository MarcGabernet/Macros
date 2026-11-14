// Settings: a menu of pages. Data (nutrients, goals, body weight),
// Account (Google Drive) and View (theme, daily references).

import { h, icon, openSheet, confirmSheet, add, fill } from '../dom.js';
import { store } from '../../core/store.js';
import { showsReferences } from '../../core/schema.js';
import { GROUPS, toDisplay, fromDisplay, isEnergy, ofWhich, ofWhichTitle } from '../../core/nutrients.js';
import { WEIGHT_UNITS, toWeightUnit, fromWeightUnit, currentWeightKg, weighIns } from '../../core/weight.js';
import { parseNum, inputStr, withUnit, num } from '../../core/format.js';
import { LOCALE, fmt } from '../../core/dates.js';
import { allNutrients, segmented, numberField, field, dot, refText } from '../components.js';
import { sync } from '../../sync/engine.js';
import { redirectUri } from '../../sync/google.js';
import { APP_VERSION } from '../../config.js';
import { THEMES, getTheme, setTheme } from '../theme.js';
import { t, LANGUAGES, getLanguage, setLanguage } from '../../texts.js';

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
  const sheet = openSheet({ title: nutrient.depth ? ofWhichTitle(nutrient) : nutrient.name });
  const error = h('div', { class: 'form-error', role: 'alert' });
  const shown = () => ({ ...nutrient, unit: draft.unit });
  const refLine = h('div', { class: 'field-hint' });
  const paintRef = () => {
    refLine.textContent = nutrient.reference
      ? `${refText(shown())}${nutrient.refPerKg ? ` (${t('settings.perKg', { g: nutrient.refPerKg })})` : ''}`
      : t('settings.noReference');
  };

  const targetBox = numberField({
    value: draft.target, placeholder: nutrient.reference ? inputStr(toDisplay(nutrient, nutrient.reference), 1) : '0', suffix: draft.unit, label: t('settings.dailyGoal'),
    onInput: (text) => { draft.target = text; },
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
      if (!(typed > 0)) { error.textContent = t(draft.target.trim() ? `settings.${draft.goalType}AboveZero` : `settings.${draft.goalType}Enter`); return; }
      target = fromDisplay(shown(), typed);
    }
    setNutrient(nutrient.id, { unit: draft.unit, target, goalType: draft.goalType });
    sheet.close();
  }

  // The goal is optional: a switch turns it on (showing the choice and the box) or off.
  // A target is an amount to reach, a limit one not to go over.
  const goalHint = t(nutrient.group === 'macro' && !nutrient.depth ? 'settings.goalHintRing' : 'settings.goalHintBar');
  const targetArea = h('div', { class: 'field' });
  const paintTarget = () => {
    error.textContent = '';
    fill(targetArea,
      h('div', { class: 'switch-line' },
        h('div', {},
          h('div', { class: 'switch-text' }, t('settings.dailyGoal')),
          h('div', { class: 'switch-sub' }, goalHint)),
        toggle(draft.targetOn, (on) => {
          draft.targetOn = on;
          paintTarget();
          if (on) targetBox.input.focus();
        }, { label: t('settings.dailyGoal') })),
      draft.targetOn
        ? [
          segmented([{ value: 'target', label: t('settings.target') }, { value: 'limit', label: t('settings.limit') }], draft.goalType,
            (v) => { draft.goalType = v; paintTarget(); }, { label: t('settings.goalKind') }),
          targetBox.el,
          h('div', { class: 'field-hint' }, draft.goalType === 'limit'
            ? t('settings.limitHint')
            : t('settings.targetHint')),
        ]
        : null);
  };

  paintRef();
  paintTarget();
  add(sheet.body, h('div', { class: 'form' },
    nutrient.units.length > 1
      ? field(t('settings.showIn'), segmented(nutrient.units.map((u) => ({ value: u, label: u })), draft.unit, changeUnit, { label: t('editor.unit') }),
        t(isEnergy(nutrient) ? 'settings.convertsEnergy' : 'settings.converts'))
      : null,
    targetArea,
    showsReferences(store.db.settings) ? field(t('settings.dailyReference'), refLine) : null));
  sheet.foot.append(error, h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: save }, t('common.save')));
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
        const goal = n.target > 0 ? t(n.goalType === 'limit' ? 'settings.limitValue' : 'settings.targetValue', { value: withUnit(n, n.target) }) : t('settings.noGoal');
        const side = [goal, refText(n)].filter(Boolean).join(' · ');
        return h('div', { class: `row-wrap${n.depth ? ' sub-row' : ''}${n.enabled ? '' : ' off'}` },
          h('button', { class: 'row', type: 'button', onClick: () => openNutrientEditor(n) },
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, n.depth ? ofWhich(n) : [dot(n), n.name]),
              h('div', { class: 'row-sub' }, parentOff ? t('settings.hiddenWith', { name: nutrients.find((p) => p.id === n.parent).name.toLowerCase() }) : side))),
          h('div', { class: 'row-switch' },
            toggle(n.selfEnabled, (on) => setNutrient(n.id, { enabled: on }), { label: t('settings.showNutrient', { name: n.name }), disabled: parentOff })));
      })),
      g.id === 'macro' ? h('p', { class: 'section-note' }, t('settings.switchOffNote')) : null);
  });
}

function referencesSection(db) {
  return h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, t('settings.references'))),
    h('div', { class: 'card pad form' },
      h('div', { class: 'switch-line' },
        h('div', {},
          h('div', { class: 'switch-text' }, t('settings.showReferences')),
          h('div', { class: 'switch-sub' }, t('settings.referencesSource'))),
        toggle(showsReferences(db.settings), (on) => store.setSettings({ showReferences: on }), { label: t('settings.showReferences') }))));
}

function weightSection(db) {
  const unit = db.settings.weightUnit || 'kg';
  const mode = db.settings.weightMode || 'weighins';
  const kg = currentWeightKg(db);
  const last = weighIns(db).pop();

  let body;
  if (mode === 'manual') {
    const box = numberField({
      value: kg ? inputStr(toWeightUnit(kg, unit), 1) : '', placeholder: t('settings.notSet'), suffix: unit, label: t('settings.yourWeight'),
    });
    box.input.addEventListener('change', () => {
      const v = parseNum(box.input.value);
      if (box.input.value.trim() === '') { store.setSettings({ weightKg: null }); return; }
      if (!(v > 0) || v > 1000) { box.input.value = kg ? inputStr(toWeightUnit(kg, unit), 1) : ''; return; }
      store.setSettings({ weightKg: Number(fromWeightUnit(v, unit).toFixed(3)) });
    });
    box.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.input.blur(); });
    body = field(t('settings.yourWeight'), box.el, t('settings.weightUse'));
  } else {
    body = h('div', { class: 'field' },
      h('div', { class: 'field-label' }, t('settings.yourWeight')),
      h('div', { class: 'weight-readout' }, kg ? `${num(toWeightUnit(kg, unit), 1)} ${unit}` : t('settings.noWeighIns')),
      h('div', { class: 'field-hint' }, last ? t('settings.latestWeighIn', { date: fmt(last.date, { day: 'numeric', month: 'long' }) }) : t('settings.logOnDay')));
  }

  return h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, t('settings.bodyWeight'))),
    h('div', { class: 'card pad form' },
      h('div', { class: 'switch-line' },
        h('div', {}, h('div', { class: 'switch-text' }, t('settings.weighIns')), h('div', { class: 'switch-sub' }, t('settings.weighInsHint'))),
        toggle(mode === 'weighins', (on) => {
          // Switching to manual starts from your latest weigh-in, so nothing jumps.
          store.setSettings(on ? { weightMode: 'weighins' } : { weightMode: 'manual', weightKg: db.settings.weightKg || kg || null });
        }, { label: t('settings.weighIns') })),
      body,
      field(t('editor.unit'), segmented(WEIGHT_UNITS.map((u) => ({ value: u, label: u })), unit, (u) => store.setSettings({ weightUnit: u }), { label: t('settings.weightUnit') }))));
}

function syncCard() {
  const s = sync.status();
  if (!s.configured) {
    return h('div', { class: 'card pad' },
      h('div', { class: 'status-line' }, icon('cloud', 18), h('strong', {}, t('sync.notSetUp'))),
      h('p', { class: 'card-text' }, t('sync.notSetUpText')),
      h('p', { class: 'card-text muted' }, t('sync.address', { url: redirectUri() })));
  }
  if (!s.enabled) {
    return h('div', { class: 'card pad' },
      h('div', { class: 'status-line' }, icon('cloud', 18), h('strong', {}, t('sync.notConnected'))),
      h('p', { class: 'card-text' }, t('sync.notConnectedText')),
      s.message ? h('p', { class: 'card-text form-error' }, s.message) : null,
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sync.connect() }, t('sync.connect')));
  }
  if (s.state === 'choose') {
    const c = s.choice;
    return h('div', { class: 'card pad' },
      h('div', { class: 'status-line' }, icon('alert', 18), h('strong', {}, t('sync.whichData'))),
      h('p', { class: 'card-text' }, t('sync.whichDataText')),
      h('p', { class: 'card-text muted' }, t('sync.driveHas', { summary: c.drive })),
      h('p', { class: 'card-text muted' }, t('sync.deviceHas', { summary: c.local })),
      h('div', { class: 'btn-row wrap' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sync.choose('drive') }, t('sync.keepDrive')),
        h('button', { class: 'btn', type: 'button', onClick: () => sync.choose('local') }, t('sync.keepDevice'))));
  }
  const when = s.lastSync ? new Intl.DateTimeFormat(LOCALE(), { dateStyle: 'medium', timeStyle: 'short' }).format(s.lastSync) : t('sync.never');
  const label = {
    idle: s.pending ? t('sync.pending') : t('sync.upToDate'),
    syncing: t('sync.syncing'),
    'needs-auth': s.message || t('sync.signInNeeded'),
    offline: t('sync.offline'),
    error: s.message || t('sync.failed'),
  }[s.state];
  return h('div', { class: 'card pad' },
    h('div', { class: 'status-line' }, icon(s.state === 'error' || s.state === 'needs-auth' ? 'alert' : 'cloud', 18), h('strong', {}, label)),
    h('p', { class: 'card-text muted' }, [s.email, t('sync.lastSynced', { when })].filter(Boolean).join(' · ')),
    store.saveFailed ? h('p', { class: 'card-text form-error' }, t('sync.saveFailed')) : null,
    h('div', { class: 'btn-row wrap' },
      s.state === 'needs-auth'
        ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sync.connect() }, t('banner.reconnect'))
        : h('button', { class: 'btn', type: 'button', disabled: s.state === 'syncing', onClick: () => sync.syncNow() }, t('sync.syncNow')),
      h('button', {
        class: 'btn', type: 'button',
        onClick: async () => {
          const ok = await confirmSheet({
            title: t('sync.disconnectTitle'), confirmLabel: t('sync.disconnect'),
            message: t('sync.disconnectText'),
          });
          if (ok) sync.disconnect();
        },
      }, t('sync.disconnect'))));
}

function themeSection() {
  return h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, t('settings.theme'))),
    segmented(THEMES, getTheme(), (theme) => setTheme(theme), { label: t('settings.theme') }),
    h('p', { class: 'section-note' }, t('settings.thisDeviceOnly')));
}

function languageSection() {
  return h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, t('settings.language'))),
    segmented(LANGUAGES, getLanguage(), (lang) => setLanguage(lang), { label: t('settings.language') }),
    h('p', { class: 'section-note' }, t('settings.thisDeviceOnly')));
}

// Settings is a menu of pages; each page holds its own options.
const PAGES = [
  {
    id: 'data', title: () => t('settings.data'), icon: 'foods',
    render: (db) => [nutrientsSection(db), weightSection(db)],
  },
  {
    id: 'account', title: () => t('settings.account'), icon: 'cloud',
    render: () => [h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, t('sync.googleDrive'))), syncCard())],
  },
  {
    id: 'view', title: () => t('settings.view'), icon: 'eye',
    render: (db) => [languageSection(), themeSection(), referencesSection(db)],
  },
];

export function renderSettings({ ui, go }) {
  const db = store.db;
  const page = PAGES.find((p) => p.id === ui.settingsPage);

  if (page) {
    return h('div', { class: 'view' },
      h('header', { class: 'view-head sub-head' },
        h('div', {},
          h('button', { class: 'back-link', type: 'button', onClick: () => go({ settingsPage: null }) }, icon('left', 18), t('tab.settings')),
          h('h1', {}, page.title()))),
      page.render(db));
  }

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {}, h('h1', {}, t('tab.settings')))),
    h('div', { class: 'card list' }, PAGES.map((p) => h('div', { class: 'row-wrap' },
      h('button', { class: 'row', type: 'button', onClick: () => go({ settingsPage: p.id }) },
        h('span', { class: 'menu-icon' }, icon(p.icon, 20)),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.title())),
        h('span', { class: 'chevron' }, icon('right', 18)))))),
    h('p', { class: 'footnote' }, `Macros ${APP_VERSION}`));
}
