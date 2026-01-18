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
    fetchItemPrices as fetchItemPricesApi,
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

// Adjust localhost for Android Emulator (10.0.2.2) vs iOS/Web (localhost)
const API_URL =
    Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const { userId: authUserId, setHasHousehold } = useAuth();
    const STORAGE_KEYS = {
        householdId: 'app.householdId',
        recentItems: 'app.recentItems',
    };
    // Auth State
    const [userId, setUserId] = useState<string | null>(null);
    const [householdId, setHouseholdId] = useState<string | null>(null);
    const [householdInfo, setHouseholdInfo] = useState<HouseholdInfo | null>(
        null,
    );

    // Data State
    const [fridgeItems, setFridgeItems] = useState<Item[]>([]);
    const [groceryList, setGroceryList] = useState<GroceryItem[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [purchaseHistory, setPurchaseHistory] = useState<PurchaseRecord[]>([]);
    const [recentlyDepletedItems, setRecentlyDepletedItems] = useState<Item[]>(
        [],
    );

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
    const fetchClosestPrice = (name: string) =>
        fetchClosestPriceApi(API_URL, getAuthHeaders, userId, name);
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

    // Helper: Refresh all data
    const refreshData = async () => {
        if (!userId || !householdId) return;
        try {
            console.log(`[AppContext] Refreshing data for household: ${householdId}`);

            // A. Fetch Fridge Items
            const fridgeRes = await fetch(
                `${API_URL}/households/${householdId}/fridge-items`,
                { headers: getAuthHeaders() },
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
                        const estimate = await fetchClosestPrice(item.name);
                        return {
                            ...item,
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

            // B. Fetch Recipes
            const recipesRes = await fetch(
                `${API_URL}/recipes?householdId=${householdId}`,
                { headers: getAuthHeaders() },
            );
            if (recipesRes.ok) {
                const data = await recipesRes.json();
                setRecipes(data.map((r: any) => ({ ...r, id: r.id || r._id })));
            } else {
                console.error('Failed to fetch recipes');
            }

            // C. Fetch Household (for Grocery List & Info)
            const householdRes = await fetch(`${API_URL}/households/${householdId}`, {
                headers: getAuthHeaders(),
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
                    const pricesById = await fetchItemPrices(itemIds);

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
                            let estimatedPrice = pricesById.get(itemId) ?? 0;
                            if (!estimatedPrice && fallbackName) {
                                estimatedPrice = await fetchClosestPrice(fallbackName);
                            }
                            return {
                                id: itemId,
                                itemId,
                                name: details?.name || 'Item',
                                aisle: details?.category || 'General',
                                targetPrice: estimatedPrice,
                                onSale: estimatedPrice > 0 ? item.onSale ?? false : false,
                                checked: !!item.purchased,
                                purchased: !!item.purchased,
                                quantity: item.quantity ?? 1,
                                unit: item.unit ?? 'unit',
                                priority: item.priority ?? 'medium',
                                addedAt: item.addedAt,
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

            setPurchaseHistory([]);
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
        // Clear data if logged out / no household
        setFridgeItems([]);
        setGroceryList([]);
        setRecipes([]);
    }, [userId, householdId]);

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
        fetchItemPrices,
        fetchClosestPrice,
        apiUrl: API_URL,
    });

    // -------------------------------------------------------------------------
    // 4. RECIPE ACTIONS
    // -------------------------------------------------------------------------

    const { addRecipe, updateRecipe } = createRecipeActions({
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
        return 0;
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
                clearPurchasedItems,
                addRecipe,
                updateRecipe,
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