// utils/unitConversion.ts

type UnitType = 'mass' | 'volume' | 'discrete' | 'unknown';

// 1. Identify what kind of unit we are dealing with
export const getUnitType = (unit: string): UnitType => {
    const u = unit.toLowerCase().trim();
    if (['g', 'kg', 'oz', 'lb', 'mg'].includes(u)) return 'mass';
    if (['ml', 'l', 'cup', 'tbsp', 'tsp', 'fl oz', 'pint', 'gallon'].includes(u)) return 'volume';
    if (['unit', 'item', 'pcs', 'each', 'ea', 'clove', 'cloves', 'leaf', 'leaves', 'sprig', 'sprigs', 'serving', 'servings'].includes(u)) {
        return 'discrete';
    }
    return 'unknown';
};

// 2. Check if we can convert between two units (e.g. kg -> g is OK, kg -> ml is NOT)
export const areUnitsCompatible = (u1: string, u2: string): boolean => {
    const type1 = getUnitType(u1);
    const type2 = getUnitType(u2);

    // If either is unknown, we can't safely convert
    if (type1 === 'unknown' || type2 === 'unknown') return false;

    return type1 === type2;
};

// 3. Normalize everything to a "Base Unit" (grams for mass, ml for volume)
// This makes math easy. We just convert everything to base, do the division, and done.
export const normalizeQuantity = (qty: number, unit: string): number => {
    const u = unit.toLowerCase().trim();

    // MASS -> Base: Grams (g)
    if (u === 'g') return qty;
    if (u === 'kg') return qty * 1000;
    if (u === 'mg') return qty / 1000;
    if (u === 'oz') return qty * 28.3495;
    if (u === 'lb') return qty * 453.592;

    // VOLUME -> Base: Milliliters (ml)
    if (u === 'ml') return qty;
    if (u === 'l') return qty * 1000;
    if (u === 'tsp') return qty * 4.92892;
    if (u === 'tbsp') return qty * 14.7868;
    if (u === 'cup') return qty * 236.588;
    if (u === 'fl oz') return qty * 29.5735;
    if (u === 'pint') return qty * 473.176;
    if (u === 'gallon') return qty * 3785.41;

    // DISCRETE -> Base: Unit
    if (['ea', 'each', 'clove', 'cloves', 'leaf', 'leaves', 'sprig', 'sprigs', 'serving', 'servings'].includes(u)) {
        return qty;
    }
    return qty;
};

// 4. Convert from base unit back to the requested unit.
export const denormalizeQuantity = (qty: number, unit: string): number => {
    const u = unit.toLowerCase().trim();

    // MASS -> Base: Grams (g)
    if (u === 'g') return qty;
    if (u === 'kg') return qty / 1000;
    if (u === 'mg') return qty * 1000;
    if (u === 'oz') return qty / 28.3495;
    if (u === 'lb') return qty / 453.592;

    // VOLUME -> Base: Milliliters (ml)
    if (u === 'ml') return qty;
    if (u === 'l') return qty / 1000;
    if (u === 'tsp') return qty / 4.92892;
    if (u === 'tbsp') return qty / 14.7868;
    if (u === 'cup') return qty / 236.588;
    if (u === 'fl oz') return qty / 29.5735;
    if (u === 'pint') return qty / 473.176;
    if (u === 'gallon') return qty / 3785.41;

    // DISCRETE -> Base: Unit
    return qty;
};
