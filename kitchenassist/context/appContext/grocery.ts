import { GroceryItem } from '../../types';

type HeadersBuilder = (
  includeJson?: boolean,
  explicitHouseholdId?: string | null,
) => Record<string, string>;

type GroceryDeps = {
  userId: string | null;
  householdId: string | null;
  getAuthHeaders: HeadersBuilder;
  refreshData: () => Promise<void>;
  groceryList: GroceryItem[];
  setGroceryList: React.Dispatch<React.SetStateAction<GroceryItem[]>>;
  resolveShoppingListIdsWithItems: (list: GroceryItem[]) => Promise<GroceryItem[]>;
  dedupeShoppingList: (list: GroceryItem[]) => GroceryItem[];
  ensureItemByName: (
    name: string,
    category?: string,
  ) => Promise<{ id: string; name?: string; category?: string } | null>;
  fetchItemPriceLeaders: (
    ids: string[],
  ) => Promise<Map<string, { price: number; storeName?: string; itemName?: string }>>;
  fetchClosestPriceWithStore: (
    name: string,
  ) => Promise<{ price: number; storeName?: string; itemName?: string }>;
  apiUrl: string;
};

export const createGroceryActions = ({
  userId,
  householdId,
  getAuthHeaders,
  refreshData,
  groceryList,
  setGroceryList,
  resolveShoppingListIdsWithItems,
  dedupeShoppingList,
  ensureItemByName,
  fetchItemPriceLeaders,
  fetchClosestPriceWithStore,
  apiUrl,
}: GroceryDeps) => {
  const buildShoppingListPayload = (list: GroceryItem[], now: string) =>
    list.map((item) => {
      const purchased = !!(item.purchased ?? item.checked);
      return {
        itemId: item.itemId ?? item.id,
        quantity: item.quantity ?? 1,
        unit: item.unit ?? 'unit',
        priority: item.priority ?? 'medium',
        addedBy: userId,
        addedAt: item.addedAt ?? now,
        fromRecipe: item.fromRecipe,
        purchased,
        purchasedBy: purchased ? (item.purchasedBy ?? userId) : undefined,
        purchasedAt: purchased ? (item.purchasedAt ?? now) : undefined,
      };
    });

  const addToGroceryList = async (
    name: string,
    category = 'Other',
    price = 0,
    fromRecipe?: string,
  ) => {
    if (!userId || !householdId) return;
    const resolved = await ensureItemByName(name, category);
    if (!resolved?.id) return;

    const now = new Date().toISOString();
    let estimatedPrice = price;
    let bestStoreName: string | undefined;
    let bestStoreItemName: string | undefined;
    if (!estimatedPrice) {
      const pricesById = await fetchItemPriceLeaders([resolved.id]);
      const leader = pricesById.get(resolved.id);
      estimatedPrice = leader?.price ?? 0;
      bestStoreName = leader?.storeName;
      bestStoreItemName = leader?.itemName;
      if (!estimatedPrice) {
        const fallback = await fetchClosestPriceWithStore(resolved.name ?? name);
        estimatedPrice = fallback.price;
        bestStoreName = fallback.storeName;
        bestStoreItemName = fallback.itemName;
      }
    }

    const newItem: GroceryItem = {
      id: resolved.id,
      itemId: resolved.id,
      name: resolved.name ?? name,
      aisle: resolved.category ?? category,
      targetPrice: estimatedPrice,
      bestStoreName,
      bestStoreItemName,
      onSale: false,
      checked: false,
      purchased: false,
      quantity: 1,
      unit: 'unit',
      priority: 'medium',
      addedAt: now,
      fromRecipe,
    };

    const newList = await resolveShoppingListIdsWithItems([
      ...dedupeShoppingList(groceryList),
      newItem,
    ]);
    const dedupedList = dedupeShoppingList(newList);
    setGroceryList(dedupedList);

    try {
      const res = await fetch(`${apiUrl}/households/${householdId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          shoppingList: buildShoppingListPayload(dedupedList, now),
        }),
      });
      if (!res.ok) throw new Error('Failed to update grocery list');
    } catch (error) {
      console.error('Error saving grocery list:', error);
      refreshData();
    }
  };

  const addItemsToGroceryList = async (
    items: {
      name: string;
      category?: string;
      price?: number;
      fromRecipe?: string;
      unit?: string;
      quantity?: number;
    }[],
  ) => {
    if (!userId || !householdId || !items.length) return;
    const now = new Date().toISOString();
    const startingList = dedupeShoppingList(groceryList);
    const additions: GroceryItem[] = [];

    for (const item of items) {
      const resolved = await ensureItemByName(item.name, item.category);
      if (!resolved?.id) continue;
    let estimatedPrice = item.price ?? 0;
    let bestStoreName: string | undefined;
    let bestStoreItemName: string | undefined;
    if (!estimatedPrice) {
      const pricesById = await fetchItemPriceLeaders([resolved.id]);
      const leader = pricesById.get(resolved.id);
      estimatedPrice = leader?.price ?? 0;
      bestStoreName = leader?.storeName;
      bestStoreItemName = leader?.itemName;
      if (!estimatedPrice) {
        const fallback = await fetchClosestPriceWithStore(resolved.name ?? item.name);
        estimatedPrice = fallback.price;
        bestStoreName = fallback.storeName;
        bestStoreItemName = fallback.itemName;
      }
    }
      additions.push({
        id: resolved.id,
        itemId: resolved.id,
        name: resolved.name ?? item.name,
        aisle: resolved.category ?? item.category,
        targetPrice: estimatedPrice,
        bestStoreName,
        bestStoreItemName,
        onSale: false,
        checked: false,
        purchased: false,
        quantity: item.quantity ?? 1,
        unit: item.unit ?? 'unit',
        priority: 'medium',
        addedAt: now,
        fromRecipe: item.fromRecipe,
      });
    }

    const resolvedList = await resolveShoppingListIdsWithItems([
      ...startingList,
      ...additions,
    ]);
    const dedupedList = dedupeShoppingList(resolvedList);
    setGroceryList(dedupedList);

    try {
      const res = await fetch(`${apiUrl}/households/${householdId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          shoppingList: buildShoppingListPayload(dedupedList, now),
        }),
      });
      if (!res.ok) throw new Error('Failed to update grocery list');
    } catch (error) {
      console.error('Error saving grocery list:', error);
      refreshData();
    }
  };

  const toggleGroceryItem = async (id: string) => {
    if (!userId || !householdId) return;
    const now = new Date().toISOString();
    const updatedList = dedupeShoppingList(groceryList).map((item) => {
      if (item.id !== id) return item;
      const nextChecked = !item.checked;
      return {
        ...item,
        checked: nextChecked,
        purchased: nextChecked,
        purchasedAt: nextChecked ? now : undefined,
        purchasedBy: nextChecked ? userId : undefined,
      };
    });

    const resolvedList = await resolveShoppingListIdsWithItems(updatedList);
    const dedupedList = dedupeShoppingList(resolvedList);
    setGroceryList(dedupedList);

    try {
      await fetch(`${apiUrl}/households/${householdId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          shoppingList: buildShoppingListPayload(dedupedList, now),
        }),
      });
    } catch (error) {
      console.error('Error toggling item:', error);
    }
  };

  const updateGroceryItem = async (
    id: string,
    updates: { name?: string; quantity?: number; unit?: string; aisle?: string },
  ) => {
    if (!userId || !householdId) return;
    const baseList = dedupeShoppingList(groceryList);
    const target = baseList.find((item) => item.id === id);
    if (!target) return;

    const nextName = updates.name?.trim() ?? target.name;
    let nextId = target.itemId ?? target.id;
    let nextAisle = updates.aisle ?? target.aisle;

    if (updates.name && updates.name.trim() && updates.name.trim() !== target.name) {
      const resolved = await ensureItemByName(nextName, updates.aisle ?? target.aisle);
      if (resolved?.id) {
        nextId = resolved.id;
        nextAisle = resolved.category ?? nextAisle;
      }
    }

    const updatedList = baseList.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        id: nextId,
        itemId: nextId,
        name: nextName,
        aisle: nextAisle,
        quantity: updates.quantity ?? item.quantity,
        unit: updates.unit ?? item.unit,
      };
    });

    const resolvedList = await resolveShoppingListIdsWithItems(updatedList);
    const dedupedList = dedupeShoppingList(resolvedList);
    setGroceryList(dedupedList);

    const now = new Date().toISOString();
    try {
      await fetch(`${apiUrl}/households/${householdId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          shoppingList: buildShoppingListPayload(dedupedList, now),
        }),
      });
    } catch (error) {
      console.error('Error updating item:', error);
      refreshData();
    }
  };

  const clearPurchasedItems = async () => {
    if (!userId || !householdId) return;
    const remaining = dedupeShoppingList(groceryList).filter((item) => !item.checked);
    setGroceryList(remaining);

    const now = new Date().toISOString();
    try {
      await fetch(`${apiUrl}/households/${householdId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          shoppingList: buildShoppingListPayload(remaining, now),
        }),
      });
    } catch (error) {
      console.error('Error clearing purchased items:', error);
      refreshData();
    }
  };

  return {
    addToGroceryList,
    addItemsToGroceryList,
    toggleGroceryItem,
    updateGroceryItem,
    clearPurchasedItems,
  };
};
