import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from 'react';
import { Platform } from 'react-native';
import { GroceryItem, Item, PurchaseRecord, Recipe } from '../types';
import { useAuth } from './AuthContext';
import {
    ensureItemByName as ensureItemByNameApi,
    fetchClosestPrice as fetchClosestPriceApi,
    fetchClosestPriceWithStore as fetchClosestPriceWithStoreApi,
    fetchItemPrices as fetchItemPricesApi,
    fetchItemPriceLeaders as fetchItemPriceLeadersApi,
    fetchItemsByIds as fetchItemsByIdsApi,
} from './appContext/api';
import { createFridgeActions } from './appContext/fridge';
import { createGroceryActions } from './appContext/grocery';
import { createRecipeActions } from './appContext/recipes';
import { resolveShoppingListIds } from './appContext/shoppingList';
import { AppContextType, HouseholdInfo } from './appContext/types';
import {
    dedupeShoppingList,
    isValidObjectId,
    normalizeObjectId,
} from './appContext/utils';
import { areUnitsCompatible, convertQuantity, normalizeQuantity } from '../utils/unitConversion';

// Adjust localhost for Android Emulator (10.0.2.2) vs iOS/Web (localhost)
const API_URL =
    Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const { userId: authUserId, setHasHousehold } = useAuth();
    const STORAGE_KEYS = {
        householdId: 'app.householdId',
        recentItems: 'app.recentItems',
        cachedRecipes: 'app.cachedRecipes',
        cachedGroceryList: 'app.cachedGroceryList',
    };
    // Auth State
    const [userId, setUserId] = useState<string | null>(null);
    const [householdId, setHouseholdId] = useState<string | null>(null);
    const [householdInfo, setHouseholdInfo] = useState<HouseholdInfo | null>(
        null,
    );

    // Data State
    const [fridgeItems, setFridgeItems] = useState<Item[]>([]);
    const [fridgeLoading, setFridgeLoading] = useState(false);
    const [groceryList, setGroceryList] = useState<GroceryItem[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [purchaseHistory, setPurchaseHistory] = useState<PurchaseRecord[]>([]);
    const [recentlyDepletedItems, setRecentlyDepletedItems] = useState<Item[]>(
        [],
    );

    const getUnitPrice = (
        packagePrice: number,
        packageQuantity: number | undefined,
        packageUnit: string | undefined,
        recipeQuantity: number | undefined,
        recipeUnit: string | undefined,
    ) => {
        const safeQuantity =
            Number.isFinite(recipeQuantity) && (recipeQuantity as number) > 0
                ? (recipeQuantity as number)
                : 1;
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

    const getAuthHeaders = (
        includeJson = false,
        explicitHouseholdId?: string | null,
    ) => {
        const headers: Record<string, string> = {};
        if (includeJson) {
            headers['Content-Type'] = 'application/json';
        }
        if (userId) {
            headers['x-user-id'] = userId;
        }
        const resolvedHouseholdId = explicitHouseholdId ?? householdId;
        if (resolvedHouseholdId) {
            headers['x-household-id'] = resolvedHouseholdId;
        }
        return headers;
    };

    const fetchItemsByIds = (ids: string[]) =>
        fetchItemsByIdsApi(API_URL, getAuthHeaders, userId, ids);
    const fetchItemPrices = (ids: string[]) =>
        fetchItemPricesApi(API_URL, getAuthHeaders, userId, ids);
    const fetchItemPriceLeaders = (ids: string[]) =>
        fetchItemPriceLeadersApi(API_URL, getAuthHeaders, userId, ids);
    const fetchClosestPrice = (name: string) =>
        fetchClosestPriceApi(API_URL, getAuthHeaders, userId, name);
    const fetchClosestPriceWithStore = (name: string) =>
        fetchClosestPriceWithStoreApi(API_URL, getAuthHeaders, userId, name);
    const ensureItemByName = (name: string, category?: string) =>
        ensureItemByNameApi(API_URL, getAuthHeaders, userId, name, category);

    const syncHouseholdId = async () => {
        if (!userId) return null;
        try {
            const res = await fetch(`${API_URL}/users/${userId}`, {
                headers: getAuthHeaders(),
            });
            if (!res.ok) {
                console.error('Failed to fetch user details');
                return null;
            }
            const data = await res.json();
            const resolvedHouseholdId = normalizeObjectId(data.householdId);

            // 2. FIX: Tell AuthContext we found a household!
            if (resolvedHouseholdId) {
                setHasHousehold(true);
            }

            if (resolvedHouseholdId && resolvedHouseholdId !== householdId) {
                setHouseholdId(resolvedHouseholdId);
            }
            return resolvedHouseholdId;
        } catch (e) {
            console.error(e);
            return null;
        }
    };
    // -------------------------------------------------------------------------
    // 1. FETCH DATA ON LOAD / AUTH CHANGE
    // -------------------------------------------------------------------------

    useEffect(() => {
        if (authUserId !== userId) {
            setUserId(authUserId || null);
            if (!authUserId) {
                setHouseholdId(null);
                setHouseholdInfo(null);
            }
        }
    }, [authUserId, userId]);

    // Load persistence
    useEffect(() => {
        const restoreData = async () => {
            try {
                const storedHouseholdId = await AsyncStorage.getItem(
                    STORAGE_KEYS.householdId,
                );
                if (storedHouseholdId && !householdId) {
                    setHouseholdId(storedHouseholdId);
                }

                const storedRecentItems = await AsyncStorage.getItem(
                    STORAGE_KEYS.recentItems,
                );
                if (storedRecentItems) {
                    setRecentlyDepletedItems(JSON.parse(storedRecentItems));
                }
            } catch (error) {
                return;
            }
        };
        restoreData();
    }, []);

    const buildCacheKey = (base: string, uid?: string | null, hid?: string | null) => {
        if (!uid || !hid) return null;
        return `${base}.${uid}.${hid}`;
    };

    useEffect(() => {
        const restoreCachedLists = async () => {
            if (!userId || !householdId) return;
            const recipesKey = buildCacheKey(STORAGE_KEYS.cachedRecipes, userId, householdId);
            const groceryKey = buildCacheKey(STORAGE_KEYS.cachedGroceryList, userId, householdId);
            if (!recipesKey || !groceryKey) return;
            try {
                const [recipesEntry, groceryEntry] = await AsyncStorage.multiGet([
                    recipesKey,
                    groceryKey,
                ]);
                const cachedRecipes = recipesEntry?.[1];
                const cachedGrocery = groceryEntry?.[1];

                if (!recipes.length && cachedRecipes) {
                    const parsed = JSON.parse(cachedRecipes);
                    if (Array.isArray(parsed)) {
                        setRecipes(parsed);
                    }
                }
                if (!groceryList.length && cachedGrocery) {
                    const parsed = JSON.parse(cachedGrocery);
                    if (Array.isArray(parsed)) {
                        setGroceryList(parsed);
                    }
                }
            } catch (error) {
                return;
            }
        };
        restoreCachedLists();
    }, [userId, householdId]);

    useEffect(() => {
        if (!householdId) {
            AsyncStorage.removeItem(STORAGE_KEYS.householdId).catch(() => null);
            return;
        }
        AsyncStorage.setItem(STORAGE_KEYS.householdId, householdId).catch(
            () => null,
        );
    }, [householdId]);

    // Persist recent items when they change
    useEffect(() => {
        AsyncStorage.setItem(
            STORAGE_KEYS.recentItems,
            JSON.stringify(recentlyDepletedItems),
        ).catch(() => null);
    }, [recentlyDepletedItems]);

    useEffect(() => {
        if (!userId || !householdId) return;
        const recipesKey = buildCacheKey(STORAGE_KEYS.cachedRecipes, userId, householdId);
        const groceryKey = buildCacheKey(STORAGE_KEYS.cachedGroceryList, userId, householdId);
        if (!recipesKey || !groceryKey) return;
        AsyncStorage.multiSet([
            [recipesKey, JSON.stringify(recipes)],
            [groceryKey, JSON.stringify(groceryList)],
        ]).catch(() => null);
    }, [recipes, groceryList, userId, householdId]);

    // Helper: Refresh all data
    const refreshData = async () => {
        if (!userId || !householdId) return;
        try {
            console.log(`[AppContext] Refreshing data for household: ${householdId}`);

            // A. Fetch Fridge Items
            setFridgeLoading(true);
            try {
                const fridgeRes = await fetch(
                    `${API_URL}/households/${householdId}/fridge-items?_t=${Date.now()}`,
                    { 
                        headers: getAuthHeaders(),
                        cache: 'no-store'
                    },
                );
                if (fridgeRes.ok) {
                    const data = await fridgeRes.json();
                    const itemIds = data
                        .map((item: Item) => normalizeObjectId(item.itemId))
                        .filter((id: string | null): id is string => !!id);
                    const pricesById = await fetchItemPrices(itemIds);
                    const pricedItems = await Promise.all(
                        data.map(async (item: Item) => {
                            const resolvedItemId = normalizeObjectId(item.itemId);
                            if (item.purchasePrice && item.purchasePrice > 0) {
                                return { ...item, _needsBackfill: false };
                            }
                            const idPrice = resolvedItemId
                                ? pricesById.get(resolvedItemId) ?? 0
                                : 0;
                            if (idPrice > 0) {
                                return { ...item, purchasePrice: idPrice, _needsBackfill: true };
                            }
                        const safeName = item.name ?? 'Item';
                        const estimate = await fetchClosestPrice(safeName);
                        return {
                            ...item,
                            name: safeName,
                            purchasePrice: estimate,
                            _needsBackfill: estimate > 0,
                        };
                        }),
                    );
                    const cleanedItems = pricedItems.map(({ _needsBackfill, ...item }) => item);
                    setFridgeItems(cleanedItems);
                    const backfillTargets = pricedItems.filter(
                        (item) => item._needsBackfill && item.purchasePrice && item.purchasePrice > 0,
                    );
                    await Promise.all(
                        backfillTargets.map((item) =>
                            fetch(
                                `${API_URL}/households/${householdId}/fridge-items/${item.id}`,
                                {
                                    method: 'PATCH',
                                    headers: getAuthHeaders(true, householdId),
                                    body: JSON.stringify({ purchasePrice: item.purchasePrice }),
                                },
                            ).catch(() => null),
                        ),
                    );
                } else {
                    console.error('Failed to fetch fridge items');
                }
            } finally {
                setFridgeLoading(false);
            }

            // B. Fetch Recipes
            const recipesRes = await fetch(
                `${API_URL}/recipes?householdId=${householdId}&_t=${Date.now()}`,
                { 
                    headers: getAuthHeaders(),
                    cache: 'no-store'
                },
            );
            if (recipesRes.ok) {
                const data = await recipesRes.json();
                const normalizedRecipes = data.map((r: any) => ({
                    ...r,
                    id: String(r.id ?? r._id),
                }));
                const ingredientIds = new Set<string>();
                normalizedRecipes.forEach((recipe: any) => {
                    (recipe.ingredients || []).forEach((ingredient: any) => {
                        const resolvedId = normalizeObjectId(ingredient.itemId);
                        if (resolvedId) {
                            ingredientIds.add(resolvedId);
                        }
                    });
                });
                const itemsById = ingredientIds.size
                    ? await fetchItemsByIds(Array.from(ingredientIds))
                    : new Map();
                const resolvedRecipes = normalizedRecipes.map((recipe: any) => ({
                    ...recipe,
                    ingredients: (recipe.ingredients || []).map((ingredient: any) => {
                        const resolvedId = normalizeObjectId(ingredient.itemId);
                        const resolvedName =
                            ingredient.name ||
                            (resolvedId ? itemsById.get(resolvedId)?.name : undefined);
                        return {
                            ...ingredient,
                            itemId: resolvedId ?? ingredient.itemId,
                            name: resolvedName ?? ingredient.name,
                        };
                    }),
                }));
                setRecipes(resolvedRecipes);
            } else {
                console.error('Failed to fetch recipes');
            }

            // C. Fetch Household (for Grocery List & Info)
            const householdRes = await fetch(`${API_URL}/households/${householdId}?_t=${Date.now()}`, {
                headers: getAuthHeaders(),
                cache: 'no-store',
            });
            if (householdRes.ok) {
                const data = await householdRes.json();
                setHouseholdInfo({
                    id: data._id,
                    name: data.name,
                    inviteCode: data.inviteCode,
                    location: data.location,
                });

                if (Array.isArray(data.shoppingList)) {
                    const shoppingList = data.shoppingList;
                    const itemIds = shoppingList
                        .map((item: any) => normalizeObjectId(item.itemId))
                        .filter((id: string | null): id is string => !!id);
                    const itemsById = await fetchItemsByIds(itemIds);
                    const pricesById = await fetchItemPriceLeaders(itemIds);

                    // Map backend shopping list to frontend GroceryItem
                    const mappedList = await Promise.all(
                        shoppingList.map(async (item: any) => {
                            const itemId =
                                normalizeObjectId(item.itemId) ?? Math.random().toString();
                            const details = itemsById.get(itemId);
                            const fallbackName =
                                details?.name ||
                                item.name ||
                                item.itemName ||
                                '';
                            const priceLeader = pricesById.get(itemId);
                            let estimatedPrice = priceLeader?.price ?? 0;
                            let fallbackStoreName: string | undefined;
                            let fallbackItemName: string | undefined;
                            let fallbackItemUrl: string | undefined;
                            if ((!priceLeader?.storeName || !estimatedPrice) && fallbackName) {
                                const fallback = await fetchClosestPriceWithStore(fallbackName);
                                if (!estimatedPrice) {
                                    estimatedPrice = fallback.price;
                                }
                                fallbackStoreName = fallback.storeName;
                                fallbackItemName = fallback.itemName;
                                fallbackItemUrl = fallback.itemUrl;
                            }
                            return {
                                id: itemId,
                                itemId,
                                name: fallbackName || 'Item',
                                aisle: details?.category || 'General',
                                packageQuantity: details?.packageQuantity,
                                packageUnit: details?.packageUnit,
                                packagePrice: estimatedPrice,
                                itemUrl: details?.itemUrl ?? priceLeader?.itemUrl ?? fallbackItemUrl,
                                targetPrice: getUnitPrice(
                                    estimatedPrice,
                                    details?.packageQuantity,
                                    details?.packageUnit,
                                    item.quantity,
                                    item.unit,
                                ),
                                bestStoreName: priceLeader?.storeName ?? fallbackStoreName,
                                bestStoreItemName: priceLeader?.itemName ?? fallbackItemName,
                                onSale: estimatedPrice > 0 ? item.onSale ?? false : false,
                                checked: !!item.purchased,
                                purchased: !!item.purchased,
                                quantity: item.quantity ?? 1,
                                unit: item.unit ?? 'unit',
                                priority: item.priority ?? 'medium',
                                addedAt: item.addedAt,
                                fromRecipe: item.fromRecipe,
                                purchasedAt: item.purchasedAt,
                                purchasedBy: item.purchasedBy,
                            };
                        }),
                    );
                    const dedupedList = dedupeShoppingList(mappedList);
                    setGroceryList(dedupedList);

                    if (dedupedList.length !== mappedList.length) {
                        const now = new Date().toISOString();
                        await fetch(`${API_URL}/households/${householdId}`, {
                            method: 'PATCH',
                            headers: getAuthHeaders(true),
                            body: JSON.stringify({
                                shoppingList: dedupedList.map((item) => {
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
                                        purchasedBy: purchased
                                            ? (item.purchasedBy ?? userId)
                                            : undefined,
                                        purchasedAt: purchased
                                            ? (item.purchasedAt ?? now)
                                            : undefined,
                                    };
                                }),
                            }),
                        });
                    }
                }
            } else {
                console.error('Failed to fetch household info');
            }

            const purchasesRes = await fetch(
                `${API_URL}/households/${householdId}/purchases?limit=200&_t=${Date.now()}`,
                { 
                    headers: getAuthHeaders(),
                    cache: 'no-store'
                },
            );
            if (purchasesRes.ok) {
                const data = await purchasesRes.json();
                const history = Array.isArray(data)
                    ? data.map((entry: any) => ({
                        id: String(entry._id ?? entry.itemId),
                        name: entry.name || 'Item',
                        category: entry.category || 'Other',
                        price: entry.pricePerUnit ?? 0,
                        date: entry.purchasedAt,
                        store: entry.storeName || 'Store',
                        quantity: entry.quantity ?? 1,
                        unit: entry.unit ?? 'unit',
                    }))
                    : [];
                setPurchaseHistory(history);
            }
        } catch (error) {
            console.error('[AppContext] Error refreshing data:', error);
        }
    };

    // Effect: Fetch user details to get Household ID when userId is set
    useEffect(() => {
        const fetchUser = async () => {
            if (!userId) return;
            try {
                await syncHouseholdId();
            } catch (e) {
                console.error(e);
            }
        };
        fetchUser();
    }, [userId, householdId]);

    // Effect: Trigger refresh when auth + household are ready
    useEffect(() => {
        if (userId && householdId) {
            refreshData();
            return;
        }
        if (!userId) {
            setFridgeItems([]);
            setGroceryList([]);
            setRecipes([]);
        }
    }, [userId, householdId]);

    useEffect(() => {
        if (purchaseHistory.length || !fridgeItems.length) return;
        const history: PurchaseRecord[] = [];

        const mapToRecord = (item: Item): PurchaseRecord => ({
            id: item.id,
            name: item.name,
            category: item.category,
            price: item.purchasePrice || 0,
            date: item.purchaseDate,
            store: item.store || 'Store',
            quantity: item.quantity,
            unit: item.unit
        });

        fridgeItems.forEach(item => {
            if (item.purchasePrice) {
                history.push(mapToRecord(item));
            }
        });

        recentlyDepletedItems.forEach(item => {
            if (item.purchasePrice) {
                history.push(mapToRecord(item));
            }
        });

        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setPurchaseHistory(history);
    }, [fridgeItems, recentlyDepletedItems, purchaseHistory.length]);

    // -------------------------------------------------------------------------
    // 2. FRIDGE ACTIONS
    // -------------------------------------------------------------------------

    const {
        addToFridge,
        addItemsToFridge,
        updateFridgeItem,
        removeFromFridge,
        consumeItem,
        cookRecipeFromFridge,
    } = createFridgeActions({
        userId,
        householdId,
        getAuthHeaders,
        refreshData,
        fridgeItems,
        setFridgeItems,
        setRecentlyDepletedItems,
        fetchItemsByIds,
        apiUrl: API_URL,
        syncHouseholdId,
    });

    // -------------------------------------------------------------------------
    // 3. GROCERY ACTIONS
    // -------------------------------------------------------------------------

    const resolveShoppingListIdsWithItems = (list: GroceryItem[]) =>
        resolveShoppingListIds(list, isValidObjectId, ensureItemByName);

    const {
        addToGroceryList,
        addItemsToGroceryList,
        toggleGroceryItem,
        updateGroceryItem,
        setAllGroceryItemsChecked,
        clearPurchasedItems,
    } = createGroceryActions({
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
        apiUrl: API_URL,
    });

    // -------------------------------------------------------------------------
    // 4. RECIPE ACTIONS
    // -------------------------------------------------------------------------

    const { addRecipe, updateRecipe, deleteRecipe } = createRecipeActions({
        userId,
        householdId,
        getAuthHeaders,
        refreshData,
        setRecipes,
        apiUrl: API_URL,
    });

    // -------------------------------------------------------------------------
    // 5. ANALYTICS
    // -------------------------------------------------------------------------

    const calculateTotalWasteCost = () => {
        return recentlyDepletedItems.reduce((total, item) => {
            const wastedPercent = item.percentWasted || 0;
            const price = item.purchasePrice || 0;

            // Calculate money lost on this specific item
            const moneyLost = price * (wastedPercent / 100);
            return total + moneyLost;
        }, 0);
    };
    return (
        <AppContext.Provider
            value={{
                userId,
                setUserId,
                householdId,
                setHouseholdId,
                householdInfo,
                setHouseholdInfo,
                fridgeItems,
                groceryList,
                recipes,
                purchaseHistory,
                recentlyDepletedItems,
                fridgeLoading,
                refreshData,
                addToFridge,
                addItemsToFridge,
                updateFridgeItem,
                removeFromFridge,
                consumeItem,
                cookRecipeFromFridge,
                addToGroceryList,
                addItemsToGroceryList,
                toggleGroceryItem,
                updateGroceryItem,
                setAllGroceryItemsChecked,
                clearPurchasedItems,
                addRecipe,
                updateRecipe,
                deleteRecipe,
                calculateTotalWasteCost,
            }}
        >
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('❌ useApp must be used within an AppProvider');
    return context;
};

export type { HouseholdInfo };
