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

/**
 * id:        key used in the data (never change it once in use)
 * dimension: 'energy' | 'mass'
 * unit:      default display unit; units: the ones offered in Settings
 * parent:    "of which ..." sub-nutrient of another one
 * color:     colour slot from the CSS (sub-nutrients use their parent's)
 * brief:     shorter name for tight spots (defaults to name)
 * line:      position in the compact one-line summary under each food (omit to leave it out)
 *
 * Order follows the EU nutrition label, so typing values off a label goes top to bottom.
 * Note: in the EU fibre is NOT part of carbohydrate; it is listed on its own.
 */
export const CATALOG = [
  { id: 'kcal', name: 'Energy', short: 'kcal', dimension: 'energy', unit: 'kcal', units: ['kcal', 'kJ'], color: 'orange', line: 1 },
  { id: 'fat', name: 'Fat', short: 'F', dimension: 'mass', unit: 'g', units: ['g'], color: 'magenta', line: 4 },
  { id: 'saturates', name: 'Saturates', short: 'Sat', dimension: 'mass', unit: 'g', units: ['g'], parent: 'fat' },
  { id: 'monounsaturates', name: 'Monounsaturates', brief: 'Monounsat.', short: 'Mono', dimension: 'mass', unit: 'g', units: ['g'], parent: 'fat' },
  { id: 'polyunsaturates', name: 'Polyunsaturates', brief: 'Polyunsat.', short: 'Poly', dimension: 'mass', unit: 'g', units: ['g'], parent: 'fat' },
  { id: 'carbs', name: 'Carbohydrate', short: 'C', dimension: 'mass', unit: 'g', units: ['g'], color: 'yellow', line: 3 },
  { id: 'sugars', name: 'Sugars', short: 'Sug', dimension: 'mass', unit: 'g', units: ['g'], parent: 'carbs' },
  { id: 'fibre', name: 'Fibre', short: 'Fib', dimension: 'mass', unit: 'g', units: ['g'], color: 'green' },
  { id: 'protein', name: 'Protein', short: 'P', dimension: 'mass', unit: 'g', units: ['g'], color: 'blue', line: 2 },
  { id: 'salt', name: 'Salt', short: 'Salt', dimension: 'mass', unit: 'g', units: ['g', 'mg'], color: 'violet' },
];

const BY_ID = Object.fromEntries(CATALOG.map((n) => [n.id, n]));

const factor = (n) => DIMENSIONS[n.dimension].units[n.unit] ?? 1;

/** Stored (base unit) value -> number in the nutrient's chosen unit. */
export const toDisplay = (n, base) => base * factor(n);
/** Number typed in the nutrient's chosen unit -> stored (base unit) value. */
export const fromDisplay = (n, shown) => shown / factor(n);

export const isEnergy = (n) => n.dimension === 'energy';

/**
 * The nutrients with this device's settings applied (unit, daily target),
 * in display order, each with `depth` (0, or 1 for "of which ...") and a colour.
 * `prefs` is the synced `nutrients` collection: { id: { unit, target } }.
 */
export function resolveNutrients(prefs = {}) {
  return CATALOG.map((def) => {
    const pref = prefs[def.id] || {};
    const unit = def.units.includes(pref.unit) ? pref.unit : def.unit;
    const target = Number(pref.target) > 0 ? Number(pref.target) : null; // stored in base unit
    const parent = def.parent ? BY_ID[def.parent] : null;
    return { ...def, unit, target, depth: parent ? 1 : 0, color: def.color || parent?.color || 'blue' };
  });
}
