import React, { useMemo, useState } from 'react';
import { View, Text, SectionList, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView, Modal } from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card'; // Import the Card component
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';
import ItemNameAutocomplete from '../../components/ItemNameAutocomplete';

type SortMode = 'aisle' | 'recipe';

export default function GroceryScreen() {
  const { width } = useWindowDimensions();
  const { groceryList, toggleGroceryItem, addToGroceryList, addItemsToGroceryList, clearPurchasedItems, fridgeItems, recipes, recentlyDepletedItems } = useApp();
  const [sortMode, setSortMode] = useState<SortMode>('aisle');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Other');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const CATEGORY_OPTIONS = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Beverages', 'Other'];

  // --- QUICK ADD LOGIC ---

  // 1. Recently Used (Finished or Binned)
  const recentItems = useMemo(() => {
    // Combine existing fridge items that might be marked used (legacy) with our new persisted list
    const candidates = [...fridgeItems.filter(i => i.isUsed), ...recentlyDepletedItems];

    // Deduplicate by name and sort by most recent interaction (using purchaseDate as proxy timestamp set in removeFromFridge)
    const seen = new Set<string>();
    return candidates
      .filter(i => {
        if (seen.has(i.name)) return false;
        seen.add(i.name);
        return true;
      })
      .sort((a, b) => {
        const dateA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
        const dateB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10)
      .filter(i => !groceryList.some(g => g.name === i.name));
  }, [fridgeItems, groceryList, recentlyDepletedItems]);

  // 2. Common Staples
  const commonStaples = ['Milk', 'Eggs', 'Bread', 'Cheese', 'Rice', 'Bananas', 'Butter'].filter(
    name => !groceryList.some(g => g.name === name)
  );

  // --- MAIN LIST LOGIC ---
  const sections = useMemo(() => {
    const grouped: { [key: string]: any[] } = {};

    groceryList.forEach(item => {
      let key = 'Other';

      if (sortMode === 'aisle') {
        key = item.aisle || 'Other';
      } else {
        key = item.fromRecipe || 'Manual / Other';
      }

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    return Object.keys(grouped).sort().map(title => ({
      title: title,
      data: grouped[title]
    }));
  }, [groceryList, sortMode]);

  const estimatedTotal = useMemo(() => {
    return groceryList.reduce((sum, item) => {
      const price = item.targetPrice ?? 0;
      const qty = item.quantity ?? 1;
      return sum + price * qty;
    }, 0);
  }, [groceryList]);

  const hasCheckedItems = useMemo(
    () => groceryList.some((item) => item.checked),
    [groceryList],
  );

  const renderDeleteAction = (id: string) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => toggleGroceryItem(id)}
    >
      <MaterialCommunityIcons name="delete-outline" size={24} color="white" />
    </TouchableOpacity>
  );

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

          {/* QUICK ADD SECTION */}
          <View style={styles.quickAddContainer}>
            <Text style={Typography.label}>Quick Add</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickAddScroll}
            >
              {/* 1. Recents */}
              {recentItems.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.chip, styles.chipRecent]}
                  onPress={() => addToGroceryList(item.name, item.category, item.purchasePrice)}
                >
                  <MaterialCommunityIcons name="refresh" size={16} color={Colors.light.text} />
                  <Text style={styles.chipText}>{item.name}</Text>
                </TouchableOpacity>
              ))}

              {/* 2. Staples */}
              {commonStaples.map(name => (
                <TouchableOpacity
                  key={name}
                  style={[styles.chip, styles.chipStaple]}
                  onPress={() => addToGroceryList(name, 'Pantry', 0)}
                >
                  <MaterialCommunityIcons name="plus" size={16} color={Colors.light.info} />
                  <Text style={styles.chipText}>{name}</Text>
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
          </View>
          {hasCheckedItems && (
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.clearButton} onPress={clearPurchasedItems}>
                <Text style={styles.clearButtonText}>Clear purchased</Text>
              </TouchableOpacity>
            </View>
          )}

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
              <Swipeable
                renderRightActions={() => renderDeleteAction(item.id)}
                // Apply margin to the container so Swipe actions line up nicely
                containerStyle={{ marginBottom: Spacing.s }}
              >
                <Card
                  variant="elevated"
                  onPress={() => toggleGroceryItem(item.id)}
                  // Override defaults: Row layout for list, remove margin (handled by Swipeable)
                  style={styles.cardOverrides}
                >
                  <MaterialCommunityIcons
                    name={item.checked ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                    size={24}
                    color={item.checked ? Colors.light.success : Colors.light.border}
                  />
                  <View style={{ flex: 1, marginLeft: Spacing.m }}>
                    <Text style={[styles.itemName, item.checked && styles.itemChecked]}>{item.name}</Text>
                    {item.targetPrice > 0 && (
                      <Text style={Typography.caption}>
                        ${item.targetPrice.toFixed(2)} {item.quantity ? `x ${item.quantity}` : ''}
                      </Text>
                    )}
                    {item.targetPrice === 0 && (
                      <Text style={styles.estimateMissing}>No estimate</Text>
                    )}
                  </View>
                </Card>
              </Swipeable>
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

  // Adjusted for Swipeable + Card
  deleteAction: {
    backgroundColor: Colors.light.danger,
    width: 70,
    height: '100%', // Match Card height
    borderRadius: BorderRadius.l, // Match Card Radius
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.s
  },

  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: Spacing.m, color: Colors.light.textMuted, fontSize: 16 }
});
