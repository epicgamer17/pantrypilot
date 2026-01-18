import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, SectionList, StyleSheet, TouchableOpacity, useWindowDimensions, Modal, TextInput, Platform, Linking } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card'; // Import the Card component
import { SurfaceCard } from '../../components/ui/SurfaceCard';
import { Colors, Spacing, Typography, BorderRadius, Shadows, Layout, Forms } from '../../constants/theme';
import { areUnitsCompatible, denormalizeQuantity, normalizeQuantity } from '../../utils/unitConversion';
import ItemNameAutocomplete from '../../components/ItemNameAutocomplete';
import { Category, Item } from '../../types';

type SortMode = 'aisle' | 'recipe' | 'az';

export default function GroceryScreen() {
  const { width, height } = useWindowDimensions();
  const { groceryList, toggleGroceryItem, addToGroceryList, addItemsToGroceryList, updateGroceryItem, clearPurchasedItems, setAllGroceryItemsChecked, addItemsToFridge, fridgeItems, recipes, recentlyDepletedItems, purchaseHistory, userId, householdId } = useApp();
  const { userToken } = useAuth();
  const [sortMode, setSortMode] = useState<SortMode>('aisle');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Other');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [selectedPurchasedIds, setSelectedPurchasedIds] = useState<Set<string>>(new Set());
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnit, setEditUnit] = useState<Item['unit']>('unit');
  const [newItemQuantity, setNewItemQuantity] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState<Item['unit']>('unit');

  const CATEGORY_OPTIONS = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Beverages', 'Other'];
  const ALLOWED_UNITS: Item['unit'][] = ['unit', 'g', 'kg', 'ml', 'L', 'oz', 'lb', 'cup', 'ea', 'tbsp', 'tsp', 'clove', 'cloves', 'leaf', 'leaves', 'sprig', 'sprigs'];
  const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
  const STAPLE_NAMES = ['Milk', 'Eggs', 'Bread', 'Cheese', 'Rice', 'Bananas', 'Butter'];
  const [stapleItems, setStapleItems] = useState<{ name: string; category?: string }[]>([]);
  const shellWidth = Math.min(width - Spacing.xl * 2, Layout.pageMaxWidth);
  const isWide = width >= 1024;
  const isCompact = width < 700;
  const sidePanelWidth = isWide ? 320 : shellWidth;
  const listWidth = isWide ? shellWidth - sidePanelWidth - Spacing.xl : shellWidth;
  const listPadding = isCompact ? Spacing.xs : Spacing.s;
  const listHeight = Platform.OS === 'web' ? height - Spacing.l * 2 : undefined;

  const getAuthHeaders = () => {
    const headers: Record<string, string> = {};
    if (userId) headers['x-user-id'] = userId;
    if (householdId) headers['x-household-id'] = householdId;
    if (userToken) headers['Authorization'] = `Bearer ${userToken}`;
    return headers;
  };

  const handleReadEmails = async () => {
    try {
      console.log("Fetching latest unread emails...");
      // Using the API_URL already defined in your file (handles localhost/android emulator)
      const response = await fetch(`${API_URL}/emails/latest-bodies`, {
        method: 'GET',
        headers: getAuthHeaders(), // Using existing helper for user/household context
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const emailData = await response.json();

      // Print the results to the console as requested
      console.log('--- Email Vision Data ---');
      console.log(JSON.stringify(emailData, null, 2));

      if (emailData.length === 0) {
        console.log("No unread emails found.");
      }
    } catch (error) {
      console.error('Failed to read emails:', error);
    }
  };

  // 1. Recently Used (Finished or Binned)
  const recentItems = useMemo(() => {
    const candidates = purchaseHistory.length
      ? purchaseHistory
      : [...fridgeItems.filter(i => i.isUsed), ...recentlyDepletedItems];
    const isCooked = (item: { store?: string }) =>
      item.store?.toLowerCase() === 'cooked';

    // Deduplicate by name and sort by most recent interaction (using purchaseDate as proxy timestamp set in removeFromFridge)
    const seen = new Set<string>();
    return candidates
      .filter(i => {
        if (isCooked(i)) return false;
        if (seen.has(i.name)) return false;
        seen.add(i.name);
        return true;
      })
      .sort((a, b) => {
        const dateA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : new Date(a.date ?? 0).getTime();
        const dateB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : new Date(b.date ?? 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 10)
      .filter(i => !groceryList.some(g => g.name === i.name));
  }, [fridgeItems, groceryList, recentlyDepletedItems, purchaseHistory]);

  // 2. Common Staples
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const loadStaples = async () => {
      const results = await Promise.all(
        STAPLE_NAMES.map(async (name) => {
          try {
            const res = await fetch(
              `${API_URL}/items?search=${encodeURIComponent(name)}&limit=5`,
              { headers: getAuthHeaders() },
            );
            if (!res.ok) return null;
            const data = await res.json();
            if (!Array.isArray(data) || !data.length) return null;
            const exact = data.find(
              (item: { name?: string }) =>
                item.name?.toLowerCase?.() === name.toLowerCase(),
            );
            const match = exact ?? data[0];
            if (!match?.name) return null;
            return { name: match.name, category: match.category };
          } catch (error) {
            return null;
          }
        }),
      );
      if (!active) return;
      setStapleItems(results.filter(Boolean) as { name: string; category?: string }[]);
    };
    loadStaples();
    return () => {
      active = false;
    };
  }, [userId]);

  const commonStaples = stapleItems.filter(
    (item) => !groceryList.some((g) => g.name.toLowerCase() === item.name.toLowerCase()),
  );

  // --- MAIN LIST LOGIC ---
  const sections = useMemo(() => {
    const grouped: { [key: string]: any[] } = {};

    groceryList.forEach(item => {
      let key = 'Other';

      if (sortMode === 'az') {
        key = 'A-Z';
      } else if (sortMode === 'aisle') {
        key = item.aisle || 'Other';
      } else {
        key = item.fromRecipe || 'Manual / Other';
      }

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    return Object.keys(grouped).sort().map(title => ({
      title: title,
      data: grouped[title].sort((a, b) => a.name.localeCompare(b.name))
    }));
  }, [groceryList, sortMode]);

  const estimatedTotal = useMemo(() => {
    return groceryList.reduce((sum, item) => {
      const price = Number(item.targetPrice ?? 0);
      const qty = Number(item.quantity ?? 1);
      if (!Number.isFinite(price) || !Number.isFinite(qty)) {
        return sum;
      }
      return sum + price * qty;
    }, 0);
  }, [groceryList]);

  const hasCheckedItems = useMemo(
    () => groceryList.some((item) => item.checked),
    [groceryList],
  );
  const purchasedItems = useMemo(
    () => groceryList.filter((item) => item.checked),
    [groceryList],
  );

  const toFridgeItem = (item: any): Omit<Item, 'initialQuantity'> => {
    const packageQuantity = Number(item.packageQuantity);
    const packageUnit = item.packageUnit ?? item.unit;
    const packagePrice = Number(item.packagePrice);
    const unit = ALLOWED_UNITS.includes(packageUnit) ? packageUnit : 'unit';
    const category =
      CATEGORY_OPTIONS.includes(item.aisle) ? (item.aisle as Category) : 'Other';
    return {
      id: item.itemId ?? item.id,
      itemId: item.itemId ?? item.id,
      name: item.name,
      category,
      quantity: Number.isFinite(packageQuantity) && packageQuantity > 0 ? packageQuantity : (item.quantity ?? 1),
      unit,
      purchasePrice:
        Number.isFinite(packagePrice) && Number.isFinite(packageQuantity) && packageQuantity > 0
          ? packagePrice / packageQuantity
          : item.targetPrice ?? 0,
      purchaseDate: new Date().toISOString(),
      expiryDate: '',
      store: item.fromRecipe ? `Recipe: ${item.fromRecipe}` : 'Grocery',
      location: 'pantry',
      isUsed: false,
    };
  };

  const handleClearPurchased = () => {
    if (!purchasedItems.length) {
      clearPurchasedItems();
      return;
    }
    setSelectedPurchasedIds(new Set(purchasedItems.map((item) => item.id)));
    setMoveModalVisible(true);
  };

  const togglePurchasedSelection = (id: string) => {
    setSelectedPurchasedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleMoveSelectedToFridge = async () => {
    const selectedItems = purchasedItems.filter((item) =>
      selectedPurchasedIds.has(item.id),
    );
    if (!selectedItems.length) {
      clearPurchasedItems();
      setMoveModalVisible(false);
      return;
    }
    if (selectedItems.length) {
      const itemsToAdd = selectedItems.map(toFridgeItem);
      const added = await addItemsToFridge(itemsToAdd);
      if (!added) {
        return;
      }
    }
    clearPurchasedItems();
    setMoveModalVisible(false);
  };

  const formatUnit = (unit: string | undefined, quantity: number) => {
    if (!unit || unit === 'ea') return '';
    const noPluralUnits = new Set(['g', 'kg', 'ml', 'L', 'oz', 'tbsp', 'tsp']);
    if (quantity === 1 || noPluralUnits.has(unit)) {
      return unit;
    }
    if (unit === 'lb') {
      return 'lbs';
    }
    return `${unit}s`;
  };

  const handleRemoveAllPurchased = () => {
    setSelectedPurchasedIds(new Set());
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setEditName(item.name ?? '');
    setEditQuantity(String(item.quantity ?? 1));
    const unit = ALLOWED_UNITS.includes(item.unit) ? item.unit : 'unit';
    setEditUnit(unit);
    setEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    const qty = Number(editQuantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    updateGroceryItem(editingItem.id, {
      name: trimmedName,
      quantity: qty,
      unit: editUnit,
      aisle: editingItem.aisle,
    });
    setEditModalVisible(false);
  };

  const parseQuantityInput = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };

  const findExistingItem = (name: string) => {
    const normalized = name.trim().toLowerCase();
    return groceryList.find((item) => item.name?.toLowerCase() === normalized);
  };

  const applyQuantityUpdate = (name: string, quantity: number, unit: Item['unit'], category?: string) => {
    const existing = findExistingItem(name);
    if (!existing) return false;
    const existingUnit = (existing.unit as Item['unit']) ?? 'unit';
    if (!areUnitsCompatible(existingUnit, unit)) {
      return false;
    }
    const baseQty = normalizeQuantity(quantity, unit);
    const converted = denormalizeQuantity(baseQty, existingUnit);
    const nextQty = Number(existing.quantity ?? 0) + converted;
    updateGroceryItem(existing.id, { quantity: Number(nextQty.toFixed(2)), unit: existingUnit });
    return true;
  };

  const renderListHeader = () => (
    <>
      <SurfaceCard style={[styles.headerCard, isCompact && styles.headerCardCompact]} variant="soft">
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.pageTitle}>Shopping List</Text>
            <Text style={styles.pageSubtitle}>Stay stocked and keep recipes on track.</Text>
          </View>
          {!isCompact && (
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
              <MaterialCommunityIcons name="plus" size={24} color="white" />
            </TouchableOpacity>
          )}
        </View>
        {isCompact && (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.compactAction}
              onPress={() => setAllGroceryItemsChecked(true)}
            >
              <MaterialCommunityIcons name="check-all" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.compactActionText}>Select all</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleReadEmails}>
              <MaterialCommunityIcons name="email-sync" size={18} color={Colors.light.info} />
            </TouchableOpacity>
          </View>
        )}
        {!isCompact && (
          <View style={styles.headerActionsRow}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                setAllGroceryItemsChecked(true);
              }}
            >
              <Text style={styles.clearButtonText}>Select all</Text>
            </TouchableOpacity>
            {hasCheckedItems && (
              <TouchableOpacity style={styles.clearButton} onPress={handleClearPurchased}>
                <Text style={styles.clearButtonText}>Clear purchased</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.emailIconButton} onPress={handleReadEmails}>
              <MaterialCommunityIcons name="email-sync" size={16} color={Colors.light.info} />
            </TouchableOpacity>
          </View>
        )}
      </SurfaceCard>

      <SurfaceCard style={[styles.quickAddCard, isCompact && styles.quickAddCardCompact]}>
        <Text style={Typography.label}>Quick Add</Text>

        {isCompact ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickAddScroll}
            nestedScrollEnabled
            directionalLockEnabled
          >
            {recentItems.map(item => (
              <TouchableOpacity
                key={`recent-${item.id}`}
                style={[styles.chip, styles.chipRecent]}
                onPress={() =>
                  addToGroceryList(
                    item.name,
                    item.category,
                    (item as { price?: number }).price ?? item.purchasePrice,
                  )
                }
              >
                <MaterialCommunityIcons name="refresh" size={16} color={Colors.light.text} />
                <Text style={styles.chipText}>{item.name}</Text>
              </TouchableOpacity>
            ))}
            {commonStaples.map((item) => (
              <TouchableOpacity
                key={`staple-${item.name}`}
                style={[styles.chip, styles.chipStaple]}
                onPress={() => addToGroceryList(item.name, item.category ?? 'Other', 0)}
              >
                <MaterialCommunityIcons name="plus" size={16} color={Colors.light.info} />
                <Text style={styles.chipText}>{item.name}</Text>
              </TouchableOpacity>
            ))}
            {recipes.map(recipe => (
              <TouchableOpacity
                key={`recipe-${recipe.id}`}
                style={[styles.chip, styles.chipRecipe]}
                onPress={() => {
                  addItemsToGroceryList(
                    recipe.ingredients.map(ing => ({
                      name: ing.name,
                      category: undefined,
                      price: 0,
                      fromRecipe: recipe.name,
                      unit: ing.unit,
                      quantity: ing.quantity,
                    }))
                  );
                }}
              >
                <MaterialCommunityIcons name="chef-hat" size={16} color={Colors.light.warning} />
                <Text style={styles.chipText}>{recipe.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <>
            <View style={styles.quickAddSection}>
              <Text style={styles.quickAddTitle}>Recents</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickAddScroll}
                nestedScrollEnabled
                directionalLockEnabled
              >
                {recentItems.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.chip, styles.chipRecent]}
                    onPress={() =>
                      addToGroceryList(
                        item.name,
                        item.category,
                        (item as { price?: number }).price ?? item.purchasePrice,
                      )
                    }
                  >
                    <MaterialCommunityIcons name="refresh" size={16} color={Colors.light.text} />
                    <Text style={styles.chipText}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.quickAddDivider} />

            <View style={styles.quickAddSection}>
              <Text style={styles.quickAddTitle}>Staples</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickAddScroll}
                nestedScrollEnabled
                directionalLockEnabled
              >
                {commonStaples.map((item) => (
                  <TouchableOpacity
                    key={item.name}
                    style={[styles.chip, styles.chipStaple]}
                    onPress={() => addToGroceryList(item.name, item.category ?? 'Other', 0)}
                  >
                    <MaterialCommunityIcons name="plus" size={16} color={Colors.light.info} />
                    <Text style={styles.chipText}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.quickAddDivider} />

            <View style={styles.quickAddSection}>
              <Text style={styles.quickAddTitle}>Recipes</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickAddScroll}
                nestedScrollEnabled
                directionalLockEnabled
              >
                {recipes.map(recipe => (
                  <TouchableOpacity
                    key={recipe.id}
                    style={[styles.chip, styles.chipRecipe]}
                    onPress={() => {
                      addItemsToGroceryList(
                        recipe.ingredients.map(ing => ({
                          name: ing.name,
                          category: undefined,
                          price: 0,
                          fromRecipe: recipe.name,
                          unit: ing.unit,
                          quantity: ing.quantity,
                        }))
                      );
                    }}
                  >
                    <MaterialCommunityIcons name="chef-hat" size={16} color={Colors.light.warning} />
                    <Text style={styles.chipText}>{recipe.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </SurfaceCard>
    </>
  );

  return (
    <GestureHandlerRootView style={[styles.root, Platform.OS === 'web' && styles.rootWeb]}>
      <View style={[styles.page, Platform.OS === 'web' && styles.pageWeb]}>
        <View style={[styles.shell, { width: shellWidth }, isWide && styles.shellWide, isCompact && styles.shellCompact]}>
          {isWide && (
            <View style={[styles.sidePanel, { width: sidePanelWidth }]}>
              {renderListHeader()}
              <SurfaceCard style={styles.sortCard}>
                <Text style={Typography.label}>Sort</Text>
                <View style={styles.sortContainer}>
                  <TouchableOpacity
                    style={[styles.sortBtn, sortMode === 'aisle' && styles.sortBtnActive]}
                    onPress={() => setSortMode('aisle')}
                  >
                    <Text style={[styles.sortBtnText, sortMode === 'aisle' && styles.sortBtnTextActive]}>By Aisle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortBtn, sortMode === 'recipe' && styles.sortBtnActive]}
                    onPress={() => setSortMode('recipe')}
                  >
                    <Text style={[styles.sortBtnText, sortMode === 'recipe' && styles.sortBtnTextActive]}>By Recipe</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortBtn, sortMode === 'az' && styles.sortBtnActive]}
                    onPress={() => setSortMode('az')}
                  >
                    <Text style={[styles.sortBtnText, sortMode === 'az' && styles.sortBtnTextActive]}>A-Z</Text>
                  </TouchableOpacity>
                </View>
              </SurfaceCard>
            </View>
          )}
          <View style={[styles.listPanel, { width: isWide ? listWidth : shellWidth, height: listHeight }]}>
            {!isWide && (
              <View style={[styles.sortBar, { paddingHorizontal: listPadding }, isCompact && styles.sortBarCompact]}>
                <View style={styles.sortContainer}>
                  <TouchableOpacity
                    style={[styles.sortBtn, sortMode === 'aisle' && styles.sortBtnActive]}
                    onPress={() => setSortMode('aisle')}
                  >
                    <Text style={[styles.sortBtnText, sortMode === 'aisle' && styles.sortBtnTextActive]}>By Aisle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortBtn, sortMode === 'recipe' && styles.sortBtnActive]}
                    onPress={() => setSortMode('recipe')}
                  >
                    <Text style={[styles.sortBtnText, sortMode === 'recipe' && styles.sortBtnTextActive]}>By Recipe</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortBtn, sortMode === 'az' && styles.sortBtnActive]}
                    onPress={() => setSortMode('az')}
                  >
                    <Text style={[styles.sortBtnText, sortMode === 'az' && styles.sortBtnTextActive]}>A-Z</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <SectionList
              sections={sections}
              keyExtractor={item => item.id}
              style={[styles.list, Platform.OS === 'web' && styles.listWeb]}
              scrollEnabled
              contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: listPadding }}
              ListHeaderComponent={!isWide ? renderListHeader : undefined}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              stickySectionHeadersEnabled={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="cart-off" size={48} color={Colors.light.border} />
                  <Text style={styles.emptyText}>List is empty</Text>
                </View>
              }
              renderSectionHeader={({ section: { title } }) => (
                <Text style={styles.sectionHeader}>{title}</Text>
              )}
              renderItem={({ item }) => (
                <Card
                  variant="elevated"
                  onPress={() => toggleGroceryItem(item.id)}
                  style={styles.cardOverrides}
                >
                  <MaterialCommunityIcons
                    name={item.checked ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                    size={24}
                    color={item.checked ? Colors.light.success : Colors.light.border}
                  />
                  <View style={{ flex: 1, marginLeft: Spacing.m }}>
                    <Text style={[styles.itemName, item.checked && styles.itemChecked]}>
                      {Number(((item.quantity ?? 1) as number).toFixed(2))}
                      {formatUnit(item.unit, item.quantity ?? 1)
                        ? ` ${formatUnit(item.unit, item.quantity ?? 1)}`
                        : ''}{' '}
                      {item.name?.toLowerCase()}
                      {item.bestStoreItemName && item.packageQuantity
                        ? ` (${item.bestStoreItemName} ${item.packageQuantity}${
                            formatUnit(item.packageUnit, item.packageQuantity)
                              ? ` ${formatUnit(item.packageUnit, item.packageQuantity)}`
                              : ''
                          })`
                        : ''}
                    </Text>
                    {item.targetPrice > 0 && (
                      <Text style={Typography.caption}>
                        {Number(((item.quantity ?? 1) as number).toFixed(2))} x ${item.targetPrice.toFixed(2)} @ {item.bestStoreName || 'No store found'}
                      </Text>
                    )}
                    {item.targetPrice === 0 && (
                      <Text style={styles.estimateMissing}>No estimate</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(item)}
                  >
                    <MaterialCommunityIcons name="pencil" size={18} color={Colors.light.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, styles.linkButton]}
                    onPress={() => {
                      const storeUrl =
                        item.itemUrl ||
                        (item.bestStoreName || item.bestStoreItemName
                          ? `https://www.google.com/search?q=${encodeURIComponent(
                              `${item.bestStoreName ?? ''} ${item.bestStoreItemName ?? item.name ?? ''}`.trim()
                            )}`
                          : undefined);
                      if (storeUrl) {
                        Linking.openURL(storeUrl);
                      }
                    }}
                  >
                    <MaterialCommunityIcons
                      name="open-in-new"
                      size={18}
                      color={Colors.light.textSecondary}
                    />
                  </TouchableOpacity>
                </Card>
              )}
              ListFooterComponent={
                estimatedTotal > 0 ? (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Estimated total</Text>
                    <Text style={styles.totalValue}>${estimatedTotal.toFixed(2)}</Text>
                  </View>
                ) : null
              }
            />
          </View>
        </View>
      </View>

      {isCompact && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)}>
          <MaterialCommunityIcons name="plus" size={26} color="white" />
        </TouchableOpacity>
      )}

      <Modal visible={moveModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Organize Purchased Items</Text>
            <Text style={styles.modalSubtitle}>
              Move selected items to your pantry and remove the rest.
            </Text>

            <View style={styles.selectionActions}>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() =>
                  setSelectedPurchasedIds(new Set(purchasedItems.map((item) => item.id)))
                }
              >
                <Text style={styles.selectBtnText}>Select all purchased</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeAllBtn}
                onPress={handleRemoveAllPurchased}
              >
                <Text style={styles.removeAllBtnText}>Clear selection</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 240, marginTop: Spacing.m }}>
              {purchasedItems.map((item) => {
                const selected = selectedPurchasedIds.has(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.selectRow}
                    onPress={() => togglePurchasedSelection(item.id)}
                  >
                    <MaterialCommunityIcons
                      name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                      size={22}
                      color={selected ? Colors.light.success : Colors.light.border}
                    />
                    <Text style={styles.selectRowText}>{item.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setMoveModalVisible(false)}
              >
                <Text style={styles.cancelText}>Keep list</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                ]}
                onPress={handleMoveSelectedToFridge}
              >
                <Text style={styles.saveText}>Move selected to pantry</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit item</Text>
            <Text style={Typography.label}>Item name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={styles.input}
              placeholder="Item name"
            />
            <Text style={Typography.label}>Quantity</Text>
            <TextInput
              value={editQuantity}
              onChangeText={setEditQuantity}
              style={styles.input}
              keyboardType="numeric"
              placeholder="Quantity"
            />
            <Text style={Typography.label}>Unit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitRow}>
              {ALLOWED_UNITS.map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[styles.unitChip, editUnit === unit && styles.unitChipActive]}
                  onPress={() => setEditUnit(unit)}
                >
                  <Text style={[styles.unitChipText, editUnit === unit && styles.unitChipTextActive]}>{unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEdit}
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add item</Text>
            <Text style={Typography.label}>Item name</Text>
            <ItemNameAutocomplete
              value={newItemName}
              placeholder="e.g. Peanut butter"
              inputStyle={styles.input}
              showCreate
              onChangeText={(value) => {
                setNewItemName(value);
                setSelectedItemId(null);
              }}
              onSelectItem={(item) => {
                setNewItemName(item.name);
                setSelectedItemId(item.id);
              }}
              onCreate={(value) => {
                const quantity = parseQuantityInput(newItemQuantity);
                const merged = applyQuantityUpdate(value, quantity, newItemUnit, newItemCategory);
                if (!merged) {
                  addItemsToGroceryList([
                    {
                      name: value,
                      category: newItemCategory,
                      price: 0,
                      quantity,
                      unit: newItemUnit,
                    },
                  ]);
                }
                setShowAddModal(false);
                setNewItemName('');
                setSelectedItemId(null);
                setNewItemQuantity('1');
                setNewItemUnit('unit');
              }}
            />

            <Text style={Typography.label}>Quantity</Text>
            <TextInput
              value={newItemQuantity}
              onChangeText={setNewItemQuantity}
              style={styles.input}
              keyboardType="numeric"
              placeholder="1"
            />

            <Text style={Typography.label}>Unit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitRow}>
              {ALLOWED_UNITS.map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[styles.unitChip, newItemUnit === unit && styles.unitChipActive]}
                  onPress={() => setNewItemUnit(unit)}
                >
                  <Text style={[styles.unitChipText, newItemUnit === unit && styles.unitChipTextActive]}>{unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={Typography.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
              {CATEGORY_OPTIONS.map((cat) => (
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
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowAddModal(false);
                  setNewItemName('');
                  setSelectedItemId(null);
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => {
                  if (!newItemName.trim()) return;
                  const quantity = parseQuantityInput(newItemQuantity);
                  const merged = applyQuantityUpdate(newItemName.trim(), quantity, newItemUnit, newItemCategory);
                  if (!merged) {
                    addItemsToGroceryList([
                      {
                        name: newItemName.trim(),
                        category: newItemCategory,
                        price: 0,
                        quantity,
                        unit: newItemUnit,
                      },
                    ]);
                  }
                  setShowAddModal(false);
                  setNewItemName('');
                  setSelectedItemId(null);
                  setNewItemQuantity('1');
                  setNewItemUnit('unit');
                }}
              >
                <Text style={styles.saveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    height: '100%',
  },
  rootWeb: {
    height: '100vh',
  },
  page: { flex: 1, minHeight: 0, height: '100%', backgroundColor: Colors.light.background, paddingVertical: Spacing.l },
  pageWeb: {
    height: '100vh',
  },
  shell: {
    alignSelf: 'center',
    gap: Spacing.xl,
    flex: 1,
    width: '100%',
    minHeight: 0,
    flexGrow: 1,
    height: '100%',
  },
  shellCompact: {
    gap: Spacing.l,
  },
  shellWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xl,
    minHeight: 0,
  },
  sidePanel: {
    gap: Spacing.l,
  },
  listPanel: {
    flex: 1,
    minHeight: 0,
    gap: Spacing.s,
    flexGrow: 1,
    height: '100%',
  },
  list: {
    flex: 1,
    minHeight: 0,
    flexGrow: 1,
    height: '100%',
  },
  listWeb: {
    overflow: 'auto',
    maxHeight: '100%',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.l },
  headerText: { flex: 1, gap: Spacing.xs },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.light.text },
  pageSubtitle: { ...Typography.body, color: Colors.light.textSecondary },
  addButton: { width: 44, height: 44, borderRadius: BorderRadius.circle, backgroundColor: Colors.light.primary, justifyContent: 'center', alignItems: 'center', ...Shadows.default },

  headerCard: {
    padding: Layout.cardPadding,
  },
  headerCardCompact: {
    padding: Spacing.l,
  },
  headerActions: {
    marginTop: Spacing.s,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActionsRow: {
    marginTop: Spacing.s,
    flexDirection: 'row',
    gap: Spacing.s,
    alignItems: 'center',
  },
  emailIconButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.light.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.info,
  },
  compactAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.m,
    backgroundColor: Colors.light.secondary,
  },
  compactActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.light.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.info,
  },
  quickAddCard: {
    padding: Spacing.l,
    gap: Spacing.m,
  },
  quickAddCardCompact: {
    padding: Spacing.m,
    gap: Spacing.s,
  },
  quickAddSection: {
    gap: Spacing.s,
  },
  quickAddTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // Quick Add
  quickAddScroll: { paddingRight: Spacing.xl, gap: Spacing.s },
  quickAddDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    opacity: 0.6,
  },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.circle, gap: 6, ...Shadows.soft, borderWidth: 1, borderColor: 'transparent' },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },

  // Chip Variations
  chipRecent: { borderColor: Colors.light.border },
  chipStaple: { borderColor: Colors.light.infoBg, backgroundColor: Colors.light.infoBg },
  chipRecipe: { borderColor: Colors.light.warningBg, backgroundColor: Colors.light.warningBg },

  // Sort
  sortBar: {
    paddingTop: Spacing.s,
  },
  sortBarCompact: {
    paddingTop: Spacing.xs,
  },
  sortCard: {
    padding: Spacing.l,
    gap: Spacing.m,
  },
  sortContainer: { flexDirection: 'row', backgroundColor: Colors.light.secondary, borderRadius: BorderRadius.m, padding: 4 },
  sortBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.s },
  sortBtnActive: { backgroundColor: Colors.light.card, ...Shadows.soft },
  sortBtnText: { fontWeight: '600', color: Colors.light.textSecondary, fontSize: 13 },
  sortBtnTextActive: { color: Colors.light.text },

  // List
  sectionHeader: { ...Typography.subHeader, fontSize: 18, marginTop: Spacing.l, marginBottom: Spacing.s, color: Colors.light.textSecondary },
  clearButton: {
    backgroundColor: Colors.light.secondary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.s,
    alignItems: 'center',
    flex: 1,
  },
  clearButtonText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary },
  fab: {
    position: 'absolute',
    right: Spacing.l,
    bottom: Spacing.xl,
    width: 56,
    height: 56,
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.strong,
  },

  // Card Overrides
  cardOverrides: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0, // Margin is handled by Swipeable container
    // Optional: if you find Spacing.l (Card default) too big for a list, override here:
    // padding: Spacing.m 
  },

  itemName: { fontSize: 16, fontWeight: '500', color: Colors.light.text },
  itemChecked: { textDecorationLine: 'line-through', color: Colors.light.textMuted },
  estimateMissing: { fontSize: 12, color: Colors.light.textMuted },

  totalRow: {
    marginTop: Spacing.l,
    padding: Spacing.m,
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.m,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Shadows.soft,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: Colors.light.textSecondary },
  totalValue: { fontSize: 16, fontWeight: '700', color: Colors.light.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.light.card, borderRadius: BorderRadius.l, padding: 20, ...Shadows.strong },
  modalTitle: { ...Typography.subHeader, marginBottom: Spacing.m },
  modalSubtitle: { ...Typography.body, color: Colors.light.textSecondary, marginBottom: Spacing.m },
  input: {
    ...Forms.field,
    ...Forms.fieldText,
  },
  categoryRow: { marginTop: 8, marginBottom: 12 },
  categoryChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.l, backgroundColor: Colors.light.secondary, marginRight: 8 },
  categoryChipActive: { backgroundColor: Colors.light.primary },
  categoryChipText: { fontSize: 13, color: Colors.light.textSecondary, fontWeight: '600' },
  categoryChipTextActive: { color: 'white' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: Spacing.m },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: BorderRadius.s, backgroundColor: Colors.light.secondary, alignItems: 'center' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: BorderRadius.s, backgroundColor: Colors.light.primary, alignItems: 'center' },
  cancelText: { fontWeight: '600', color: Colors.light.textSecondary },
  saveText: { fontWeight: '600', color: 'white' },
  unitRow: { marginTop: 8, marginBottom: 12 },
  unitChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: BorderRadius.s, backgroundColor: Colors.light.secondary, marginRight: 8 },
  unitChipActive: { backgroundColor: Colors.light.primary },
  unitChipText: { fontSize: 12, color: Colors.light.textSecondary, fontWeight: '600' },
  unitChipTextActive: { color: 'white' },
  selectionActions: { flexDirection: 'row', gap: 8, marginTop: Spacing.m },
  selectBtn: { flex: 1, paddingVertical: 8, borderRadius: BorderRadius.s, backgroundColor: Colors.light.secondary, alignItems: 'center' },
  selectBtnText: { fontWeight: '600', color: Colors.light.textSecondary, fontSize: 12 },
  removeAllBtn: { flex: 1, paddingVertical: 8, borderRadius: BorderRadius.s, backgroundColor: Colors.light.dangerBg, alignItems: 'center' },
  removeAllBtnText: { fontWeight: '600', color: Colors.light.danger, fontSize: 12 },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  selectRowText: { fontSize: 14, color: Colors.light.text },

  editButton: {
    padding: 8,
    borderRadius: BorderRadius.s,
    backgroundColor: Colors.light.secondary,
  },
  linkButton: {
    marginLeft: Spacing.s,
  },
  itemSeparator: {
    height: Spacing.s,
  },

  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: Spacing.m, color: Colors.light.textMuted, fontSize: 16 }
});
