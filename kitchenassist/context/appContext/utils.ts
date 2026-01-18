import { GroceryItem } from '../../types';
import { areUnitsCompatible, denormalizeQuantity, normalizeQuantity } from '../../utils/unitConversion';

export const normalizeObjectId = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    return /^[a-f0-9]{24}$/i.test(value) ? value : null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$oid === 'string') return obj.$oid;
    if (typeof obj._id === 'string') return obj._id;
    if (typeof obj.id === 'string') return obj.id;
    const asString = (value as { toString?: () => string }).toString?.();
    if (asString && /^[a-f0-9]{24}$/i.test(asString)) return asString;
  }
  return null;
};

export const isValidObjectId = (value?: string | null) =>
  !!value && /^[a-f0-9]{24}$/i.test(value);

export const dedupeShoppingList = (list: GroceryItem[]) => {
  const map = new Map<string, GroceryItem>();
  list.forEach((item) => {
    const key =
      (item.itemId && isValidObjectId(item.itemId) && item.itemId) ||
      (item.id && isValidObjectId(item.id) && item.id) ||
      item.name?.trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, item);
      return;
    }
    const existing = map.get(key)!;
    const existingQty = existing.quantity ?? 1;
    const nextQty = item.quantity ?? 1;
    const existingUnit = existing.unit ?? 'unit';
    const nextUnit = item.unit ?? existingUnit;
    let combinedQty = existingQty + nextQty;
    let combinedUnit = existingUnit;

    if (existingUnit !== nextUnit && areUnitsCompatible(existingUnit, nextUnit)) {
      const baseExisting = normalizeQuantity(existingQty, existingUnit);
      const baseNext = normalizeQuantity(nextQty, nextUnit);
      combinedQty = denormalizeQuantity(baseExisting + baseNext, existingUnit);
      combinedUnit = existingUnit;
    }
    map.set(key, {
      ...existing,
      quantity: combinedQty,
      unit: combinedUnit,
      checked: existing.checked || item.checked,
      purchased: existing.purchased || item.purchased,
    });
  });
  return Array.from(map.values());
};
