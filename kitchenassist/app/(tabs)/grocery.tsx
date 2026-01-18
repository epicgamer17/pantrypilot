import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, SectionList, StyleSheet, TouchableOpacity, useWindowDimensions, Modal, TextInput, Platform } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card'; // Import the Card component
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';
import ItemNameAutocomplete from '../../components/ItemNameAutocomplete';
import { Category, Item } from '../../types';

type SortMode = 'aisle' | 'recipe' | 'az';

export default function GroceryScreen() {
  const { width } = useWindowDimensions();
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

  const CATEGORY_OPTIONS = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Beverages', 'Other'];
  const ALLOWED_UNITS: Item['unit'][] = ['unit', 'g', 'kg', 'ml', 'L', 'oz', 'lb', 'cup', 'ea', 'tbsp', 'tsp', 'clove', 'cloves', 'leaf', 'leaves', 'sprig', 'sprigs'];
  const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
  const STAPLE_NAMES = ['Milk', 'Eggs', 'Bread', 'Cheese', 'Rice', 'Bananas', 'Butter'];
  const [stapleItems, setStapleItems] = useState<{ name: string; category?: string }[]>([]);

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
      purchasePrice: item.targetPrice ?? 0,
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.page}>
        <View style={[styles.container, { maxWidth: 800 }]}>
          <View style={styles.headerRow}>
            <Text style={Typography.header}>Shopping List</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
              <MaterialCommunityIcons name="plus" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[
              styles.clearButton,
              {
                backgroundColor: Colors.light.infoBg,
                alignSelf: 'flex-end', // Prevents stretching vertically
                paddingHorizontal: 10,  // Narrower horizontal footprint
                paddingVertical: 6,    // Shorter vertical footprint
                marginRight: 8,        // Space between this and "Select all"
                flex: 0,               // Ensures it doesn't grow to fill space
              }
            ]}
            onPress={handleReadEmails}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialCommunityIcons name="email-sync" size={14} color={Colors.light.info} />
              <Text style={[styles.clearButtonText, { color: Colors.light.info, fontSize: 11 }]}>
                Read Email Receipt
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.quickAddContainer}>
            <Text style={Typography.label}>Quick Add</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickAddScroll}
              nestedScrollEnabled
              directionalLockEnabled
            >
              {/* 1. Recents */}
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

              {/* 2. Staples */}
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

              {/* 3. Recipes */}
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

          {/* SORT TOGGLES */}
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
          <View style={styles.actionsRow}>
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
          </View>

          {/* MAIN LIST */}
          <SectionList
            sections={sections}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
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
                    {item.quantity ?? 1}
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
                      {(item.quantity ?? 1)} x ${item.targetPrice.toFixed(2)} @ {item.bestStoreName || 'No store found'}
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

      <Modal visible={moveModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Move purchased items?</Text>
            <Text style={Typography.caption}>
              Selected items move to your pantry. Unselected items are removed.
            </Text>

            <View style={styles.selectionActions}>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() =>
                  setSelectedPurchasedIds(new Set(purchasedItems.map((item) => item.id)))
                }
              >
                <Text style={styles.selectBtnText}>Select all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeAllBtn}
                onPress={handleRemoveAllPurchased}
              >
                <Text style={styles.removeAllBtnText}>Remove all</Text>
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
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                ]}
                onPress={handleMoveSelectedToFridge}
              >
                <Text style={styles.saveText}>Move to pantry</Text>
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
                addToGroceryList(value, newItemCategory, 0);
                setShowAddModal(false);
                setNewItemName('');
                setSelectedItemId(null);
              }}
            />

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
                  addToGroceryList(newItemName.trim(), newItemCategory, 0);
                  setShowAddModal(false);
                  setNewItemName('');
                  setSelectedItemId(null);
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
  page: { flex: 1, backgroundColor: Colors.light.background, paddingTop: 60 },
  container: { flex: 1, paddingHorizontal: Spacing.l, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.m },
  addButton: { width: 44, height: 44, borderRadius: BorderRadius.circle, backgroundColor: Colors.light.primary, justifyContent: 'center', alignItems: 'center', ...Shadows.default },

  // Quick Add
  quickAddContainer: { marginBottom: Spacing.l },
  quickAddScroll: { paddingRight: Spacing.xl, gap: Spacing.s },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.circle, gap: 6, ...Shadows.soft, borderWidth: 1, borderColor: 'transparent' },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },

  // Chip Variations
  chipRecent: { borderColor: Colors.light.border },
  chipStaple: { borderColor: Colors.light.infoBg, backgroundColor: Colors.light.infoBg },
  chipRecipe: { borderColor: Colors.light.warningBg, backgroundColor: Colors.light.warningBg },

  // Sort
  sortContainer: { flexDirection: 'row', backgroundColor: Colors.light.secondary, borderRadius: BorderRadius.m, padding: 4, marginBottom: Spacing.m },
  sortBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.s },
  sortBtnActive: { backgroundColor: Colors.light.card, ...Shadows.soft },
  sortBtnText: { fontWeight: '600', color: Colors.light.textSecondary, fontSize: 13 },
  sortBtnTextActive: { color: Colors.light.text },

  // List
  sectionHeader: { ...Typography.subHeader, fontSize: 18, marginTop: Spacing.l, marginBottom: Spacing.s, color: Colors.light.textSecondary },
  actionsRow: { alignItems: 'flex-end', marginBottom: Spacing.m },
  clearButton: {
    backgroundColor: Colors.light.secondary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.s,
  },
  clearButtonText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary },

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
  input: {
    backgroundColor: Colors.light.background,
    borderRadius: BorderRadius.m,
    padding: Spacing.m,
    fontSize: 16,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
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

  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: Spacing.m, color: Colors.light.textMuted, fontSize: 16 }
});
