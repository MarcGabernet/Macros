// Bringing data saved by older versions up to the current rules, every time it
// is loaded. The result depends only on the data, so every device turns the same
// data into the same result (no `updatedAt` changes; nothing to merge).
//
// Up to version 0.4 there were dishes, and meals could hold dishes or have typed
// values. Now there are only products and meals built from products:
// - a dish built from parts       -> a meal (its parts are products already)
// - a dish or meal with typed values -> a product
// - a meal holding a dish         -> the dish's products, at the matching amounts,
//                                    take its place
// Log entries keep pointing at the same food ids, so logged days don't change.

import { amountFactor } from './calc.js';

export function migrate(db) {
  const foods = db.foods;
  const original = {};
  for (const [id, f] of Object.entries(foods)) original[id] = f;

  const isComposite = (f) => f && f.source === 'components';

  // 1. Meals that hold dishes: put the dish's parts in directly, scaled to the amount used.
  for (const [id, f] of Object.entries(foods)) {
    if (f.kind !== 'meal' || !isComposite(f) || !f.components?.some((c) => original[c.foodId]?.kind === 'dish')) continue;
    const parts = [];
    for (const c of f.components) {
      const part = original[c.foodId];
      if (part?.kind === 'dish' && isComposite(part)) {
        const k = amountFactor(part, c.amount, original);
        if (k != null) {
          for (const pc of part.components || []) {
            parts.push({ foodId: pc.foodId, amount: { ...pc.amount, value: Number((Number(pc.amount.value) * k).toPrecision(12)) } });
          }
          continue;
        }
      }
      parts.push(c); // a typed dish becomes a product below, so it can stay as it is
    }
    foods[id] = { ...f, components: parts };
  }

  // 2. Dishes and typed meals become products or meals.
  for (const [id, f] of Object.entries(foods)) {
    if (f.kind === 'dish') foods[id] = { ...f, kind: isComposite(f) ? 'meal' : 'ingredient' };
    else if (f.kind === 'meal' && !isComposite(f)) foods[id] = { ...f, kind: 'ingredient' };
  }
  return db;
}
