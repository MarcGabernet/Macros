// The nutrients the app tracks. To track a new one, add a line to CATALOG:
// nothing else in the app needs to change.
//
// Every value is STORED in its dimension's base unit (kcal for energy, grams
// for everything else) and only SHOWN in the unit chosen in Settings, so
// switching g -> mg converts the numbers instead of relabelling them.
// Energy and weight are different things and never convert into each other.

export const DIMENSIONS = {
  energy: { base: 'kcal', units: { kcal: 1, kJ: 4.184 } },      // shown = base × factor
  mass: { base: 'g', units: { g: 1, mg: 1e3, 'µg': 1e6 } },
};

// Where a nutrient appears on the Day screen.
export const GROUPS = [
  { id: 'macro', label: 'Macros' },
  { id: 'mineral', label: 'Minerals' },
  { id: 'vitamin', label: 'Vitamins' },
];

const mg = (x) => x / 1e3; // reference values are written in their usual unit, stored in grams
const ug = (x) => x / 1e6;

/**
 * id:        key used in the data (never change it once in use)
 * group:     'macro' | 'mineral' | 'vitamin'
 * dimension: 'energy' | 'mass'
 * unit:      default display unit; units: the ones offered in Settings
 * parent:    "of which ..." sub-nutrient of another one
 * color:     colour slot from the CSS (sub-nutrients use their parent's)
 * brief:     shorter name for tight spots (defaults to name)
 * line:      position in the compact one-line summary under each food (omit to leave it out)
 * ref:       daily reference for an adult, in the base unit (EU Regulation 1169/2011, Annex XIII;
 *            fibre from EFSA, which the EU label has none for). Not editable.
 * refPerKg:  reference per kg of body weight, used instead of `ref` once a weight is known
 *            (protein: EFSA population reference intake, 0.83 g/kg)
 *
 * Order follows the EU nutrition label, so typing values off a label goes top to bottom.
 * Note: in the EU fibre is NOT part of carbohydrate; it is listed on its own.
 */
export const CATALOG = [
  { id: 'kcal', group: 'macro', name: 'Energy', short: 'kcal', dimension: 'energy', unit: 'kcal', units: ['kcal', 'kJ'], color: 'orange', line: 1, ref: 2000 },
  { id: 'fat', group: 'macro', name: 'Fat', short: 'F', dimension: 'mass', unit: 'g', units: ['g'], color: 'magenta', line: 4, ref: 70 },
  { id: 'saturates', group: 'macro', name: 'Saturates', short: 'Sat', dimension: 'mass', unit: 'g', units: ['g'], parent: 'fat', ref: 20 },
  { id: 'monounsaturates', group: 'macro', name: 'Monounsaturates', brief: 'Monounsat.', short: 'Mono', dimension: 'mass', unit: 'g', units: ['g'], parent: 'fat' },
  { id: 'polyunsaturates', group: 'macro', name: 'Polyunsaturates', brief: 'Polyunsat.', short: 'Poly', dimension: 'mass', unit: 'g', units: ['g'], parent: 'fat' },
  { id: 'carbs', group: 'macro', name: 'Carbohydrate', short: 'C', dimension: 'mass', unit: 'g', units: ['g'], color: 'yellow', line: 3, ref: 260 },
  { id: 'sugars', group: 'macro', name: 'Sugars', short: 'Sug', dimension: 'mass', unit: 'g', units: ['g'], parent: 'carbs', ref: 90 },
  { id: 'fibre', group: 'macro', name: 'Fibre', short: 'Fib', dimension: 'mass', unit: 'g', units: ['g'], color: 'green', ref: 25 },
  { id: 'protein', group: 'macro', name: 'Protein', short: 'P', dimension: 'mass', unit: 'g', units: ['g'], color: 'blue', line: 2, ref: 50, refPerKg: 0.83 },

  { id: 'salt', group: 'mineral', name: 'Salt', short: 'Salt', dimension: 'mass', unit: 'g', units: ['g', 'mg'], color: 'violet', ref: 6 },
  { id: 'potassium', group: 'mineral', name: 'Potassium', short: 'K', dimension: 'mass', unit: 'mg', units: ['mg', 'g'], color: 'aqua', ref: mg(2000) },
  { id: 'calcium', group: 'mineral', name: 'Calcium', short: 'Ca', dimension: 'mass', unit: 'mg', units: ['mg', 'g'], color: 'blue', ref: mg(800) },
  { id: 'iron', group: 'mineral', name: 'Iron', short: 'Fe', dimension: 'mass', unit: 'mg', units: ['mg', 'µg'], color: 'red', ref: mg(14) },
  { id: 'magnesium', group: 'mineral', name: 'Magnesium', short: 'Mg', dimension: 'mass', unit: 'mg', units: ['mg', 'g'], color: 'green', ref: mg(375) },

  { id: 'vitaminC', group: 'vitamin', name: 'Vitamin C', short: 'C', dimension: 'mass', unit: 'mg', units: ['mg'], color: 'yellow', ref: mg(80) },
  { id: 'vitaminD', group: 'vitamin', name: 'Vitamin D', short: 'D', dimension: 'mass', unit: 'µg', units: ['µg'], color: 'orange', ref: ug(5) },
  { id: 'vitaminB12', group: 'vitamin', name: 'Vitamin B12', short: 'B12', dimension: 'mass', unit: 'µg', units: ['µg'], color: 'violet', ref: ug(2.5) },
];

const BY_ID = Object.fromEntries(CATALOG.map((n) => [n.id, n]));

const factor = (n) => DIMENSIONS[n.dimension].units[n.unit] ?? 1;

/** Stored (base unit) value -> number in the nutrient's chosen unit. */
export const toDisplay = (n, base) => base * factor(n);
/** Number typed in the nutrient's chosen unit -> stored (base unit) value. */
export const fromDisplay = (n, shown) => shown / factor(n);

export const isEnergy = (n) => n.dimension === 'energy';

/** The daily reference for this nutrient (base unit), or null when there is none. */
export function referenceFor(def, weightKg) {
  if (def.refPerKg && weightKg > 0) return def.refPerKg * weightKg;
  return def.ref ?? null;
}

/**
 * Every nutrient with this device's settings applied, in display order:
 * unit, daily target, `enabled` (false also when its parent is disabled),
 * `depth` (0, or 1 for "of which ..."), colour and daily reference.
 * `prefs` is the synced `nutrients` collection: { id: { unit, target, enabled } }.
 */
export function resolveNutrients(prefs = {}, { weightKg = null } = {}) {
  return CATALOG.map((def) => {
    const pref = prefs[def.id] || {};
    const parent = def.parent ? BY_ID[def.parent] : null;
    const selfOn = pref.enabled !== false;
    const parentOn = !parent || prefs[parent.id]?.enabled !== false;
    return {
      ...def,
      unit: def.units.includes(pref.unit) ? pref.unit : def.unit,
      target: Number(pref.target) > 0 ? Number(pref.target) : null, // stored in base unit
      selfEnabled: selfOn,
      enabled: selfOn && parentOn,
      depth: parent ? 1 : 0,
      color: def.color || parent?.color || 'blue',
      reference: referenceFor(def, weightKg),
    };
  });
}
