// Looking up a scanned barcode in Open Food Facts (https://world.openfoodfacts.org),
// a free, open database of food products. Only the barcode number is sent.
// Its data is under the Open Database License, so the app credits it where shown.

import { CATALOG } from '../core/nutrients.js';

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = ['code', 'product_name', 'product_name_es', 'product_name_en', 'generic_name', 'brands', 'quantity', 'product_quantity', 'nutriments'].join(',');
const KCAL_PER_KJ = 1 / 4.184;
const SALT_PER_SODIUM = 2.5;

export class LookupError extends Error {}

/** Digits only; the barcodes printed on food are 8, 12, 13 or 14 digits long. */
export function cleanBarcode(text) {
  const digits = String(text || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

/**
 * Whether the last digit is the right check digit (EAN-8, UPC-A, EAN-13, GTIN-14).
 * Every product barcode carries one, so a misread digit is almost always caught.
 */
export function isValidBarcode(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

/** The form used to look a code up and to compare it: a 12-digit UPC-A is the same product as "0" + it. */
export const toLookupCode = (code) => (code.length === 12 ? `0${code}` : code);

/** Nutrient values per 100 g in the app's own keys (base units), from Open Food Facts' `nutriments`. */
export function mapNutriments(nutriments = {}) {
  const values = {};
  const read = (key) => {
    const v = Number(nutriments[`${key}_100g`]);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  for (const n of CATALOG) {
    if (!n.off) continue;
    const v = read(n.off);
    if (v != null) values[n.id] = Number(v.toPrecision(12));
  }
  // Fallbacks for products that give only the other form.
  if (values.kcal == null) {
    const kj = read('energy-kj') ?? (nutriments.energy_unit === 'kJ' || !nutriments.energy_unit ? read('energy') : null);
    if (kj != null) values.kcal = Number((kj * KCAL_PER_KJ).toFixed(1));
  }
  if (values.salt == null) {
    const sodium = read('sodium');
    if (sodium != null) values.salt = Number((sodium * SALT_PER_SODIUM).toPrecision(12));
  }
  return values;
}

/** A readable name: "Brand Product" without repeating the brand. */
function productName(p) {
  const name = (p.product_name_es || p.product_name || p.product_name_en || p.generic_name || '').trim();
  const brand = (p.brands || '').split(',')[0].trim();
  if (!name) return brand;
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name;
  return `${name} · ${brand}`;
}

/**
 * Look a barcode up. Resolves to null when Open Food Facts doesn't have it, or
 * { name, values, packageGrams, nutrientCount } (values per 100 g).
 * Throws LookupError when there's no connection or the service fails.
 */
export async function lookupBarcode(code) {
  let res;
  try {
    res = await fetch(`${API}${encodeURIComponent(code)}.json?fields=${FIELDS}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new LookupError('No connection: the product can’t be looked up right now');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new LookupError(`Open Food Facts responded with an error (${res.status})`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const values = mapNutriments(p.nutriments);
  const grams = Number(p.product_quantity);
  return {
    name: productName(p),
    values,
    packageGrams: Number.isFinite(grams) && grams > 0 ? grams : null,
    nutrientCount: Object.keys(values).length,
  };
}
