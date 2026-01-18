import { Item, Recipe } from '../../types';
import { areUnitsCompatible, normalizeQuantity } from '../../utils/unitConversion';

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
  apiUrl,
  syncHouseholdId,
}: FridgeDeps) => {
  const addToFridge = async (item: Omit<Item, 'initialQuantity'>) => {
    let activeHouseholdId = householdId || (await syncHouseholdId());
    if (!userId || !activeHouseholdId) return;

    const tempId = Math.random().toString();
    const optimisticItem = { ...item, id: tempId, initialQuantity: item.quantity };
    setFridgeItems((prev) => [...prev, optimisticItem]);

    try {
      const payload = {
        itemId: item.id && item.id.length === 24 ? item.id : null,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location ?? 'fridge',
        purchaseDate: item.purchaseDate || new Date().toISOString(),
        expirationDate: item.expiryDate,
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
            return;
          }
        }
        throw new Error(err.error || 'Failed to add to fridge');
      }

      refreshData();
    } catch (error) {
      setFridgeItems((prev) => prev.filter((i) => i.id !== tempId));
      console.error('Error adding to fridge:', error);
      alert('Could not save item. Check console.');
    }
  };

  const addItemsToFridge = async (items: Omit<Item, 'initialQuantity'>[]) => {
    for (const item of items) {
      await addToFridge(item);
    }
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

  const cookRecipeFromFridge = (recipe: Recipe) => {
    recipe.ingredients.forEach((ing) => {
      // Prioritize matching by Item ID if available, then fallback to Name
      const fridgeItem = fridgeItems.find((fi) => {
        if (fi.isUsed) return false;
        if (ing.itemId && fi.itemId) {
          return ing.itemId === fi.itemId;
        }
        return fi.name.toLowerCase() === ing.name.toLowerCase();
      });

      if (fridgeItem && areUnitsCompatible(fridgeItem.unit, ing.unit)) {
        const needQty = normalizeQuantity(ing.quantity, ing.unit);
        const haveQty = normalizeQuantity(fridgeItem.quantity, fridgeItem.unit);
        const remainingBase = haveQty - needQty;

        if (remainingBase <= 0.01) {
          // If we need more than or exactly what we have, consume the whole item
          consumeItem(fridgeItem.id, fridgeItem.quantity);
        } else {
          // Calculate remaining portion and consume only what was used
          const ratio = remainingBase / haveQty;
          const newQty = fridgeItem.quantity * ratio;
          const consumedAmount = fridgeItem.quantity - newQty;
          consumeItem(fridgeItem.id, consumedAmount);
        }
      }
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
