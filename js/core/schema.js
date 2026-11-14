// The shape of the data. Everything the app tracks is described here as data,
// so adding a new nutrient, kind of food or way of measuring is a table edit.

import { t } from '../texts.js';

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

// "Food" is the general word for what you log. There are two kinds:
// - a product (id 'ingredient', kept from earlier versions): its own typed values;
// - a meal: built only from products, never typed directly.
// A meal can't contain a meal, so composition can never loop back on itself.
// Older versions also had dishes; core/migrate.js turns them into products or meals.
// Names and sentences live in texts.js under `kind.<id>.*`.
const kind = (id, { components, direct }) => ({
  id,
  components, // which kinds it can be built from
  direct,     // whether its values can be typed in directly
  get label() { return t(`kind.${id}`); },
  get plural() { return t(`kind.${id}.plural`); },
  get hint() { return t(`kind.${id}.hint`); },
});
export const KINDS = {
  ingredient: kind('ingredient', { components: [], direct: true }),
  meal: kind('meal', { components: ['ingredient'], direct: false }),
};
export const KIND_ORDER = ['ingredient', 'meal'];

export const allowedComponentKinds = (kind) => KINDS[kind]?.components ?? [];
export const canBeComposite = (kind) => allowedComponentKinds(kind).length > 0;
export const canBeDirect = (kind) => KINDS[kind]?.direct ?? true;

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
