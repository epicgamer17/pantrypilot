import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TextInput,
    ScrollView,
    Alert,
    Keyboard,
    Platform,
    useWindowDimensions,
    ActivityIndicator,
    Switch,
    Linking
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { Recipe, Ingredient } from '../../types';
import { Card } from '../../components/ui/Card';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';
import { fetchItemPrices, fetchItemsByIds, ensureItemByName } from '../../context/appContext/api';
import { normalizeObjectId } from '../../context/appContext/utils';
import { areUnitsCompatible, convertQuantity, normalizeQuantity } from '../../utils/unitConversion';

type SortOption = 'missing' | 'expiry' | 'cost' | 'az';
type ViewMode = 'household' | 'public';

export default function RecipesScreen() {
    const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
    const { width } = useWindowDimensions();
    const numColumns = width > 1024 ? 3 : width > 700 ? 2 : 1;
    const gap = Spacing.m;
    const padding = Spacing.xl;
    const cardWidth = (width - (padding * 2) - (gap * (numColumns - 1))) / numColumns;

    const {
        recipes: householdRecipes,
        fridgeItems,
        groceryList,
        addRecipe,
        updateRecipe,
        deleteRecipe,
        addToGroceryList,
        addItemsToGroceryList,
        cookRecipeFromFridge,
        userId,
        householdId,
    } = useApp();

    // UI State
    const [viewMode, setViewMode] = useState<ViewMode>('household');
    const [modalVisible, setModalVisible] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>('missing');
    const [searchQuery, setSearchQuery] = useState('');
    const [hideAiRecipes, setHideAiRecipes] = useState(false);
    
    // YouTube Modal State
    const [youtubeModalVisible, setYoutubeModalVisible] = useState(false);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [youtubeLoading, setYoutubeLoading] = useState(false);
    const [youtubeError, setYoutubeError] = useState<string | null>(null);
    
    // Article Modal State
    const [articleModalVisible, setArticleModalVisible] = useState(false);
    const [articleUrl, setArticleUrl] = useState('');
    const [articleLoading, setArticleLoading] = useState(false);
    const [articleError, setArticleError] = useState<string | null>(null);

    // Cook Modal State
    const [cookModalVisible, setCookModalVisible] = useState(false);
    const [recipeToCook, setRecipeToCook] = useState<Recipe | null>(null);
    const [cookServings, setCookServings] = useState('1');
    const [maxCookServings, setMaxCookServings] = useState(1);
    const [limitingIngredient, setLimitingIngredient] = useState<string | null>(null);
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [recipeToView, setRecipeToView] = useState<Recipe | null>(null);
    const [geminiLoading, setGeminiLoading] = useState(false);

    // Data State
    const [publicRecipes, setPublicRecipes] = useState<Recipe[]>([]);
    const [loadingPublic, setLoadingPublic] = useState(false);
    const [prices, setPrices] = useState<Map<string, number>>(new Map());
    const [itemDetails, setItemDetails] = useState<Map<string, { packageQuantity?: number; packageUnit?: string }>>(
        new Map()
    );

    // Form State
    const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
    const [newRecipeName, setNewRecipeName] = useState('');
    const [isPublicRecipe, setIsPublicRecipe] = useState(false);
    const [isAiRecipe, setIsAiRecipe] = useState(false);
    const [newInstructionsText, setNewInstructionsText] = useState('');
    const [newRecipeServings, setNewRecipeServings] = useState('');
    const [instructionsExpanded, setInstructionsExpanded] = useState(false);
    const [leftColumnHeight, setLeftColumnHeight] = useState(0);

    const [currentIngName, setCurrentIngName] = useState('');
    const [currentIngItemId, setCurrentIngItemId] = useState<string | null>(null);
    const [currentIngQty, setCurrentIngQty] = useState('');
    const [currentIngUnit, setCurrentIngUnit] = useState('unit');
    const [newIngredients, setNewIngredients] = useState<Ingredient[]>([]);

    const [remoteItems, setRemoteItems] = useState<{ id: string; name: string }[]>([]);
    const [showCreateItemModal, setShowCreateItemModal] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('Other');

    const UNITS = ['unit', 'g', 'kg', 'oz', 'lb', 'ml', 'L', 'cup', 'tbsp', 'tsp'];
    const KNOWN_CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Beverages', 'Other'];

    const getAuthHeaders = (includeJson = false, explicitHouseholdId?: string | null) => {
        const headers: Record<string, string> = {};
        if (includeJson) headers['Content-Type'] = 'application/json';
        if (userId) headers['x-user-id'] = userId;
        const targetHousehold = explicitHouseholdId ?? householdId;
        if (targetHousehold) headers['x-household-id'] = targetHousehold;
        return headers;
    };

    // Fetch public recipes when switching to "Discover" mode
    useEffect(() => {
        if (viewMode === 'public' && publicRecipes.length === 0) {
            setLoadingPublic(true);
            fetch(`${API_URL}/recipes?publicOnly=true`, { headers: getAuthHeaders() })
                .then(res => res.json())
                .then(async data => {
                    const normalized = Array.isArray(data)
                        ? data.map((r: any) => ({ ...r, id: String(r.id ?? r._id) }))
                        : [];
                    const ingredientIds = new Set<string>();
                    normalized.forEach((recipe: any) => {
                        (recipe.ingredients || []).forEach((ingredient: any) => {
                            const resolvedId = normalizeObjectId(ingredient.itemId);
                            if (resolvedId) {
                                ingredientIds.add(resolvedId);
                            }
                        });
                    });
                    const itemsById = ingredientIds.size
                        ? await fetchItemsByIds(API_URL, getAuthHeaders, userId, Array.from(ingredientIds))
                        : new Map();
                    const resolved = normalized.map((recipe: any) => ({
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
                    setPublicRecipes(resolved);
                })
                .catch(err => console.error('Failed to fetch public recipes', err))
                .finally(() => setLoadingPublic(false));
        }
    }, [viewMode]);

    const activeRecipes = viewMode === 'household' ? householdRecipes : publicRecipes;

    // Fetch prices for ingredients in active recipes
    useEffect(() => {
        const fetchPrices = async () => {
            const allIngredients = activeRecipes.flatMap(r => r.ingredients);
            const itemIds = Array.from(new Set(allIngredients.map(i => i.itemId).filter(id => !!id))) as string[];

            if (itemIds.length === 0) return;

            try {
                const [priceMap, itemsById] = await Promise.all([
                    fetchItemPrices(API_URL, getAuthHeaders, userId, itemIds),
                    fetchItemsByIds(API_URL, getAuthHeaders, userId, itemIds),
                ]);
                setPrices(prev => {
                    const next = new Map(prev);
                    priceMap.forEach((v, k) => next.set(k, v));
                    return next;
                });
                setItemDetails(prev => {
                    const next = new Map(prev);
                    itemsById.forEach((v, k) => {
                        next.set(k, { packageQuantity: v.packageQuantity, packageUnit: v.packageUnit });
                    });
                    return next;
                });
            } catch (error) {
                console.error('Failed to fetch ingredient prices', error);
            }
        };

        if (activeRecipes.length > 0) {
            fetchPrices();
        }
    }, [activeRecipes, userId, householdId]);

    const resolveItemIdByName = async (name: string) => {
        if (!userId || !name.trim()) return null;
        try {
            const res = await fetch(`${API_URL}/items?search=${encodeURIComponent(name)}`, {
                headers: getAuthHeaders()
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (!Array.isArray(data)) return null;
            const exact = data.find((item: { name: string }) => item.name?.toLowerCase() === name.toLowerCase());
            return exact?.id ?? null;
        } catch (error) {
            return null;
        }
    };

    // Item Autocomplete Logic
    useEffect(() => {
        const query = currentIngName.trim();
        if (!userId || !query) {
            setRemoteItems([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_URL}/items?search=${encodeURIComponent(query)}`, {
                    headers: getAuthHeaders()
                });
                if (!res.ok) {
                    setRemoteItems([]);
                    return;
                }
                const data = await res.json();
                if (Array.isArray(data)) {
                    setRemoteItems(data.map((item: { id: string; name: string }) => ({
                        id: item.id ?? item._id,
                        name: item.name
                    })));
                } else {
                    setRemoteItems([]);
                }
            } catch (error) {
                setRemoteItems([]);
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [API_URL, currentIngName, userId, householdId]);

    const knownItems = useMemo(() => {
        const byName = new Map<string, { id?: string; name: string }>();
        remoteItems.forEach(item => {
            if (item.name && !byName.has(item.name.toLowerCase())) {
                byName.set(item.name.toLowerCase(), { id: item.id, name: item.name });
            }
        });
        return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [remoteItems]);

    const filteredSuggestions = useMemo(() => {
        const query = currentIngName.trim().toLowerCase();
        if (!query) return [];
        return knownItems.filter(item => item.name.toLowerCase().includes(query));
    }, [currentIngName, knownItems]);

    const hasExactMatch = useMemo(() => {
        const query = currentIngName.trim().toLowerCase();
        if (!query) return false;
        return knownItems.some(item => item.name.toLowerCase() === query);
    }, [currentIngName, knownItems]);

    const getRecipeMetadata = (recipe: Recipe) => {
        let missingCount = 0;
        let totalCost = 0;
        let minDaysToExpiry = 999;
        let hasFridgeItems = false;

        recipe.ingredients.forEach(ing => {
            // Calculate Cost
            if (ing.itemId && prices.has(ing.itemId)) {
                const unitPrice = prices.get(ing.itemId) || 0;
                const itemDetail = itemDetails.get(ing.itemId);
                const recipeQty = Number(ing.quantity ?? 1);
                const itemQty = Number(itemDetail?.packageQuantity ?? 1);
                const safeRecipeQty = Number.isFinite(recipeQty) ? recipeQty : 1;
                const safeItemQty = Number.isFinite(itemQty) && itemQty > 0 ? itemQty : 1;
                const recipeUnit = ing.unit ?? 'unit';
                const itemUnit = itemDetail?.packageUnit;
                if (itemUnit && !areUnitsCompatible(itemUnit, recipeUnit)) {
                    const converted = convertQuantity(safeRecipeQty, recipeUnit, itemUnit, 1);
                    if (Number.isFinite(converted) && safeItemQty > 0) {
                        totalCost += (converted / safeItemQty) * unitPrice;
                    } else {
                        totalCost += (safeRecipeQty / safeItemQty) * unitPrice;
                    }
                } else {
                    totalCost += (safeRecipeQty / safeItemQty) * unitPrice;
                }
            }

            // Check Fridge
            const inFridge = fridgeItems.find(item =>
                (ing.itemId && item.itemId && item.itemId === ing.itemId) ||
                (item.name && ing.name && item.name.toLowerCase() === ing.name.toLowerCase())
            );

            if (!inFridge) {
                missingCount++;
            } else {
                hasFridgeItems = true;
                // Check Expiry
                if (inFridge.expiryDate) {
                    const days = (new Date(inFridge.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
                    if (days < minDaysToExpiry) minDaysToExpiry = days;
                }
            }
        });

        if (!hasFridgeItems) minDaysToExpiry = 999;

        return { missingCount, minDaysToExpiry, totalCost };
    };

    const resolveIngredientSource = (ingredient: Ingredient) => {
        const inFridge = fridgeItems.find(item =>
            (ingredient.itemId && item.itemId && item.itemId === ingredient.itemId) ||
            (item.name && ingredient.name && item.name.toLowerCase() === ingredient.name.toLowerCase())
        );
        if (inFridge) return 'Fridge';
        const onList = groceryList.find(item =>
            (ingredient.itemId && item.itemId && item.itemId === ingredient.itemId) ||
            (item.name && ingredient.name && item.name.toLowerCase() === ingredient.name.toLowerCase())
        );
        if (onList) return 'Grocery list';
        return 'Missing';
    };

    const groupIngredientsBySource = (ingredients: Ingredient[]) => {
        const groups = {
            fridge: [] as Ingredient[],
            list: [] as Ingredient[],
            missing: [] as Ingredient[],
        };
        ingredients.forEach((ingredient) => {
            const source = resolveIngredientSource(ingredient);
            if (source === 'Fridge') {
                groups.fridge.push(ingredient);
                return;
            }
            if (source === 'Grocery list') {
                groups.list.push(ingredient);
                return;
            }
            groups.missing.push(ingredient);
        });
        return groups;
    };

    const getSortedRecipes = () => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        const filtered = (normalizedQuery || hideAiRecipes)
            ? activeRecipes.filter((recipe) => {
                if (hideAiRecipes && recipe.isAiGenerated) {
                    return false;
                }
                if (!normalizedQuery) return true;
                const nameMatch = recipe.name?.toLowerCase().includes(normalizedQuery);
                const ingredientMatch = recipe.ingredients?.some((ing) =>
                    ing.name?.toLowerCase().includes(normalizedQuery),
                );
                return nameMatch || ingredientMatch;
            })
            : activeRecipes;
        const withMeta = filtered.map(r => ({ ...r, meta: getRecipeMetadata(r) }));
        const sorted = [...withMeta].sort((a, b) => {
            if (sortBy === 'az') {
                return a.name.localeCompare(b.name);
            }
            if (sortBy === 'cost') {
                return (a.meta.totalCost - b.meta.totalCost) || a.name.localeCompare(b.name);
            }
            if (sortBy === 'expiry') {
                return (a.meta.minDaysToExpiry - b.meta.minDaysToExpiry) || a.name.localeCompare(b.name);
            }
            return (a.meta.missingCount - b.meta.missingCount) || a.name.localeCompare(b.name);
        });
        return sorted;
    };

    const buildInstructionText = (instructions?: Recipe['instructions']) => {
        if (!instructions) return '';
        if (Array.isArray(instructions)) {
            return instructions
                .map((entry) =>
                    typeof entry === 'string' ? entry : entry.instruction,
                )
                .filter(Boolean)
                .join('\n');
        }
        return '';
    };

    const parseInstructions = (value: string) =>
        value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((instruction, index) => ({ stepNumber: index + 1, instruction }));

    const handleCookPress = (recipe: Recipe) => {
        const baseServings = Number(recipe.servings) || 1;
        let maxServings = Infinity;
        let limitingName: string | null = null;
        recipe.ingredients.forEach((ingredient) => {
            const inFridge = fridgeItems.find(item =>
                (ingredient.itemId && item.itemId && item.itemId === ingredient.itemId) ||
                (item.name && ingredient.name && item.name.toLowerCase() === ingredient.name.toLowerCase())
            );
            if (!inFridge) {
                maxServings = 0;
                limitingName = ingredient.name ?? null;
                return;
            }
            const recipeUnit = ingredient.unit ?? 'unit';
            const fridgeUnit = inFridge.unit ?? 'unit';
            if (!areUnitsCompatible(fridgeUnit, recipeUnit)) {
                return;
            }
            const requiredBase = normalizeQuantity(Number(ingredient.quantity), recipeUnit);
            const availableBase = normalizeQuantity(Number(inFridge.quantity), fridgeUnit);
            if (!Number.isFinite(requiredBase) || requiredBase <= 0 || !Number.isFinite(availableBase)) {
                return;
            }
            const possibleServings = (availableBase / requiredBase) * baseServings;
            if (possibleServings < maxServings) {
                maxServings = possibleServings;
                limitingName = ingredient.name ?? null;
            }
        });
        const resolvedMax = Number.isFinite(maxServings) ? Math.max(1, Math.floor(maxServings)) : baseServings;
        const initialServings = Math.min(baseServings, resolvedMax);
        setRecipeToCook(recipe);
        setMaxCookServings(resolvedMax);
        setCookServings(String(initialServings));
        setLimitingIngredient(limitingName);
        setCookModalVisible(true);
    };

    const handleGeminiCook = async () => {
        if (!fridgeItems.length) {
            Alert.alert('No items', 'Add items to your fridge first.');
            return;
        }
        if (geminiLoading) return;
        setGeminiLoading(true);
        try {
            const res = await fetch(`${API_URL}/recipes/generate`, {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify({
                    fridgeItems: fridgeItems.map((item) => ({
                        name: item.name,
                        category: item.category,
                        quantity: item.quantity,
                        unit: item.unit,
                    })),
                }),
            });
            if (!res.ok) {
                return;
            }
            const data = await res.json();
            const recipe = data?.recipe;
            if (!recipe?.name || !Array.isArray(recipe.ingredients)) {
                return;
            }
            recipe.isAiGenerated = true;
            const instructionsText = buildInstructionText(recipe.instructions);
            const resolvedIngredients = await Promise.all(
                recipe.ingredients.map(async (ingredient: Ingredient) => {
                    const resolved = await ensureItemByName(
                        API_URL,
                        getAuthHeaders,
                        userId,
                        ingredient.name,
                        'Recipe',
                    );
                    return {
                        name: ingredient.name,
                        quantity: Number(ingredient.quantity) || 1,
                        unit: ingredient.unit || 'unit',
                        itemId: resolved?.id ?? undefined,
                    };
                }),
            );
            setEditingRecipeId(null);
            setNewRecipeName(recipe.name);
            setNewIngredients(resolvedIngredients);
            setNewInstructionsText(instructionsText);
            setNewRecipeServings(
                Number.isFinite(Number(recipe.servings))
                    ? String(recipe.servings)
                    : '',
            );
            setIsPublicRecipe(true);
            setIsAiRecipe(true);
            setModalVisible(true);
        } catch (error) {
            return;
        } finally {
            setGeminiLoading(false);
        }
    };

    const handleAddPublicRecipe = async (recipe: Recipe) => {
        if (!householdId) {
            Alert.alert('Household required', 'Create or join a household to save recipes.');
            return;
        }
        const resolvedIngredients = await Promise.all(
            recipe.ingredients.map(async (ingredient) => {
                if (ingredient.itemId) {
                    return ingredient;
                }
                if (!ingredient.name) {
                    return null;
                }
                const resolved = await ensureItemByName(
                    API_URL,
                    getAuthHeaders,
                    userId,
                    ingredient.name,
                    'Recipe',
                );
                if (!resolved?.id) {
                    return null;
                }
                return {
                    ...ingredient,
                    itemId: resolved.id,
                    name: resolved.name ?? ingredient.name,
                };
            }),
        );
        if (resolvedIngredients.some((ingredient) => !ingredient)) {
            Alert.alert(
                'Missing items',
                'Some ingredients could not be matched to items.',
            );
            return;
        }
        await addRecipe({
            ...recipe,
            id: '',
            isPublic: false,
            isAiGenerated: recipe.isAiGenerated ?? false,
            ingredients: resolvedIngredients as Ingredient[],
        });
        setViewMode('household');
        Alert.alert('Saved', 'Recipe added to My Recipes.');
    };

    const handleEditPress = (recipe: Recipe) => {
        // Only allow editing own recipes (simple check)
        // Ideally backend enforces this, but UI should guide user.
        // For now we assume if it's in householdRecipes, we can edit it.
        if (viewMode === 'public') return;

        setEditingRecipeId(recipe.id);
        setNewRecipeName(recipe.name);
        setNewIngredients(recipe.ingredients.map(i => ({ ...i })));
        setIsPublicRecipe(!!recipe.isPublic);
        setIsAiRecipe(!!recipe.isAiGenerated);
        setNewRecipeServings(
            Number.isFinite(Number(recipe.servings))
                ? String(recipe.servings)
                : '',
        );
        setNewInstructionsText(buildInstructionText(recipe.instructions));
        setModalVisible(true);
    };

    const handleDeleteRecipe = (recipe: Recipe) => {
        const title = 'Delete recipe?';
        const message = `Remove "${recipe.name}" from My Recipes?`;
        if (Platform.OS === 'web') {
            const confirmed =
                typeof window !== 'undefined' ? window.confirm(message) : true;
            if (confirmed) {
                deleteRecipe(recipe.id);
            }
            return;
        }
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteRecipe(recipe.id) },
        ]);
    };

    const openNewRecipeModal = () => {
        setEditingRecipeId(null);
        setNewRecipeName('');
        setNewIngredients([]);
        setIsPublicRecipe(false);
        setIsAiRecipe(false);
        setNewRecipeServings('');
        setNewInstructionsText('');
        setModalVisible(true);
    };

    const openYoutubeModal = () => {
        setYoutubeUrl('');
        setYoutubeError(null);
        setYoutubeModalVisible(true);
    };

    const openArticleModal = () => {
        setArticleUrl('');
        setArticleError(null);
        setArticleModalVisible(true);
    };

    const handleYoutubeSubmit = async () => {
        if (!youtubeUrl.trim()) {
            setYoutubeError('Please enter a YouTube URL');
            return;
        }

        setYoutubeLoading(true);
        setYoutubeError(null);

        try {
            const res = await fetch(`${API_URL}/recipes/from-youtube`, {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify({ youtubeUrl: youtubeUrl.trim() }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Failed to extract recipe' }));
                throw new Error(errorData.error || 'Failed to extract recipe');
            }

            const data = await res.json();
            const recipe = data?.recipe;

            if (!recipe?.name || !Array.isArray(recipe.ingredients)) {
                throw new Error('Invalid recipe data received');
            }

            // Resolve ingredients to itemIds
            const resolvedIngredients = await Promise.all(
                recipe.ingredients.map(async (ingredient: any) => {
                    const ingredientName = ingredient.name?.trim() || 'Unknown Ingredient';
                    const resolved = await ensureItemByName(
                        API_URL,
                        getAuthHeaders,
                        userId,
                        ingredientName,
                        'Recipe',
                    );
                    return {
                        name: ingredientName,
                        quantity: Number(ingredient.quantity) || 1,
                        unit: ingredient.unit?.trim() || 'unit',
                        itemId: resolved?.id ?? undefined,
                    };
                }),
            );

            // Pre-populate the recipe modal with YouTube data
            setEditingRecipeId(null);
            setNewRecipeName(recipe.name?.trim() || 'Untitled Recipe');
            setNewIngredients(resolvedIngredients.filter(ing => ing.name && ing.itemId));
            setNewInstructionsText(buildInstructionText(recipe.instructions) || '');
            setNewRecipeServings(
                Number.isFinite(Number(recipe.servings))
                    ? String(recipe.servings)
                    : '',
            );
            setIsPublicRecipe(false);
            setIsAiRecipe(false);

            // Close YouTube modal and open recipe modal
            setYoutubeModalVisible(false);
            setModalVisible(true);
        } catch (error: any) {
            setYoutubeError(error.message || 'Failed to extract recipe from YouTube');
        } finally {
            setYoutubeLoading(false);
        }
    };

    const handleArticleSubmit = async () => {
        if (!articleUrl.trim()) {
            setArticleError('Please enter an article URL');
            return;
        }

        setArticleLoading(true);
        setArticleError(null);

        try {
            const res = await fetch(`${API_URL}/recipes/from-article`, {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify({ articleUrl: articleUrl.trim() }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Failed to extract recipe' }));
                throw new Error(errorData.error || 'Failed to extract recipe');
            }

            const data = await res.json();
            const recipe = data?.recipe;

            if (!recipe?.name || !Array.isArray(recipe.ingredients)) {
                throw new Error('Invalid recipe data received');
            }

            // Resolve ingredients to itemIds
            const resolvedIngredients = await Promise.all(
                recipe.ingredients.map(async (ingredient: any) => {
                    const ingredientName = ingredient.name?.trim() || 'Unknown Ingredient';
                    const resolved = await ensureItemByName(
                        API_URL,
                        getAuthHeaders,
                        userId,
                        ingredientName,
                        'Recipe',
                    );
                    return {
                        name: ingredientName,
                        quantity: Number(ingredient.quantity) || 1,
                        unit: ingredient.unit?.trim() || 'unit',
                        itemId: resolved?.id ?? undefined,
                    };
                }),
            );

            // Pre-populate the recipe modal with article data
            setEditingRecipeId(null);
            setNewRecipeName(recipe.name?.trim() || 'Untitled Recipe');
            setNewIngredients(resolvedIngredients.filter(ing => ing.name && ing.itemId));
            setNewInstructionsText(buildInstructionText(recipe.instructions) || '');
            setNewRecipeServings(
                Number.isFinite(Number(recipe.servings))
                    ? String(recipe.servings)
                    : '',
            );
            setIsPublicRecipe(false);
            setIsAiRecipe(false);

            // Close article modal and open recipe modal
            setArticleModalVisible(false);
            setModalVisible(true);
        } catch (error: any) {
            setArticleError(error.message || 'Failed to extract recipe from article');
        } finally {
            setArticleLoading(false);
        }
    };

    const confirmCook = () => {
        if (recipeToCook) {
            const parsed = Number(cookServings);
            const servings = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, maxCookServings)) : 1;
            cookRecipeFromFridge(recipeToCook, servings);
            setCookModalVisible(false);
            setRecipeToCook(null);
        }
    };

    const addIngredientToTemp = async () => {
        if (!currentIngName || !currentIngQty) return;
        let resolvedItemId = currentIngItemId;
        if (!resolvedItemId) {
            resolvedItemId = await resolveItemIdByName(currentIngName.trim());
        }
        if (!resolvedItemId) {
            setNewItemName(currentIngName.trim());
            setNewItemCategory('Other');
            setShowCreateItemModal(true);
            return;
        }
        setNewIngredients([...newIngredients, { name: currentIngName, itemId: resolvedItemId, quantity: parseFloat(currentIngQty), unit: currentIngUnit }]);
        setCurrentIngName('');
        setCurrentIngQty('');
        setCurrentIngItemId(null);
        Keyboard.dismiss();
    };

    const removeIngredient = (index: number) => {
        const updated = [...newIngredients];
        updated.splice(index, 1);
        setNewIngredients(updated);
    };

    const saveRecipe = () => {
        if (!newRecipeName || newIngredients.length === 0) return;

        const parsedServings = Number(newRecipeServings);
        const recipeData = {
            id: editingRecipeId || Math.random().toString(),
            name: newRecipeName,
            ingredients: newIngredients,
            instructions: parseInstructions(newInstructionsText),
            isPublic: isPublicRecipe,
            isAiGenerated: isAiRecipe,
            servings: Number.isFinite(parsedServings) ? parsedServings : undefined,
        };

        if (editingRecipeId) {
            updateRecipe(recipeData);
        } else {
            addRecipe(recipeData);
        }

        // Reset and close
        setNewRecipeName('');
        setNewIngredients([]);
        setIsPublicRecipe(false);
        setIsAiRecipe(false);
        setNewRecipeServings('');
        setNewInstructionsText('');
        setEditingRecipeId(null);
        setModalVisible(false);
    };

    return (
        <View style={styles.container}>
            {/* STABILIZED HEADER */}
            <View style={styles.headerContainer}>
                {/* Row 1: Title and Toggle (Fixed Positions) */}
                <View style={styles.headerTopRow}>
                    <Text style={Typography.header}>Recipes</Text>

                    {/* View Mode Toggle */}
                    <View style={styles.toggleContainer}>
                        <TouchableOpacity
                            style={[styles.toggleBtn, viewMode === 'household' && styles.toggleBtnActive]}
                            onPress={() => setViewMode('household')}
                        >
                            <Text style={[styles.toggleText, viewMode === 'household' && styles.toggleTextActive]}>My Recipes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.toggleBtn, viewMode === 'public' && styles.toggleBtnActive]}
                            onPress={() => setViewMode('public')}
                        >
                            <Text style={[styles.toggleText, viewMode === 'public' && styles.toggleTextActive]}>Discover</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.headerControlsRow}>
                    <View style={styles.controlsLeft}>
                        <View style={styles.filterRow}>
                            <TouchableOpacity
                                style={[styles.filterChip, hideAiRecipes && styles.filterChipActive]}
                                onPress={() => setHideAiRecipes((prev) => !prev)}
                            >
                                <Text style={[styles.filterChipText, hideAiRecipes && styles.filterChipTextActive]}>
                                    Hide AI recipes
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Sort Controls */}
                        <View style={styles.sortRow}>
                            <Text style={styles.sortLabel}>Sort by</Text>
                            <View style={styles.sortPills}>
                                <TouchableOpacity
                                    style={[styles.sortPill, sortBy === 'cost' && styles.sortPillActive]}
                                    onPress={() => setSortBy('cost')}
                                >
                                    <Text style={[styles.sortPillText, sortBy === 'cost' && styles.sortPillTextActive]}>
                                        Price
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.sortPill, sortBy === 'expiry' && styles.sortPillActive]}
                                    onPress={() => setSortBy('expiry')}
                                >
                                    <Text style={[styles.sortPillText, sortBy === 'expiry' && styles.sortPillTextActive]}>
                                        Expiry
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.sortPill, sortBy === 'missing' && styles.sortPillActive]}
                                    onPress={() => setSortBy('missing')}
                                >
                                    <Text style={[styles.sortPillText, sortBy === 'missing' && styles.sortPillTextActive]}>
                                        Missing
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.sortPill, sortBy === 'az' && styles.sortPillActive]}
                                    onPress={() => setSortBy('az')}
                                >
                                    <Text style={[styles.sortPillText, sortBy === 'az' && styles.sortPillTextActive]}>
                                        A-Z
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {viewMode === 'household' && (
                        <View style={styles.controlsRight}>
                            <View style={styles.buttonRow}>
                                <TouchableOpacity style={styles.centeredAddButton} onPress={openNewRecipeModal}>
                                    <Text style={styles.centeredAddButtonText}>+ New Recipe</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.centeredAddButton, styles.youtubeButton]} onPress={openYoutubeModal}>
                                    <Text style={styles.centeredAddButtonText}>+ From YouTube</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.centeredAddButton, styles.articleButton]} onPress={openArticleModal}>
                                    <Text style={styles.centeredAddButtonText}>+ From Article</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity
                                onPress={handleGeminiCook}
                                style={[styles.geminiButton, geminiLoading && styles.geminiButtonDisabled]}
                                disabled={geminiLoading}
                            >
                                <LinearGradient
                                    colors={['#2f80ff', '#8a5cff']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.geminiGradient}
                                >
                                    {geminiLoading ? (
                                        <ActivityIndicator color="white" />
                                    ) : (
                                        <Text style={styles.geminiButtonText}>Cook with Gemini</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View style={styles.searchRow}>
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search recipes or ingredients"
                        placeholderTextColor={Colors.light.textMuted}
                        style={styles.searchInput}
                    />
                </View>
            </View>

            {loadingPublic && viewMode === 'public' ? (
                <ActivityIndicator size="large" color={Colors.light.primary} style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    key={numColumns}
                    numColumns={numColumns}
                    columnWrapperStyle={numColumns > 1 ? { gap } : undefined}
                    data={getSortedRecipes()}
                    keyExtractor={r => r.id}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>
                            {viewMode === 'household' ? "No recipes yet. Add one!" : "No public recipes found."}
                        </Text>
                    }
                    renderItem={({ item }) => {
                        const { missingCount, minDaysToExpiry, totalCost } = item.meta;
                        const isExpiring = minDaysToExpiry < 3;
                        const isReady = missingCount === 0;

                        return (
                            <Card
                                variant="elevated"
                                style={[
                                    styles.cardLayout,
                                    { width: numColumns > 1 ? cardWidth : '100%' },
                                    isExpiring && sortBy === 'expiry' && styles.expiringBorder
                                ]}
                            >
                                <TouchableOpacity
                                    style={{ flex: 1 }}
                                    onPress={() => {
                                        setRecipeToView(item);
                                        setDetailsModalVisible(true);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <View>
                                        <View style={styles.recipeTitleRow}>
                                            <Text style={styles.recipeName}>{item.name}</Text>
                                            {item.isAiGenerated && (
                                                <View style={styles.aiBadge}>
                                                    <Text style={styles.aiBadgeText}>AI</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.recipeDetail}>{isReady ? "✅ Ready to cook!" : `Missing ${missingCount} ingredients`}</Text>

                                        <View style={{ flexDirection: 'row', marginTop: 5, gap: 5 }}>
                                            <View style={styles.metaTag}><Text style={styles.metaText}>${totalCost.toFixed(2)}</Text></View>
                                            {minDaysToExpiry < 100 && (
                                                <View style={[styles.metaTag, isExpiring ? { backgroundColor: Colors.light.dangerBg } : {}]}>
                                                    <Text style={[styles.metaText, isExpiring ? { color: Colors.light.danger } : {}]}>{minDaysToExpiry < 0 ? 'Expired' : `${Math.ceil(minDaysToExpiry)}d left`}</Text>
                                                </View>
                                            )}
                                        </View>
                                        {isReady && (
                                            <TouchableOpacity style={[styles.cookButton, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => handleCookPress(item)}>
                                                <Text style={styles.cookButtonText}>Cook</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </TouchableOpacity>

                                <View style={styles.cardActions}>
                                    {viewMode === 'household' && (
                                        <TouchableOpacity onPress={() => handleEditPress(item)}>
                                            <Text style={{ fontSize: 10, color: Colors.light.textSecondary }}>Edit</Text>
                                        </TouchableOpacity>
                                    )}
                                    {viewMode === 'household' && (
                                        <TouchableOpacity onPress={() => handleDeleteRecipe(item)}>
                                            <Text style={{ fontSize: 10, color: Colors.light.danger }}>Delete</Text>
                                        </TouchableOpacity>
                                    )}
                                    {viewMode === 'public' && (
                                        <TouchableOpacity onPress={() => handleAddPublicRecipe(item)}>
                                            <Text style={{ fontSize: 10, color: Colors.light.textSecondary }}>Add</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        onPress={() => {
                                            const items = item.ingredients
                                                .map((i) => ({
                                                    name: i.name?.trim() || '',
                                                    category: 'Recipe',
                                                    price: 0,
                                                    fromRecipe: item.name,
                                                    unit: i.unit,
                                                    quantity: i.quantity,
                                                }))
                                                .filter((i) => i.name);
                                            if (!items.length) return;
                                            addItemsToGroceryList(items);
                                        }}
                                    >
                                        <Text style={{ fontSize: 10, color: Colors.light.tint }}>+ List</Text>
                                    </TouchableOpacity>
                                </View>
                            </Card>
                        );
                    }}
                />
            )}

            {/* Modal for Creating/Editing Recipe */}
            <Modal visible={modalVisible} animationType="slide">
                <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContainer}>
                    <Text style={Typography.header}>{editingRecipeId ? 'Edit Recipe' : 'New Recipe'}</Text>
                    <Text style={Typography.label}>Recipe Name</Text>
                    <TextInput style={styles.input} placeholder="e.g. Stew" value={newRecipeName} onChangeText={setNewRecipeName} />

                    <Text style={Typography.label}>Servings</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. 4"
                        value={newRecipeServings}
                        onChangeText={setNewRecipeServings}
                        keyboardType="numeric"
                    />

                    <View style={styles.switchRow}>
                        <Text style={styles.switchLabel}>Make Public (Visible to everyone)</Text>
                        <Switch
                            value={isPublicRecipe}
                            onValueChange={setIsPublicRecipe}
                            trackColor={{ false: Colors.light.border, true: Colors.light.success }}
                        />
                    </View>

                    <View style={styles.modalSplitRow}>
                        <View
                            style={styles.modalColumn}
                            onLayout={(event) => {
                                const height = event.nativeEvent.layout.height;
                                if (!leftColumnHeight && height > 0) {
                                    setLeftColumnHeight(height);
                                }
                            }}
                        >
                            <Text style={Typography.label}>Add Ingredient</Text>
                            <View style={styles.ingInputRow}>
                                <View style={{ flex: 2 }}>
                                    <TextInput
                                        style={[styles.input, { marginBottom: 0 }]}
                                        placeholder="Item"
                                        value={currentIngName}
                                        onChangeText={(value) => {
                                            setCurrentIngName(value);
                                            setCurrentIngItemId(null);
                                        }}
                                    />
                                    {(filteredSuggestions.length > 0 || (!hasExactMatch && currentIngName.trim())) && (
                                        <View style={styles.suggestionBox}>
                                            {filteredSuggestions.slice(0, 6).map(item => (
                                                <TouchableOpacity
                                                    key={item.name}
                                                    style={styles.suggestionItem}
                                                    onPress={() => {
                                                        setCurrentIngName(item.name);
                                                        setCurrentIngItemId(item.id ?? null);
                                                    }}
                                                >
                                                    <Text style={styles.suggestionText}>{item.name}</Text>
                                                </TouchableOpacity>
                                            ))}
                                            {!hasExactMatch && currentIngName.trim() && (
                                                <TouchableOpacity
                                                    style={[styles.suggestionItem, styles.suggestionCreate]}
                                                    onPress={() => {
                                                        setNewItemName(currentIngName.trim());
                                                        setNewItemCategory('Other');
                                                        setShowCreateItemModal(true);
                                                    }}
                                                >
                                                    <Text style={styles.suggestionCreateText}>
                                                        Create "{currentIngName.trim()}"
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                </View>
                                <TextInput style={[styles.input, { flex: 1, marginBottom: 0, marginLeft: 10 }]} placeholder="Qty" keyboardType="numeric" value={currentIngQty} onChangeText={setCurrentIngQty} />
                                <TouchableOpacity style={styles.addIngBtn} onPress={addIngredientToTemp}><Text style={styles.addIngText}>+</Text></TouchableOpacity>
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitRow}>
                                {UNITS.map(unit => (
                                    <TouchableOpacity key={unit} style={[styles.unitChip, currentIngUnit === unit && styles.activeUnitChip]} onPress={() => setCurrentIngUnit(unit)}>
                                        <Text style={[styles.unitText, currentIngUnit === unit && styles.activeUnitText]}>{unit}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <Text style={[Typography.label, { marginTop: 20 }]}>Ingredients:</Text>
                            <ScrollView style={styles.ingList}>
                                {newIngredients.map((ing, index) => (
                                    <View key={index} style={styles.ingItemRow}>
                                        <TouchableOpacity onPress={() => removeIngredient(index)}>
                                            <Text style={{ color: Colors.light.danger, marginRight: 10, fontWeight: 'bold' }}>X</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.ingItemText}>• {ing.quantity} {ing.unit} {ing.name}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                        <View style={styles.modalColumn}>
                            <View style={styles.instructionsHeader}>
                                <Text style={[Typography.label, { marginTop: 0 }]}>Instructions</Text>
                                <TouchableOpacity
                                    style={styles.instructionsToggle}
                                    onPress={() => setInstructionsExpanded((prev) => !prev)}
                                >
                                    <Text style={styles.instructionsToggleText}>
                                        {instructionsExpanded ? 'Collapse' : 'Expand'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View
                                style={[
                                    styles.instructionsContainer,
                                    {
                                        height: instructionsExpanded
                                            ? Math.max(leftColumnHeight || 240, 360)
                                            : (leftColumnHeight || 240),
                                    },
                                ]}
                            >
                                <TextInput
                                    style={[styles.input, styles.instructionsInput]}
                                    placeholder="One step per line"
                                    value={newInstructionsText}
                                    onChangeText={setNewInstructionsText}
                                    multiline
                                />
                            </View>
                        </View>
                    </View>

                    <View style={styles.modalActions}>
                        <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity onPress={saveRecipe} style={styles.saveBtn}><Text style={styles.saveText}>{editingRecipeId ? 'Update' : 'Save'} Recipe</Text></TouchableOpacity>
                    </View>
                </ScrollView>
            </Modal>

            {/* Modal for Creating Item */}
            <Modal visible={showCreateItemModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.createItemCard}>
                        <Text style={Typography.subHeader}>Create Item</Text>

                        <Text style={Typography.label}>Name</Text>
                        <TextInput style={styles.input} value={newItemName} onChangeText={setNewItemName} placeholder="Name" />

                        <Text style={Typography.label}>Category</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                            {KNOWN_CATEGORIES.map(cat => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[styles.categoryChip, newItemCategory === cat && styles.categoryChipActive]}
                                    onPress={() => setNewItemCategory(cat)}
                                >
                                    <Text style={[styles.categoryChipText, newItemCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setShowCreateItemModal(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={async () => {
                                const trimmed = newItemName.trim();
                                if (!trimmed) return;
                                try {
                                    const res = await fetch(`${API_URL}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ name: trimmed, category: newItemCategory }) });
                                    if (res.ok) {
                                        const d = await res.json();
                                        setCurrentIngName(d.name || trimmed);
                                        setCurrentIngItemId(d.id || d._id);
                                    }
                                } catch (e) { } finally { setShowCreateItemModal(false); }
                            }} style={styles.saveBtn}><Text style={styles.saveText}>Create</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal for Confirmation of Cook */}
            <Modal visible={cookModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.createItemCard}>
                        <Text style={Typography.subHeader}>Cook {recipeToCook?.name}?</Text>
                        <Text style={{ color: Colors.light.textSecondary, marginVertical: 10 }}>
                            This will remove the ingredients from your fridge.
                        </Text>
                        <Text style={Typography.label}>Servings made</Text>
                        <View style={styles.cookServingsRow}>
                            <TouchableOpacity
                                style={styles.cookServingsBtn}
                                onPress={() => {
                                    const next = Math.max(1, Number(cookServings) - 1);
                                    setCookServings(String(next));
                                }}
                            >
                                <Text style={styles.cookServingsBtnText}>-</Text>
                            </TouchableOpacity>
                            <TextInput
                                style={styles.cookServingsInput}
                                keyboardType="numeric"
                                value={cookServings}
                                onChangeText={(value) => setCookServings(value.replace(/[^0-9.]/g, ''))}
                            />
                            <TouchableOpacity
                                style={styles.cookServingsBtn}
                                onPress={() => {
                                    const next = Math.min(maxCookServings, Number(cookServings) + 1);
                                    setCookServings(String(next));
                                }}
                            >
                                <Text style={styles.cookServingsBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.cookServingsHint}>Max: {maxCookServings}</Text>
                        {limitingIngredient && (
                            <Text style={styles.cookServingsHint}>
                                Limited by: {limitingIngredient}
                            </Text>
                        )}
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setCookModalVisible(false)} style={styles.cancelBtn}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={confirmCook} style={[styles.saveBtn, { backgroundColor: Colors.light.success }]}>
                                <Text style={styles.saveText}>Cook</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal for Recipe Details */}
            <Modal visible={detailsModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.createItemCard}>
                        <ScrollView contentContainerStyle={styles.detailsScroll}>
                            <View style={styles.detailsTitleRow}>
                                <Text style={Typography.subHeader}>{recipeToView?.name}</Text>
                                {recipeToView?.isAiGenerated && (
                                    <View style={styles.aiBadge}>
                                        <Text style={styles.aiBadgeText}>AI</Text>
                                    </View>
                                )}
                            </View>
                        {recipeToView?.sourceUrl ? (
                            <TouchableOpacity
                                onPress={async () => {
                                    try {
                                        await Linking.openURL(recipeToView.sourceUrl as string);
                                    } catch (error) {
                                        return;
                                    }
                                }}
                            >
                                <Text style={{ color: Colors.light.tint, marginTop: 6 }}>
                                    View full recipe
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                        <View style={styles.modalSplitRow}>
                            <View style={styles.modalColumn}>
                                <Text style={[Typography.label, { marginTop: 16 }]}>Ingredients</Text>
                                <View style={{ marginTop: 8 }}>
                                    {(() => {
                                        const ingredients = recipeToView?.ingredients || [];
                                        const groups = groupIngredientsBySource(ingredients);
                                        const renderGroup = (title: string, items: Ingredient[]) => {
                                            if (!items.length) return null;
                                            return (
                                                <View style={{ marginBottom: 12 }}>
                                                    <Text style={Typography.caption}>{title}</Text>
                                                    {items.map((ingredient, index) => (
                                                        <View key={`${title}-${ingredient.name}-${index}`} style={styles.ingItemRow}>
                                                            <Text style={styles.ingItemText}>
                                                                • {ingredient.quantity} {ingredient.unit} {ingredient.name}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            );
                                        };
                                        return (
                                            <View>
                                                {renderGroup('In fridge', groups.fridge)}
                                                {renderGroup('On grocery list', groups.list)}
                                                {renderGroup('Missing', groups.missing)}
                                            </View>
                                        );
                                    })()}
                                </View>
                            </View>
                            <View style={styles.modalColumn}>
                                <Text style={[Typography.label, { marginTop: 16 }]}>Instructions</Text>
                                <View style={{ marginTop: 8 }}>
                                    {buildInstructionText(recipeToView?.instructions)
                                        .split('\n')
                                        .filter(Boolean)
                                        .map((line, index) => (
                                            <Text key={`${line}-${index}`} style={styles.instructionLine}>
                                                {index + 1}. {line}
                                            </Text>
                                        ))}
                                </View>
                            </View>
                        </View>
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setDetailsModalVisible(false)} style={styles.cancelBtn}>
                                <Text style={styles.cancelText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Modal for YouTube URL Input */}
            <Modal visible={youtubeModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.createItemCard}>
                        <Text style={Typography.subHeader}>Add Recipe from YouTube</Text>
                        <Text style={{ color: Colors.light.textSecondary, marginVertical: 10 }}>
                            Enter a YouTube URL to extract the recipe
                        </Text>

                        <Text style={Typography.label}>YouTube URL</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={youtubeUrl}
                            onChangeText={setYoutubeUrl}
                            editable={!youtubeLoading}
                        />

                        {youtubeError && (
                            <Text style={styles.errorText}>{youtubeError}</Text>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                onPress={() => setYoutubeModalVisible(false)}
                                style={styles.cancelBtn}
                                disabled={youtubeLoading}
                            >
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleYoutubeSubmit}
                                style={[styles.saveBtn, youtubeLoading && styles.geminiButtonDisabled]}
                                disabled={youtubeLoading}
                            >
                                {youtubeLoading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.saveText}>Extract Recipe</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal for Article URL Input */}
            <Modal visible={articleModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.createItemCard}>
                        <Text style={Typography.subHeader}>Add Recipe from Article</Text>
                        <Text style={{ color: Colors.light.textSecondary, marginVertical: 10 }}>
                            Enter a recipe article URL (blog, newspaper, etc.)
                        </Text>

                        <Text style={Typography.label}>Article URL</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="https://example.com/recipe-article"
                            value={articleUrl}
                            onChangeText={setArticleUrl}
                            editable={!articleLoading}
                        />

                        {articleError && (
                            <Text style={styles.errorText}>{articleError}</Text>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                onPress={() => setArticleModalVisible(false)}
                                style={styles.cancelBtn}
                                disabled={articleLoading}
                            >
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleArticleSubmit}
                                style={[styles.saveBtn, articleLoading && styles.geminiButtonDisabled]}
                                disabled={articleLoading}
                            >
                                {articleLoading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.saveText}>Extract Recipe</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: Spacing.xl, paddingTop: 60, backgroundColor: Colors.light.background },

    // NEW HEADER STYLES
    headerContainer: { marginBottom: Spacing.l },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

    // Centered Add Button
    buttonRow: {
        flexDirection: 'row',
        gap: 10,
        alignSelf: 'flex-end',
    },
    centeredAddButton: {
        alignSelf: 'flex-end',
        backgroundColor: Colors.light.primary,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: BorderRadius.l,
        ...Shadows.soft
    },
    youtubeButton: {
        backgroundColor: '#FF0000',
    },
    articleButton: {
        backgroundColor: '#FF6B35',
    },
    centeredAddButtonText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 16
    },
    errorText: {
        color: Colors.light.danger,
        fontSize: 14,
        marginTop: -10,
        marginBottom: 10,
    },
    headerControlsRow: {
        flexDirection: 'row',
        gap: 24,
        alignItems: 'stretch',
        marginTop: Spacing.m,
    },
    controlsLeft: { flex: 1 },
    controlsRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
    filterRow: { flexDirection: 'row', justifyContent: 'flex-start' },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BorderRadius.l,
        backgroundColor: Colors.light.secondary,
    },
    filterChipActive: { backgroundColor: Colors.light.primary },
    filterChipText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary },
    filterChipTextActive: { color: 'white' },
    geminiButton: {
        borderRadius: BorderRadius.l,
        overflow: 'hidden',
        alignSelf: 'flex-end',
        ...Shadows.soft,
    },
    geminiGradient: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        alignItems: 'center',
        borderRadius: BorderRadius.l,
    },
    geminiButtonText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 15,
    },
    geminiButtonDisabled: { opacity: 0.7 },

    // Toggle Styles
    toggleContainer: { flexDirection: 'row', backgroundColor: Colors.light.secondary, borderRadius: BorderRadius.l, padding: 3 },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: BorderRadius.m },
    toggleBtnActive: { backgroundColor: Colors.light.background, ...Shadows.soft },
    toggleText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
    toggleTextActive: { color: Colors.light.text },

    sortRow: { marginTop: Spacing.s },
    sortLabel: { ...Typography.caption, color: Colors.light.textSecondary, marginBottom: 6 },
    sortPills: { flexDirection: 'row', gap: 8 },
    sortPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: Colors.light.secondary },
    sortPillActive: { backgroundColor: Colors.light.primary },
    sortPillText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary },
    sortPillTextActive: { color: 'white' },
    searchRow: { marginTop: Spacing.s },
    searchInput: {
        borderWidth: 1,
        borderColor: Colors.light.border,
        borderRadius: BorderRadius.m,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: Colors.light.background,
        color: Colors.light.text,
    },

    emptyText: { textAlign: 'center', marginTop: 40, color: Colors.light.textSecondary, fontSize: 16 },

    cardLayout: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.m,
    },
    expiringBorder: { borderWidth: 2, borderColor: Colors.light.danger },

    recipeName: { fontSize: 16, fontWeight: '600', color: Colors.light.text },
    recipeDetail: { ...Typography.caption, marginTop: 2 },
    recipeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    aiBadge: { backgroundColor: '#0ea5e9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    aiBadgeText: { color: 'white', fontWeight: '700', fontSize: 11, letterSpacing: 0.3 },

    metaTag: { backgroundColor: Colors.light.background, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
    metaText: { fontSize: 11, fontWeight: '600', color: Colors.light.textSecondary },

    cardActions: {
        alignItems: 'flex-end',
        gap: 8,
        flexWrap: 'wrap',
        maxWidth: 80,
    },
    cookButton: { backgroundColor: Colors.light.success, paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.s },
    cookButtonText: { color: 'white', fontWeight: '600', fontSize: 12 },
    cookServingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    cookServingsBtn: { backgroundColor: Colors.light.secondary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: BorderRadius.s },
    cookServingsBtnText: { fontSize: 18, fontWeight: '600', color: Colors.light.text },
    cookServingsInput: {
        borderWidth: 1,
        borderColor: Colors.light.border,
        borderRadius: BorderRadius.s,
        paddingVertical: 6,
        paddingHorizontal: 10,
        minWidth: 60,
        textAlign: 'center',
        color: Colors.light.text,
    },
    cookServingsHint: { ...Typography.caption, color: Colors.light.textSecondary, marginTop: 6 },

    // Modal Styles
    modalContainer: { flex: 1, padding: 30, paddingTop: 80, backgroundColor: Colors.light.card },
    modalScroll: { flex: 1 },
    detailsScroll: { paddingBottom: 12 },
    input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: BorderRadius.s, padding: 12, fontSize: 16, marginBottom: 20, backgroundColor: Colors.light.background },
    instructionsInput: { minHeight: 120, textAlignVertical: 'top', flex: 1, marginBottom: 0 },
    modalSplitRow: { flexDirection: 'row', gap: 24, marginTop: 8, alignItems: 'stretch' },
    modalColumn: { flex: 1, minWidth: 240, alignSelf: 'stretch' },
    instructionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    instructionsToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.m, backgroundColor: Colors.light.secondary },
    instructionsToggleText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary },
    instructionsContainer: { marginTop: 8 },

    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        backgroundColor: Colors.light.background,
        padding: 12,
        borderRadius: BorderRadius.s,
        borderWidth: 1,
        borderColor: Colors.light.border
    },
    switchLabel: {
        fontSize: 16,
        color: Colors.light.text,
        fontWeight: '500'
    },

    ingInputRow: { flexDirection: 'row', marginBottom: 15 },
    addIngBtn: { backgroundColor: Colors.light.primary, width: 50, marginLeft: 10, borderRadius: BorderRadius.s, justifyContent: 'center', alignItems: 'center' },
    addIngText: { color: 'white', fontSize: 24, fontWeight: '300' },
    suggestionBox: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.border, borderRadius: BorderRadius.s, marginTop: 8, overflow: 'hidden' },
    suggestionItem: { paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: Colors.light.border },
    suggestionText: { fontSize: 14, color: Colors.light.text },
    suggestionCreate: { backgroundColor: Colors.light.primaryBg },
    suggestionCreateText: { fontSize: 14, color: Colors.light.primary, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    createItemCard: { backgroundColor: Colors.light.card, borderRadius: BorderRadius.l, padding: 20, ...Shadows.strong },
    categoryRow: { marginTop: 8, marginBottom: 12 },
    categoryChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.l, backgroundColor: Colors.light.secondary, marginRight: 8 },
    categoryChipActive: { backgroundColor: Colors.light.primary },
    categoryChipText: { fontSize: 13, color: Colors.light.textSecondary, fontWeight: '600' },
    categoryChipTextActive: { color: 'white' },
    unitRow: { flexDirection: 'row', maxHeight: 40, marginBottom: 10 },
    unitChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.xl, backgroundColor: Colors.light.secondary, marginRight: 8, height: 35, justifyContent: 'center' },
    activeUnitChip: { backgroundColor: Colors.light.primary },
    unitText: { fontSize: 13, color: Colors.light.textSecondary, fontWeight: '600' },
    activeUnitText: { color: 'white' },
    ingList: { maxHeight: 260, minHeight: 140, marginBottom: 20, backgroundColor: Colors.light.background, padding: 10, borderRadius: BorderRadius.s },
    ingItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    ingItemText: { fontSize: 15, color: Colors.light.text },
    instructionLine: { fontSize: 15, color: Colors.light.textSecondary, marginBottom: 6 },
    modalActions: { flexDirection: 'row', gap: 15, marginTop: 16 },
    cancelBtn: { flex: 1, padding: 15, borderRadius: 10, backgroundColor: Colors.light.secondary, alignItems: 'center' },
    saveBtn: { flex: 2, padding: 15, borderRadius: 10, backgroundColor: Colors.light.primary, alignItems: 'center' },
    cancelText: { fontWeight: '600', color: Colors.light.textSecondary },
    saveText: { fontWeight: '600', color: 'white' }
});
