// The shape of the data. Everything the app tracks is described here as data,
// so adding a new nutrient, kind of food or way of measuring is a table edit.

import { t } from '../i18n.js';

// RULE: saved data must keep working in every future version.
// - Never rename or reuse a stored key (nutrient ids, collections, settings, fields).
// - Only add fields, and give them a default for data that doesn't have them.
// - Stored units never change (kcal, grams, kg); only how they're shown does.
// - If the shape really has to change, bump SCHEMA_VERSION and convert old data
//   in normalizeDb() below.
export const SCHEMA_VERSION = 1;

// Collections of records keyed by id. Every record carries `updatedAt`, and a
// deleted one stays as a tombstone (`deleted: true`) so devices can merge.
// `weights` holds weigh-ins, one per day, keyed by date (YYYY-MM-DD).
export const COLLECTIONS = ['nutrients', 'foods', 'entries', 'weights'];

// "Food" is the general word: an ingredient, a dish and a meal are all foods.
// They differ only in what they may be composed of. Because a dish can hold
// ingredients only, and a meal can hold ingredients and dishes but never meals,
// composition can never loop back on itself.
// Their names and sentences live in i18n.js under `kind.<id>.*`.
const kind = (id, components) => ({
  id, components,
  get label() { return t(`kind.${id}`); },
  get plural() { return t(`kind.${id}.plural`); },
  get hint() { return t(`kind.${id}.hint`); },
});
export const KINDS = {
  ingredient: kind('ingredient', []),
  dish: kind('dish', ['ingredient']),
  meal: kind('meal', ['ingredient', 'dish']),
};
export const KIND_ORDER = ['ingredient', 'dish', 'meal'];

export const allowedComponentKinds = (kind) => KINDS[kind]?.components ?? [];
export const canBeComposite = (kind) => allowedComponentKinds(kind).length > 0;

// Ways to say "how much" of a food: used for what you eat and for recipe parts.
export const AMOUNT_TYPES = ['grams', 'units', 'percent'];

export const DEFAULT_SETTINGS = {
  weekStart: 1,           // no longer used: weeks always start on Monday (kept so older data still reads)
  weightUnit: 'kg',       // 'kg' | 'lb'
  weightMode: 'weighins', // 'weighins' (logged on the Day screen) | 'manual' (typed in Settings)
  weightKg: null,         // the weight typed in Settings, in kg
  showReferences: true,   // show the daily intake references ("Ref") everywhere
  updatedAt: 0,
};

export function emptyDb() {
  // `nutrients` holds only your settings per nutrient ({ unit, target, enabled });
  // the nutrients themselves are defined in nutrients.js.
  return { schema: SCHEMA_VERSION, nutrients: {}, foods: {}, entries: {}, weights: {}, settings: { ...DEFAULT_SETTINGS } };
}

/** Whether the daily intake references are shown (Settings switch, on by default). */
export const showsReferences = (settings) => settings.showReferences ?? !settings.hideReferences;

// Bring any stored or downloaded document up to the current shape.
export function normalizeDb(raw) {
  const db = emptyDb();
  if (!raw || typeof raw !== 'object') return db;
  for (const c of COLLECTIONS) {
    if (raw[c] && typeof raw[c] === 'object') {
      for (const [id, rec] of Object.entries(raw[c])) {
        if (rec && typeof rec === 'object') db[c][id] = { ...rec, id };
      }
    }
  }
  if (raw.settings && typeof raw.settings === 'object') db.settings = { ...DEFAULT_SETTINGS, ...raw.settings };
  return db;
}
