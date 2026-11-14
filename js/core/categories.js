// Categories of products (fruit, vegetables, ...), used to filter Foods.
//
// They live in the synced `categories` collection: { id, name, emoji, order }.
// The default ones have fixed ids and `name: null`, which means "the default
// name in the app's language" (texts.js: category.<id>); renaming one stores
// the name. A product points to its category with `categoryId`; a missing or
// deleted category means "no category".

import { store } from './store.js';
import { t } from '../texts.js';

export const DEFAULT_CATEGORIES = [
  { id: 'fruit', emoji: '🍎' },
  { id: 'vegetables', emoji: '🥦' },
  { id: 'pulses', emoji: '🫘' },
  { id: 'nuts', emoji: '🥜' },
  { id: 'cereals', emoji: '🍞' },
  { id: 'dairy', emoji: '🧀' },
  { id: 'meat', emoji: '🥩' },
  { id: 'fish', emoji: '🐟' },
  { id: 'fats', emoji: '🫒' },
  { id: 'sweets', emoji: '🍫' },
  { id: 'drinks', emoji: '🥤' },
];

/** The name shown for a category: its own, else the default one in the app's language. */
export const categoryName = (cat) => cat?.name?.trim() || (cat ? t(`category.${cat.id}`) : '');

/** "🍎 Fruit" */
export const categoryLabel = (cat) => [cat.emoji, categoryName(cat)].filter(Boolean).join(' ');

/** Live categories in their order. */
export function categories(db = store.db) {
  return Object.values(db.categories || {})
    .filter((c) => !c.deleted)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || categoryName(a).localeCompare(categoryName(b)));
}

/** The live category of a product, or null. */
export function categoryOf(food, db = store.db) {
  const cat = food?.categoryId ? db.categories?.[food.categoryId] : null;
  return cat && !cat.deleted ? cat : null;
}

/**
 * Add the default categories the first time (an empty collection: never had any).
 * They are stamped as old as possible, so on another device any rename or delete
 * of them is newer and wins when the two are merged.
 */
export function seedCategories() {
  if (Object.keys(store.db.categories || {}).length) return;
  store.seed('categories', DEFAULT_CATEGORIES.map((c, i) => ({ ...c, name: null, order: i })));
}
