// The shape of the data. Everything the app tracks is described here as data,
// so adding a new nutrient, kind of food or way of measuring is a table edit.

export const SCHEMA_VERSION = 1;

// Collections of records keyed by id. Every record carries `updatedAt`, and a
// deleted one stays as a tombstone (`deleted: true`) so devices can merge.
// `weights` holds weigh-ins, one per day, keyed by date (YYYY-MM-DD).
export const COLLECTIONS = ['nutrients', 'foods', 'entries', 'weights'];

// "Food" is the general word: an ingredient, a dish and a meal are all foods.
// They differ only in what they may be composed of. Because a dish can hold
// ingredients only, and a meal can hold ingredients and dishes but never meals,
// composition can never loop back on itself.
export const KINDS = {
  ingredient: {
    id: 'ingredient', label: 'Ingredient', plural: 'Ingredients', components: [],
    hint: 'A single food with its own nutrition values',
  },
  dish: {
    id: 'dish', label: 'Dish', plural: 'Dishes', components: ['ingredient'],
    hint: 'A recipe built from ingredients, or entered directly',
  },
  meal: {
    id: 'meal', label: 'Meal', plural: 'Meals', components: ['ingredient', 'dish'],
    hint: 'A combination of dishes and ingredients you eat together',
  },
};
export const KIND_ORDER = ['ingredient', 'dish', 'meal'];

export const allowedComponentKinds = (kind) => KINDS[kind]?.components ?? [];
export const canBeComposite = (kind) => allowedComponentKinds(kind).length > 0;

// Ways to say "how much" of a food: used for what you eat and for recipe parts.
export const AMOUNT_TYPES = ['grams', 'units', 'percent'];

export const DEFAULT_SETTINGS = {
  weekStart: 1,           // 1 = Monday, 0 = Sunday
  weightUnit: 'kg',       // 'kg' | 'lb'
  weightMode: 'weighins', // 'weighins' (logged on the Day screen) | 'manual' (typed in Settings)
  weightKg: null,         // the weight typed in Settings, in kg
  hideReferences: false,  // hide the daily intake references everywhere
  updatedAt: 0,
};

export function emptyDb() {
  // `nutrients` holds only your settings per nutrient ({ unit, target, enabled });
  // the nutrients themselves are defined in nutrients.js.
  return { schema: SCHEMA_VERSION, nutrients: {}, foods: {}, entries: {}, weights: {}, settings: { ...DEFAULT_SETTINGS } };
}

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
