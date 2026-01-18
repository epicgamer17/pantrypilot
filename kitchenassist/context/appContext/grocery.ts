import { GroceryItem } from '../../types';
import { areUnitsCompatible, convertQuantity, normalizeQuantity } from '../../utils/unitConversion';

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
  fetchItemsByIds: (
    ids: string[],
  ) => Promise<Map<string, { packageQuantity?: number; packageUnit?: string; itemUrl?: string }>>;
  fetchItemPriceLeaders: (
    ids: string[],
  ) => Promise<Map<string, { price: number; storeName?: string; itemName?: string; itemUrl?: string }>>;
  fetchClosestPriceWithStore: (
    name: string,
  ) => Promise<{ price: number; storeName?: string; itemName?: string; itemUrl?: string }>;
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
  fetchItemsByIds,
  fetchItemPriceLeaders,
  fetchClosestPriceWithStore,
  apiUrl,
}: GroceryDeps) => {
  const getUnitPrice = (
    packagePrice: number,
    packageQuantity: number | undefined,
    packageUnit: string | undefined,
    recipeQuantity: number | undefined,
    recipeUnit: string | undefined,
  ) => {
    const safeQuantity = Number.isFinite(recipeQuantity) && (recipeQuantity as number) > 0 ? recipeQuantity as number : 1;
    if (!Number.isFinite(packagePrice) || packagePrice <= 0) return 0;
    if (!packageQuantity || !packageUnit || !recipeUnit) {
      return packagePrice / safeQuantity;
    }
    if (!areUnitsCompatible(packageUnit, recipeUnit)) {
      const converted = convertQuantity(1, recipeUnit, packageUnit, 1);
      if (!Number.isFinite(converted) || !Number.isFinite(packageQuantity) || packageQuantity <= 0) {
        return packagePrice / safeQuantity;
      }
      return (packagePrice / packageQuantity) * converted;
    }
    const packageBase = normalizeQuantity(packageQuantity, packageUnit);
    const unitBase = normalizeQuantity(1, recipeUnit);
    if (!Number.isFinite(packageBase) || packageBase <= 0 || !Number.isFinite(unitBase)) {
      return packagePrice / safeQuantity;
    }
    return (packagePrice / packageBase) * unitBase;
  };
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
    let bestStoreItemUrl: string | undefined;
    if (!estimatedPrice) {
      const pricesById = await fetchItemPriceLeaders([resolved.id]);
      const leader = pricesById.get(resolved.id);
      estimatedPrice = leader?.price ?? 0;
      bestStoreName = leader?.storeName;
      bestStoreItemName = leader?.itemName;
      bestStoreItemUrl = leader?.itemUrl;
      if (!estimatedPrice) {
        const fallback = await fetchClosestPriceWithStore(resolved.name ?? name);
        estimatedPrice = fallback.price;
        bestStoreName = fallback.storeName;
        bestStoreItemName = fallback.itemName;
        bestStoreItemUrl = fallback.itemUrl;
      }
    }

    const itemDetails = await fetchItemsByIds([resolved.id]);
    const details = itemDetails.get(resolved.id);
    const targetPrice = getUnitPrice(estimatedPrice, details?.packageQuantity, details?.packageUnit, 1, 'unit');

    const newItem: GroceryItem = {
      id: resolved.id,
      itemId: resolved.id,
      name: resolved.name ?? name,
      aisle: resolved.category ?? category,
      packageQuantity: details?.packageQuantity,
      packageUnit: details?.packageUnit,
      itemUrl: details?.itemUrl ?? bestStoreItemUrl,
      targetPrice,
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
    const additions: (GroceryItem & { packagePrice: number })[] = [];

    for (const item of items) {
      const resolved = await ensureItemByName(item.name, item.category);
      if (!resolved?.id) continue;
    let estimatedPrice = item.price ?? 0;
    let bestStoreName: string | undefined;
    let bestStoreItemName: string | undefined;
    let bestStoreItemUrl: string | undefined;
    if (!estimatedPrice) {
      const pricesById = await fetchItemPriceLeaders([resolved.id]);
      const leader = pricesById.get(resolved.id);
      estimatedPrice = leader?.price ?? 0;
      bestStoreName = leader?.storeName;
      bestStoreItemName = leader?.itemName;
      bestStoreItemUrl = leader?.itemUrl;
      if (!estimatedPrice) {
        const fallback = await fetchClosestPriceWithStore(resolved.name ?? item.name);
        estimatedPrice = fallback.price;
        bestStoreName = fallback.storeName;
        bestStoreItemName = fallback.itemName;
        bestStoreItemUrl = fallback.itemUrl;
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
        packagePrice: estimatedPrice,
      });
    }

    const detailsById = additions.length
      ? await fetchItemsByIds(additions.map((item) => item.itemId ?? item.id).filter(Boolean) as string[])
      : new Map();
    const additionsWithPrice = additions.map((item) => {
      const details = detailsById.get(item.itemId ?? item.id);
      const { packagePrice, ...rest } = item;
      return {
        ...rest,
        targetPrice: getUnitPrice(
          packagePrice,
          details?.packageQuantity,
          details?.packageUnit,
          item.quantity,
          item.unit,
        ),
        packageQuantity: details?.packageQuantity,
        packageUnit: details?.packageUnit,
        itemUrl: details?.itemUrl ?? item.itemUrl,
      };
    });

    const resolvedList = await resolveShoppingListIdsWithItems([
      ...startingList,
      ...additionsWithPrice,
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

  const setAllGroceryItemsChecked = async (checked: boolean) => {
    if (!userId || !householdId) return;
    const now = new Date().toISOString();
    const updatedList = dedupeShoppingList(groceryList).map((item) => ({
      ...item,
      checked,
      purchased: checked,
      purchasedAt: checked ? (item.purchasedAt ?? now) : undefined,
      purchasedBy: checked ? (item.purchasedBy ?? userId) : undefined,
    }));

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
      console.error('Error setting all items:', error);
      refreshData();
    }
  };

  const clearPurchasedItems = async () => {
    if (!userId || !householdId) return;
    const deduped = dedupeShoppingList(groceryList);
    const purchasedItems = deduped.filter((item) => item.checked);
    const remaining = deduped.filter((item) => !item.checked);
    setGroceryList(remaining);

    const now = new Date().toISOString();
    try {
      if (purchasedItems.length) {
        await fetch(`${apiUrl}/households/${householdId}/purchases`, {
          method: 'POST',
          headers: getAuthHeaders(true),
          body: JSON.stringify({
            items: purchasedItems.map((item) => ({
              itemId: item.itemId ?? item.id,
              quantity: item.quantity ?? 1,
              unit: item.unit ?? 'unit',
              pricePerUnit: item.targetPrice ?? 0,
              storeName: item.bestStoreName,
              purchasedAt: item.purchasedAt ?? now,
              userId,
            })),
          }),
        });
      }
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
    setAllGroceryItemsChecked,
    clearPurchasedItems,
  };
};
