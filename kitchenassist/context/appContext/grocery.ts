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
  fetchItemPrices: (ids: string[]) => Promise<Map<string, number>>;
  fetchClosestPrice: (name: string) => Promise<number>;
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
  fetchItemPrices,
  fetchClosestPrice,
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
    if (!estimatedPrice) {
      const pricesById = await fetchItemPrices([resolved.id]);
      estimatedPrice = pricesById.get(resolved.id) ?? 0;
      if (!estimatedPrice) {
        estimatedPrice = await fetchClosestPrice(resolved.name ?? name);
      }
    }

    const newItem: GroceryItem = {
      id: resolved.id,
      itemId: resolved.id,
      name: resolved.name ?? name,
      aisle: resolved.category ?? category,
      targetPrice: estimatedPrice,
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
    items: { name: string; category?: string; price?: number; fromRecipe?: string }[],
  ) => {
    if (!userId || !householdId || !items.length) return;
    const now = new Date().toISOString();
    const startingList = dedupeShoppingList(groceryList);
    const additions: GroceryItem[] = [];

    for (const item of items) {
      const resolved = await ensureItemByName(item.name, item.category);
      if (!resolved?.id) continue;
      let estimatedPrice = item.price ?? 0;
      if (!estimatedPrice) {
        const pricesById = await fetchItemPrices([resolved.id]);
        estimatedPrice = pricesById.get(resolved.id) ?? 0;
        if (!estimatedPrice) {
          estimatedPrice = await fetchClosestPrice(resolved.name ?? item.name);
        }
      }
      additions.push({
        id: resolved.id,
        itemId: resolved.id,
        name: resolved.name ?? item.name,
        aisle: resolved.category ?? item.category,
        targetPrice: estimatedPrice,
        onSale: false,
        checked: false,
        purchased: false,
        quantity: 1,
        unit: 'unit',
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
    clearPurchasedItems,
  };
};
