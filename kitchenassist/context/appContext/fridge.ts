import { Item, Recipe } from '../../types';
import { areUnitsCompatible, denormalizeQuantity, normalizeQuantity } from '../../utils/unitConversion';

type HeadersBuilder = (
  includeJson?: boolean,
  explicitHouseholdId?: string | null,
) => Record<string, string>;

type FridgeDeps = {
  userId: string | null;
  householdId: string | null;
  getAuthHeaders: HeadersBuilder;
  refreshData: () => Promise<void>;
  fridgeItems: Item[];
  setFridgeItems: React.Dispatch<React.SetStateAction<Item[]>>;
  setRecentlyDepletedItems: React.Dispatch<React.SetStateAction<Item[]>>;
  fetchItemsByIds: (
    ids: string[]
  ) => Promise<Map<string, { name?: string; category?: string; packageQuantity?: number; packageUnit?: string }>>;
  apiUrl: string;
  syncHouseholdId: () => Promise<string | null>;
};

export const createFridgeActions = ({
  userId,
  householdId,
  getAuthHeaders,
  refreshData,
  fridgeItems,
  setFridgeItems,
  setRecentlyDepletedItems,
  fetchItemsByIds,
  apiUrl,
  syncHouseholdId,
}: FridgeDeps) => {
  const buildDefaultExpiryDate = (category?: string) => {
    const normalized = (category || '').toLowerCase();
    let days: number | null = null;
    if (normalized === 'meat') days = 4;
    if (normalized === 'produce') days = 7;
    if (normalized === 'dairy') days = 14;
    if (!days) return '';
    return new Date(Date.now() + days * 86400000).toISOString();
  };

  const isValidObjectId = (value?: string | null) =>
    !!value && /^[a-f0-9]{24}$/i.test(value);

  const addToFridge = async (item: Omit<Item, 'initialQuantity'>) => {
    let activeHouseholdId = householdId || (await syncHouseholdId());
    if (!userId || !activeHouseholdId) return false;

    const tempId = Math.random().toString();
    const optimisticItem = { ...item, id: tempId, initialQuantity: item.quantity };
    setFridgeItems((prev) => [...prev, optimisticItem]);

    const resolvedItemId =
      (isValidObjectId(item.itemId) ? item.itemId : null) ??
      (isValidObjectId(item.id) ? item.id : null);
    const resolvedName = item.name?.trim?.() || 'Item';
    const defaultExpiryDate = buildDefaultExpiryDate(item.category);

    try {
      const payload = {
        itemId: resolvedItemId ?? undefined,
        name: resolvedName,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location ?? 'fridge',
        purchasePrice: item.purchasePrice ?? undefined,
        purchaseDate: item.purchaseDate || new Date().toISOString(),
        expirationDate: item.expiryDate || defaultExpiryDate || undefined,
        notes: 'Added via App',
      };

      const res = await fetch(
        `${apiUrl}/households/${activeHouseholdId}/fridge-items`,
        {
          method: 'POST',
          headers: getAuthHeaders(true, activeHouseholdId),
          body: JSON.stringify(payload),
        },
      );

        if (!res.ok) {
          const err = await res.json();
          if (err.error === 'Household not found.') {
          const refreshedHouseholdId = await syncHouseholdId();
          if (refreshedHouseholdId && refreshedHouseholdId !== activeHouseholdId) {
            activeHouseholdId = refreshedHouseholdId;
            const retry = await fetch(
              `${apiUrl}/households/${activeHouseholdId}/fridge-items`,
              {
                method: 'POST',
                headers: getAuthHeaders(true, activeHouseholdId),
                body: JSON.stringify(payload),
              },
            );
            if (!retry.ok) {
              const retryErr = await retry.json();
              throw new Error(retryErr.error || 'Failed to add to fridge');
            }
            refreshData();
            return true;
          }
        }
        throw new Error(err.error || 'Failed to add to fridge');
      }

      refreshData();
      return true;
    } catch (error) {
      setFridgeItems((prev) => prev.filter((i) => i.id !== tempId));
      console.error('Error adding to fridge:', error);
      alert('Could not save item. Check console.');
    }
    return false;
  };

  const addItemsToFridge = async (items: Omit<Item, 'initialQuantity'>[]) => {
    let allAdded = true;
    for (const item of items) {
      const added = await addToFridge(item);
      if (!added) {
        allAdded = false;
      }
    }
    return allAdded;
  };

  const updateFridgeItem = async (updatedItem: Item) => {
    if (!userId || !householdId) return;
    setFridgeItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
    );

    try {
      const res = await fetch(
        `${apiUrl}/households/${householdId}/fridge-items/${updatedItem.id}`,
        {
          method: 'PATCH',
          headers: getAuthHeaders(true, householdId),
          body: JSON.stringify({
            quantity: updatedItem.quantity,
            isOpen: updatedItem.isUsed,
            expirationDate: updatedItem.expiryDate,
          }),
        },
      );

      if (!res.ok) throw new Error('Failed to update item');
    } catch (error) {
      console.error('Error updating fridge item:', error);
      refreshData();
    }
  };

  const removeFromFridge = async (id: string, percentWasted: number) => {
    if (!userId || !householdId) return;
    const itemToRemove = fridgeItems.find((i) => i.id === id);
    if (itemToRemove) {
      setRecentlyDepletedItems((prev) => {
        const newItem = {
          ...itemToRemove,
          isUsed: true,
          percentWasted: percentWasted,
          purchaseDate: itemToRemove.purchaseDate || new Date().toISOString(),
        };
        const filtered = prev.filter((i) => i.name !== newItem.name);
        return [newItem, ...filtered].slice(0, 50);
      });
    }
    setFridgeItems((prev) => prev.filter((item) => item.id !== id));

    try {
      const res = await fetch(
        `${apiUrl}/households/${householdId}/fridge-items/${id}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders(),
        },
      );
      if (!res.ok) throw new Error('Failed to delete item');
    } catch (error) {
      console.error('Error removing item:', error);
      refreshData();
    }
  };
  const consumeItem = async (id: string, amountConsumed: number) => {
    const item = fridgeItems.find((i) => i.id === id);
    if (!item) return;
    const remaining = item.quantity - amountConsumed;
    if (remaining <= 0) {
      removeFromFridge(id, 0);
    } else {
      const updated = { ...item, quantity: parseFloat(remaining.toFixed(2)) };
      updateFridgeItem(updated);
    }
  };

  const cookRecipeFromFridge = async (
    recipe: Recipe,
    servingsOverride?: number,
  ) => {
    const itemIds = recipe.ingredients
      .map((ing) => ing.itemId)
      .filter((id): id is string => !!id);
    const itemsById = itemIds.length ? await fetchItemsByIds(itemIds) : new Map();
    const categories = itemIds
      .map((id) => itemsById.get(id)?.category)
      .filter((category): category is string => !!category);
    const categoryCounts = new Map<string, number>();
    categories.forEach((category) => {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    });
    const mostCommonCategory = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category]) => category)[0];
    const hasMeat = categories.includes('Meat');
    const baseServings = Number(recipe.servings) || 1;
    const targetServings = Number(servingsOverride) || baseServings;
    const scale = baseServings > 0 ? targetServings / baseServings : 1;
    const expiryDays = hasMeat ? 3 : 5;
    const expiryDate = new Date(Date.now() + expiryDays * 86400000).toISOString();

    let totalCost = 0;
    recipe.ingredients.forEach((ing) => {
      // Prioritize matching by Item ID if available, then fallback to Name
      const fridgeItem = fridgeItems.find((fi) => {
        if (fi.isUsed) return false;
        if (ing.itemId && fi.itemId) {
          return ing.itemId === fi.itemId;
        }
        return fi.name.toLowerCase() === ing.name.toLowerCase();
      });

      const recipeUnit = ing.unit ?? 'unit';
      const fridgeUnit = fridgeItem?.unit ?? 'unit';
      if (fridgeItem && areUnitsCompatible(fridgeUnit, recipeUnit)) {
        const baseQty = Number(ing.quantity);
        if (!Number.isFinite(baseQty)) {
          return;
        }
        const needQty = normalizeQuantity(baseQty * scale, recipeUnit);
        const haveQty = normalizeQuantity(fridgeItem.quantity, fridgeUnit);
        if (!Number.isFinite(needQty) || !Number.isFinite(haveQty)) {
          return;
        }
        const remainingBase = haveQty - needQty;
        let consumedAmount = 0;

        if (remainingBase <= 0.01) {
          // If we need more than or exactly what we have, consume the whole item
          consumedAmount = fridgeItem.quantity;
          consumeItem(fridgeItem.id, fridgeItem.quantity);
        } else {
          // Consume just the needed amount, expressed in the fridge unit
          consumedAmount = denormalizeQuantity(needQty, fridgeUnit);
          consumeItem(fridgeItem.id, consumedAmount);
        }

        const unitPrice = fridgeItem.purchasePrice ?? 0;
        if (Number.isFinite(unitPrice) && Number.isFinite(consumedAmount)) {
          totalCost += unitPrice * consumedAmount;
        }
      }
    });

    const servingUnit = targetServings === 1 ? 'serving' : 'servings';
    const pricePerServing = targetServings > 0 ? totalCost / targetServings : 0;
    void addToFridge({
      id: `cooked-${Date.now()}`,
      itemId: undefined,
      name: recipe.name,
      category: 'Leftovers',
      quantity: targetServings,
      unit: servingUnit,
      purchasePrice: pricePerServing,
      purchaseDate: new Date().toISOString(),
      expiryDate,
      store: 'Cooked',
      isUsed: false,
    });
  };

  return {
    addToFridge,
    addItemsToFridge,
    updateFridgeItem,
    removeFromFridge,
    consumeItem,
    cookRecipeFromFridge,
  };
};
