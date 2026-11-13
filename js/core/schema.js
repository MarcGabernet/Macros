// The shape of the data. Everything the app tracks is described here as data,
// so adding a new nutrient, kind of food or way of measuring is a table edit.

export const SCHEMA_VERSION = 1;

// Collections of records keyed by id. Every record carries `updatedAt`, and a
// deleted one stays as a tombstone (`deleted: true`) so devices can merge.
export const COLLECTIONS = ['nutrients', 'foods', 'entries'];

// "Food" is the general word: an ingredient, a dish and a meal are all foods.
// They differ only in what they may be composed of. Because a dish can hold
// ingredients only, and a meal can hold ingredients and dishes but never meals,
// composition can never loop back on itself.
export const KINDS = {
  ingredient: {
    id: 'ingredient', label: 'Ingredient', plural: 'Ingredients', components: [],
    hint: 'A single food with its own nutrition values.',
  },
  dish: {
    id: 'dish', label: 'Dish', plural: 'Dishes', components: ['ingredient'],
    hint: 'A recipe built from ingredients, or entered directly.',
  },
  meal: {
    id: 'meal', label: 'Meal', plural: 'Meals', components: ['ingredient', 'dish'],
    hint: 'A combination of dishes and ingredients you eat together.',
  },
};
export const KIND_ORDER = ['ingredient', 'dish', 'meal'];

export const allowedComponentKinds = (kind) => KINDS[kind]?.components ?? [];
export const canBeComposite = (kind) => allowedComponentKinds(kind).length > 0;

// Units a nutrient can be measured in. Those with a mass factor (grams per
// unit) can also be entered as a percentage of a food's weight.
export const NUTRIENT_UNITS = ['g', 'mg', 'µg', 'kcal', 'kJ'];
export const MASS_FACTORS = { g: 1, mg: 1e-3, 'µg': 1e-6 };
export const isEnergyUnit = (unit) => unit === 'kcal' || unit === 'kJ';

// Colour slots (defined in CSS for light and dark). Fixed order, never cycled.
export const COLOR_SLOTS = ['orange', 'blue', 'yellow', 'magenta', 'aqua', 'green', 'violet', 'red'];

// Ways to say "how much" of a food: used for what you eat and for recipe parts.
export const AMOUNT_TYPES = ['grams', 'units', 'percent'];

// The nutrients a new install starts with. `updatedAt: 0` means any edit made
// on any device wins over these defaults when devices merge.
export function defaultNutrients() {
  const base = { target: null, createdAt: 0, updatedAt: 0 };
  return [
    { ...base, id: 'kcal', name: 'Calories', short: 'Cal', unit: 'kcal', color: 'orange', order: 0 },
    { ...base, id: 'protein', name: 'Protein', short: 'P', unit: 'g', color: 'blue', order: 1 },
    { ...base, id: 'carbs', name: 'Carbs', short: 'C', unit: 'g', color: 'yellow', order: 2 },
    { ...base, id: 'fat', name: 'Fat', short: 'F', unit: 'g', color: 'magenta', order: 3 },
  ];
}

export const DEFAULT_SETTINGS = { weekStart: 1, updatedAt: 0 }; // 1 = Monday, 0 = Sunday

export function emptyDb() {
  const db = { schema: SCHEMA_VERSION, nutrients: {}, foods: {}, entries: {}, settings: { ...DEFAULT_SETTINGS } };
  for (const n of defaultNutrients()) db.nutrients[n.id] = n;
  return db;
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
