// Settings: the nutrients you track, Drive sync, and backups.

import { h, icon, openSheet, confirmSheet, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { NUTRIENT_UNITS, COLOR_SLOTS, SCHEMA_VERSION, normalizeDb } from '../../core/schema.js';
import { parseNum, inputStr, withUnit } from '../../core/format.js';
import { today, LOCALE } from '../../core/dates.js';
import { activeNutrients, segmented, numberField, field, dot } from '../components.js';
import { sync } from '../../sync/engine.js';
import { redirectUri } from '../../sync/google.js';
import { APP_VERSION } from '../../config.js';

function openNutrientEditor(nutrient) {
  const existing = activeNutrients();
  const used = new Set(existing.map((n) => n.color));
  const draft = {
    name: nutrient?.name ?? '',
    short: nutrient?.short ?? '',
    unit: nutrient?.unit ?? 'g',
    color: nutrient?.color ?? (COLOR_SLOTS.find((c) => !used.has(c)) || COLOR_SLOTS[0]),
    target: inputStr(nutrient?.target),
  };
  const sheet = openSheet({ title: nutrient ? 'Edit nutrient' : 'New nutrient' });
  const error = h('div', { class: 'form-error', role: 'alert' });

  const nameInput = h('input', {
    class: 'input', type: 'text', placeholder: 'e.g. Fibre', autocomplete: 'off', 'aria-label': 'Name', value: draft.name,
    onInput: () => { draft.name = nameInput.value; },
  });
  const shortInput = h('input', {
    class: 'input', type: 'text', placeholder: 'e.g. Fib', maxlength: '5', autocomplete: 'off', autocapitalize: 'none',
    'aria-label': 'Short label', value: draft.short,
    onInput: () => { draft.short = shortInput.value; },
  });
  const targetBox = numberField({
    value: draft.target, placeholder: 'none', suffix: draft.unit, label: 'Daily target',
    onInput: (t) => { draft.target = t; },
  });
  const swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Colour' });
  const paintSwatches = () => swatches.replaceChildren(...COLOR_SLOTS.map((c) => h('button', {
    type: 'button', class: `swatch${c === draft.color ? ' on' : ''}`, style: { '--c': `var(--c-${c})` },
    'aria-label': c, 'aria-pressed': String(c === draft.color),
    onClick: () => { draft.color = c; paintSwatches(); },
  })));
  paintSwatches();

  async function remove() {
    const ok = await confirmSheet({
      title: `Delete ${nutrient.name}?`,
      message: 'It stops showing everywhere. The values already typed into your foods are kept, in case you add it back.',
    });
    if (!ok) return;
    store.remove('nutrients', nutrient.id);
    sheet.close();
  }

  function save() {
    const name = draft.name.trim();
    if (!name) { error.textContent = 'Give it a name.'; return; }
    const target = draft.target.trim() ? parseNum(draft.target) : null;
    if (draft.target.trim() && !(target > 0)) { error.textContent = 'The target must be a number above zero, or empty.'; return; }
    store.put('nutrients', {
      ...(nutrient || { order: Math.max(-1, ...existing.map((n) => n.order ?? 0)) + 1 }),
      name, short: draft.short.trim() || name.slice(0, 3), unit: draft.unit, color: draft.color, target,
    });
    sheet.close();
  }

  sheet.body.append(h('div', { class: 'form' },
    field('Name', nameInput),
    field('Measured in', segmented(NUTRIENT_UNITS.map((u) => ({ value: u, label: u })), draft.unit,
      (v) => { draft.unit = v; targetBox.setSuffix(v); }, { label: 'Unit' })),
    field('Short label', shortInput, 'Shown in compact lists, like "P 12".'),
    field('Daily target', targetBox.el, 'Optional. With a target you get a progress bar on each day.'),
    field('Colour', swatches),
    nutrient ? h('button', { class: 'btn btn-danger-ghost btn-block', type: 'button', onClick: remove }, icon('trash', 16), 'Delete nutrient') : null));
  sheet.foot.append(error, h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: save }, nutrient ? 'Save' : 'Add nutrient'));
  if (!nutrient) nameInput.focus();
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
      h('div', { class: 'section-head' },
        h('h2', {}, 'Nutrients'),
        h('button', { class: 'btn btn-small', type: 'button', onClick: () => openNutrientEditor() }, icon('plus', 16), 'Add')),
      h('div', { class: 'card list' }, nutrients.map((n) => h('div', { class: 'row-wrap' },
        h('button', { class: 'row', type: 'button', onClick: () => openNutrientEditor(n) },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, dot(n), n.name),
            h('div', { class: 'row-sub' }, `Measured in ${n.unit}`)),
          h('div', { class: 'row-side' }, h('span', { class: 'macro-line' },
            h('span', { class: n.target > 0 ? 'macro-main' : 'macro-part' }, n.target > 0 ? `${withUnit(n, n.target)} a day` : 'No target'))))))),
      h('p', { class: 'section-note' }, 'These are the values every food carries. Add any others you want to follow, such as fibre, sugar or salt.')),

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
