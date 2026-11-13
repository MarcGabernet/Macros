// Settings: the nutrients you track, Drive sync, and backups.

import { h, icon, openSheet, confirmSheet, toast, add } from '../dom.js';
import { store } from '../../core/store.js';
import { SCHEMA_VERSION, normalizeDb } from '../../core/schema.js';
import { toDisplay, fromDisplay, isEnergy } from '../../core/nutrients.js';
import { parseNum, inputStr, withUnit } from '../../core/format.js';
import { today, LOCALE } from '../../core/dates.js';
import { activeNutrients, segmented, numberField, field, dot } from '../components.js';
import { sync } from '../../sync/engine.js';
import { redirectUri } from '../../sync/google.js';
import { APP_VERSION } from '../../config.js';

/** Change how a nutrient is shown (unit) and its daily target. The list itself is fixed in code. */
function openNutrientEditor(nutrient) {
  const draft = { unit: nutrient.unit, target: nutrient.target ? inputStr(toDisplay(nutrient, nutrient.target), 4) : '' };
  const sheet = openSheet({ title: nutrient.depth ? `Of which ${nutrient.name.toLowerCase()}` : nutrient.name });
  const error = h('div', { class: 'form-error', role: 'alert' });
  const shown = () => ({ ...nutrient, unit: draft.unit });

  const targetBox = numberField({
    value: draft.target, placeholder: 'none', suffix: draft.unit, label: 'Daily target',
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
  }

  function save() {
    const typed = draft.target.trim() ? parseNum(draft.target) : null;
    if (draft.target.trim() && !(typed > 0)) { error.textContent = 'The target must be a number above zero, or empty.'; return; }
    store.put('nutrients', {
      ...(store.get('nutrients', nutrient.id) || {}), id: nutrient.id,
      unit: draft.unit, target: typed == null ? null : fromDisplay(shown(), typed),
    });
    sheet.close();
  }

  add(sheet.body, h('div', { class: 'form' },
    nutrient.units.length > 1
      ? field('Show in', segmented(nutrient.units.map((u) => ({ value: u, label: u })), draft.unit, changeUnit, { label: 'Unit' }),
        isEnergy(nutrient) ? '1 kcal = 4.184 kJ. Everything already logged converts.' : 'Everything already logged converts.')
      : null,
    field('Daily target', targetBox.el, 'Optional. With a target you get a progress bar on each day.')));
  sheet.foot.append(error, h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: save }, 'Save'));
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(store.db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `macros-backup-${today()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importBackup() {
  const input = h('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !data.foods || !data.entries) throw new Error('not a backup');
    } catch {
      toast('That file is not a Macros backup.');
      return;
    }
    const foods = Object.values(data.foods).filter((f) => !f.deleted).length;
    const entries = Object.values(data.entries).filter((e) => !e.deleted).length;
    const ok = await confirmSheet({
      title: 'Replace your data?',
      message: `The backup holds ${foods} food${foods === 1 ? '' : 's'} and ${entries} logged item${entries === 1 ? '' : 's'}. Everything on this device is replaced by it. This can't be undone.`,
      confirmLabel: 'Replace',
    });
    if (!ok) return;
    // Stamp everything as changed now, so the backup also wins over the Drive copy.
    const now = Date.now();
    const db = normalizeDb(data);
    for (const c of ['nutrients', 'foods', 'entries']) for (const rec of Object.values(db[c])) rec.updatedAt = now;
    for (const [c, records] of [['nutrients', store.db.nutrients], ['foods', store.db.foods], ['entries', store.db.entries]]) {
      for (const id of Object.keys(records)) if (!db[c][id]) db[c][id] = { ...records[id], deleted: true, updatedAt: now };
    }
    db.settings.updatedAt = now;
    store.replace(db, { local: true });
    toast('Backup restored');
  });
  input.click();
}

function syncCard() {
  const s = sync.status();
  if (!s.configured) {
    return h('div', { class: 'card pad' },
      h('div', { class: 'status-line' }, icon('cloud', 18), h('strong', {}, 'Not set up yet')),
      h('p', { class: 'card-text' }, 'Your data is saved on this device only. To keep it in your Google Drive and share it between devices, a Google client ID has to be added to the app once. The steps are in README.md.'),
      h('p', { class: 'card-text muted' }, `Address to authorise in Google Cloud: ${redirectUri()}`));
  }
  if (!s.enabled) {
    return h('div', { class: 'card pad' },
      h('div', { class: 'status-line' }, icon('cloud', 18), h('strong', {}, 'Not connected')),
      h('p', { class: 'card-text' }, 'Keep your data in a hidden app folder of your Google Drive, and use it from any device.'),
      s.message ? h('p', { class: 'card-text form-error' }, s.message) : null,
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sync.connect() }, 'Connect Google Drive'));
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
    h('div', { class: 'btn-row wrap' },
      s.state === 'needs-auth'
        ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sync.connect() }, 'Reconnect')
        : h('button', { class: 'btn', type: 'button', disabled: s.state === 'syncing', onClick: () => sync.syncNow() }, 'Sync now'),
      h('button', {
        class: 'btn', type: 'button',
        onClick: async () => {
          const ok = await confirmSheet({
            title: 'Disconnect Google Drive?', confirmLabel: 'Disconnect',
            message: 'This device stops syncing. Your data stays here and the copy in Drive stays there.',
          });
          if (ok) sync.disconnect();
        },
      }, 'Disconnect')));
}

export function renderSettings() {
  const db = store.db;
  const nutrients = activeNutrients(db);

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {}, h('h1', {}, 'Settings'))),

    h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'Nutrients')),
      h('div', { class: 'card list' }, nutrients.map((n) => h('div', { class: `row-wrap${n.depth ? ' sub-row' : ''}` },
        h('button', { class: 'row', type: 'button', onClick: () => openNutrientEditor(n) },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, n.depth ? `of which ${n.name.toLowerCase()}` : [dot(n), n.name]),
            h('div', { class: 'row-sub' }, `In ${n.unit}`)),
          h('div', { class: 'row-side' }, h('span', { class: 'macro-line' },
            h('span', { class: n.target > 0 ? 'macro-main' : 'macro-part' }, n.target > 0 ? `${withUnit(n, n.target)} a day` : 'No target'))))))),
      h('p', { class: 'section-note' }, 'Tap one to set a daily target or, where it makes sense, change its unit.')),

    h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'Week starts on')),
      segmented([{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }], String(db.settings.weekStart),
        (v) => store.setSettings({ weekStart: Number(v) }), { label: 'Week starts on' })),

    h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'Google Drive')),
      syncCard()),

    h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'Backup')),
      h('div', { class: 'card pad' },
        h('p', { class: 'card-text' }, 'Save everything to a file, or restore it from one.'),
        store.saveFailed ? h('p', { class: 'card-text form-error' }, 'The last change could not be saved on this device. Export a backup now.') : null,
        h('div', { class: 'btn-row wrap' },
          h('button', { class: 'btn', type: 'button', onClick: exportBackup }, 'Export backup'),
          h('button', { class: 'btn', type: 'button', onClick: importBackup }, 'Import backup')))),

    h('p', { class: 'footnote' }, `Macros ${APP_VERSION} · data format ${SCHEMA_VERSION}`));
}
