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
    Switch
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { Recipe, Ingredient } from '../../types';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';
import { fetchItemPrices } from '../../context/appContext/api';

type SortOption = 'missing' | 'expiry' | 'cost' | 'sale';
type ViewMode = 'household' | 'public';

export default function RecipesScreen() {
    const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
    const { width } = useWindowDimensions();
    const numColumns = width > 1024 ? 3 : width > 700 ? 2 : 1;
    const gap = Spacing.m;
    const padding = Spacing.xl;
    const cardWidth = (width - (padding * 2) - (gap * (numColumns - 1))) / numColumns;

    const { recipes: householdRecipes, fridgeItems, groceryList, addRecipe, updateRecipe, addToGroceryList, cookRecipeFromFridge, userId, householdId } = useApp();

    // UI State
    const [viewMode, setViewMode] = useState<ViewMode>('household');
    const [modalVisible, setModalVisible] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>('missing');

    // Cook Modal State
    const [cookModalVisible, setCookModalVisible] = useState(false);
    const [recipeToCook, setRecipeToCook] = useState<Recipe | null>(null);

    // Data State
    const [publicRecipes, setPublicRecipes] = useState<Recipe[]>([]);
    const [loadingPublic, setLoadingPublic] = useState(false);
    const [prices, setPrices] = useState<Map<string, number>>(new Map());

    // Form State
    const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
    const [newRecipeName, setNewRecipeName] = useState('');
    const [isPublicRecipe, setIsPublicRecipe] = useState(false);

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
                .then(data => setPublicRecipes(data))
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
                const priceMap = await fetchItemPrices(API_URL, getAuthHeaders, userId, itemIds);
                setPrices(prev => {
                    const next = new Map(prev);
                    priceMap.forEach((v, k) => next.set(k, v));
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
                totalCost += (prices.get(ing.itemId) || 0);
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

    const getSortedRecipes = () => activeRecipes.map(r => ({ ...r, meta: getRecipeMetadata(r) }));

    const handleCookPress = (recipe: Recipe) => {
        setRecipeToCook(recipe);
        setCookModalVisible(true);
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
        setModalVisible(true);
    };

    const openNewRecipeModal = () => {
        setEditingRecipeId(null);
        setNewRecipeName('');
        setNewIngredients([]);
        setIsPublicRecipe(false);
        setModalVisible(true);
    };

    const confirmCook = () => {
        if (recipeToCook) {
            cookRecipeFromFridge(recipeToCook);
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

        const recipeData = {
            id: editingRecipeId || Math.random().toString(),
            name: newRecipeName,
            ingredients: newIngredients,
            isPublic: isPublicRecipe
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

                {/* Row 2: Centered Action Button */}
                {viewMode === 'household' && (
                    <TouchableOpacity style={styles.centeredAddButton} onPress={openNewRecipeModal}>
                        <Text style={styles.centeredAddButtonText}>+ New Recipe</Text>
                    </TouchableOpacity>
                )}
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
                                    onPress={() => handleEditPress(item)}
                                    activeOpacity={0.7}
                                >
                                    <View>
                                        <Text style={styles.recipeName}>{item.name}</Text>
                                        <Text style={styles.recipeDetail}>{isReady ? "✅ Ready to cook!" : `Missing ${missingCount} ingredients`}</Text>

                                        <View style={{ flexDirection: 'row', marginTop: 5, gap: 5 }}>
                                            <View style={styles.metaTag}><Text style={styles.metaText}>${totalCost.toFixed(2)}</Text></View>
                                            {minDaysToExpiry < 100 && (
                                                <View style={[styles.metaTag, isExpiring ? { backgroundColor: Colors.light.dangerBg } : {}]}>
                                                    <Text style={[styles.metaText, isExpiring ? { color: Colors.light.danger } : {}]}>{minDaysToExpiry < 0 ? 'Expired' : `${Math.ceil(minDaysToExpiry)}d left`}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>

                                <View style={{ alignItems: 'flex-end', gap: 5 }}>
                                    {isReady && (
                                        <TouchableOpacity style={styles.cookButton} onPress={() => handleCookPress(item)}>
                                            <Text style={styles.cookButtonText}>Cook</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity onPress={() => item.ingredients.forEach(i => addToGroceryList(i.name, 'Recipe', 0))}>
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
                <View style={styles.modalContainer}>
                    <Text style={Typography.header}>{editingRecipeId ? 'Edit Recipe' : 'New Recipe'}</Text>
                    <Text style={Typography.label}>Recipe Name</Text>
                    <TextInput style={styles.input} placeholder="e.g. Stew" value={newRecipeName} onChangeText={setNewRecipeName} />

                    <View style={styles.switchRow}>
                        <Text style={styles.switchLabel}>Make Public (Visible to everyone)</Text>
                        <Switch
                            value={isPublicRecipe}
                            onValueChange={setIsPublicRecipe}
                            trackColor={{ false: Colors.light.border, true: Colors.light.success }}
                        />
                    </View>

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

                    <View style={styles.modalActions}>
                        <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity onPress={saveRecipe} style={styles.saveBtn}><Text style={styles.saveText}>{editingRecipeId ? 'Update' : 'Save'} Recipe</Text></TouchableOpacity>
                    </View>
                </View>
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: Spacing.xl, paddingTop: 60, backgroundColor: Colors.light.background },

    // NEW HEADER STYLES
    headerContainer: { marginBottom: Spacing.l },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

    // Centered Add Button
    centeredAddButton: {
        alignSelf: 'center',
        backgroundColor: Colors.light.primary,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: BorderRadius.l,
        marginTop: Spacing.m,
        width: '60%',
        alignItems: 'center',
        ...Shadows.soft
    },
    centeredAddButtonText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 16
    },

    // Toggle Styles
    toggleContainer: { flexDirection: 'row', backgroundColor: Colors.light.secondary, borderRadius: BorderRadius.l, padding: 3 },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: BorderRadius.m },
    toggleBtnActive: { backgroundColor: Colors.light.background, ...Shadows.soft },
    toggleText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
    toggleTextActive: { color: Colors.light.text },

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

    metaTag: { backgroundColor: Colors.light.background, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
    metaText: { fontSize: 11, fontWeight: '600', color: Colors.light.textSecondary },

    cookButton: { backgroundColor: Colors.light.success, paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.s },
    cookButtonText: { color: 'white', fontWeight: '600', fontSize: 12 },

    // Modal Styles
    modalContainer: { flex: 1, padding: 30, paddingTop: 80, backgroundColor: Colors.light.card },
    input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: BorderRadius.s, padding: 12, fontSize: 16, marginBottom: 20, backgroundColor: Colors.light.background },

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
    ingList: { maxHeight: 200, marginBottom: 30, backgroundColor: Colors.light.background, padding: 10, borderRadius: BorderRadius.s },
    ingItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    ingItemText: { fontSize: 16, color: Colors.light.text },
    modalActions: { flexDirection: 'row', gap: 15 },
    cancelBtn: { flex: 1, padding: 15, borderRadius: 10, backgroundColor: Colors.light.secondary, alignItems: 'center' },
    saveBtn: { flex: 2, padding: 15, borderRadius: 10, backgroundColor: Colors.light.primary, alignItems: 'center' },
    cancelText: { fontWeight: '600', color: Colors.light.textSecondary },
    saveText: { fontWeight: '600', color: 'white' }
});