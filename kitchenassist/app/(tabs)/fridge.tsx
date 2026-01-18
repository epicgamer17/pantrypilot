import React, { useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, useWindowDimensions, TextInput, Modal, Button, Platform, ActivityIndicator } from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useApp } from '../../context/AppContext';
import { Item } from '../../types';
import EditItemModal from '../../components/EditItemModal';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';
import { ThemedView } from '../../components/themed-view';
import { ThemedText } from '../../components/themed-text';

export default function FridgeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { fridgeItems, removeFromFridge, updateFridgeItem, consumeItem, fridgeLoading } = useApp();

  const [editItem, setEditItem] = useState<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'expiry' | 'az' | 'category'>('expiry');

  const [consumeModalVisible, setConsumeModalVisible] = useState(false);
  const [consumeAmount, setConsumeAmount] = useState('');
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [discardModalVisible, setDiscardModalVisible] = useState(false);
  const [discardPercent, setDiscardPercent] = useState(0);
  const [discardItem, setDiscardItem] = useState<Item | null>(null);

  const isWeb = Platform.OS === 'web';

  // --- GRID CALCULATION ---
  const numColumns = width > 1200 ? 4 : width > 800 ? 3 : width > 600 ? 2 : 1;
  const gap = Spacing.l;
  const screenPadding = Spacing.l;
  const availableWidth = width - (screenPadding * 2) - ((numColumns - 1) * gap);
  const cardWidth = availableWidth / numColumns;

  const openDiscardModal = (item: Item) => {
    const initial = item.initialQuantity || item.quantity;
    const rawPercent = initial > 0 ? (item.quantity / initial) * 100 : 0;
    const roundedPercent = Math.max(0, Math.min(100, Math.round(rawPercent / 5) * 5));
    setDiscardItem(item);
    setDiscardPercent(roundedPercent);
    setDiscardModalVisible(true);
  };

  const filteredItems = useMemo(() => {
    let items = fridgeItems.filter(i => !i.isUsed);
    if (searchQuery) {
      items = items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (sortMode === 'az') {
      return items.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortMode === 'category') {
      return items.sort((a, b) => {
        const categoryCompare = (a.category || 'Other').localeCompare(b.category || 'Other');
        if (categoryCompare !== 0) return categoryCompare;
        return a.name.localeCompare(b.name);
      });
    }
    return items.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  }, [fridgeItems, searchQuery, sortMode]);

  const renderRightActions = (item: Item, close: () => void) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => {
        openDiscardModal(item);
        close();
      }}
    >
      <MaterialCommunityIcons name="trash-can-outline" size={28} color="white" />
      <ThemedText style={styles.actionText}>Bin</ThemedText>
    </TouchableOpacity>
  );

  const renderLeftActions = (item: Item, close: () => void) => (
    <TouchableOpacity
      style={styles.finishAction}
      onPress={() => { removeFromFridge(item.id, 0); close(); }}
    >
      <MaterialCommunityIcons name="check-circle-outline" size={28} color="white" />
      <ThemedText style={styles.actionText}>Finish</ThemedText>
    </TouchableOpacity>
  );

  const confirmConsume = () => {
    if (activeItem && consumeAmount) {
      consumeItem(activeItem.id, parseFloat(consumeAmount));
      setConsumeModalVisible(false);
      setActiveItem(null);
    }
  };

  const confirmDiscard = () => {
    if (!discardItem) return;
    const percent = Number(discardPercent);
    if (!Number.isFinite(percent) || percent <= 0) return;
    const amount = discardItem.quantity * (percent / 100);
    const remaining = discardItem.quantity - amount;
    if (remaining <= 0) {
      removeFromFridge(discardItem.id, 100);
    } else {
      updateFridgeItem({ ...discardItem, quantity: Number(remaining.toFixed(2)) });
    }
    setDiscardModalVisible(false);
    setDiscardItem(null);
  };

  const renderCardContent = (item: Item) => {
    const expiryTime = item.expiryDate ? new Date(item.expiryDate).getTime() : NaN;
    const hasExpiry = Number.isFinite(expiryTime);
    const daysLeft = hasExpiry
      ? Math.ceil((expiryTime - Date.now()) / (1000 * 3600 * 24))
      : null;
    const isExpired = daysLeft !== null && daysLeft < 0;
    const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

    const timeColor = daysLeft === null
      ? Colors.light.textMuted
      : isExpired
        ? Colors.light.danger
        : isExpiringSoon
          ? Colors.light.warning
          : Colors.light.success;

    const initial = item.initialQuantity || item.quantity;
    const qtyProgress = Math.max(0, Math.min(1, item.quantity / initial));

    return (
      <ThemedView style={styles.cardInternal}>
        <ThemedView style={styles.cardTopSection}>
          <ThemedView style={[styles.statusBadge, { backgroundColor: timeColor + '20' }]}>
            <ThemedText style={[styles.statusText, { color: timeColor }]}>
              {daysLeft === null ? 'Stable' : isExpired ? 'Expired' : `${daysLeft}d left`}
            </ThemedText>
          </ThemedView>
          <ThemedText style={styles.categoryEmoji}>
            {item.category === 'Dairy' ? '🥛' : item.category === 'Meat' ? '🥩' : item.category === 'Produce' ? '🥦' : '📦'}
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.cardMainSection}>
          <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.itemName}>
            {item.name}
          </ThemedText>
          <ThemedText style={styles.priceLabel}>
            {item.purchasePrice > 0 ? `$${(item.purchasePrice * item.quantity).toFixed(2)}` : 'No price'}
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.cardBottomSection}>
          <ThemedView style={styles.qtyLabelRow}>
            <ThemedText style={styles.qtyValue}>{item.quantity} {item.unit}</ThemedText>
            <ThemedText style={styles.qtyPercent}>{Math.round(qtyProgress * 100)}%</ThemedText>
          </ThemedView>
          <Slider
            style={styles.qtySlider}
            minimumValue={0}
            maximumValue={100}
            step={5}
            value={qtyProgress * 100}
            onValueChange={(value) => {
              const nextQty = Number(((value / 100) * initial).toFixed(2));
              updateFridgeItem({ ...item, quantity: nextQty });
            }}
            minimumTrackTintColor={Colors.light.tint}
            maximumTrackTintColor={Colors.light.border}
            thumbTintColor={Colors.light.tint}
          />
        </ThemedView>
      </ThemedView>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={styles.container}>
        {/* Header */}
        <ThemedView style={styles.header}>
          <ThemedView style={{ backgroundColor: 'transparent' }}>
            <ThemedText type="title">Fridge</ThemedText>
            <ThemedText style={styles.subtitle}>{filteredItems.length} items currently stored</ThemedText>
          </ThemedView>
          <TouchableOpacity onPress={() => router.push('/add')} style={styles.fab}>
            <MaterialCommunityIcons name="plus" size={32} color="white" />
          </TouchableOpacity>
        </ThemedView>

        {/* Search & Filters */}
        <ThemedView style={styles.filterSection}>
          <ThemedView style={styles.searchBar}>
            <MaterialCommunityIcons name="magnify" size={22} color={Colors.light.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search pantry..."
              placeholderTextColor={Colors.light.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </ThemedView>

          <ThemedView style={styles.pillContainer}>
            {(['expiry', 'az', 'category'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.pill, sortMode === mode && styles.pillActive]}
                onPress={() => setSortMode(mode)}
              >
                <ThemedText style={[styles.pillText, sortMode === mode && styles.pillTextActive]}>
                  {mode === 'expiry' ? 'Expiry' : mode === 'az' ? 'A-Z' : 'Type'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ThemedView>
        </ThemedView>

        <FlatList
          key={numColumns}
          numColumns={numColumns}
          data={filteredItems}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={numColumns > 1 ? { gap: gap } : undefined}
          ListEmptyComponent={
            fridgeLoading ? (
              <ThemedView style={styles.centerState}>
                <ActivityIndicator size="large" color={Colors.light.tint} />
              </ThemedView>
            ) : (
              <ThemedView style={styles.centerState}>
                <MaterialCommunityIcons name="fridge-off-outline" size={64} color={Colors.light.border} />
                <ThemedText style={styles.emptyText}>Your fridge is empty</ThemedText>
              </ThemedView>
            )
          }
          renderItem={({ item }) => {
            let swipeableRef: Swipeable | null = null;
            const close = () => swipeableRef?.close();

            const CardWrapper = (
              <Card
                variant="elevated"
                onLongPress={() => setEditItem(item)}
                style={[styles.card, { width: numColumns > 1 ? cardWidth : '100%' }]}
              >
                {renderCardContent(item)}
                {isWeb && (
                  <ThemedView style={styles.webActionOverlay}>
                    <TouchableOpacity style={styles.webActionBtn} onPress={() => removeFromFridge(item.id, 0)}>
                      <MaterialCommunityIcons name="check" size={18} color={Colors.light.success} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.webActionBtn} onPress={() => openDiscardModal(item)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.light.danger} />
                    </TouchableOpacity>
                  </ThemedView>
                )}
              </Card>
            );

            if (isWeb) return CardWrapper;

            return (
              <Swipeable
                ref={ref => swipeableRef = ref}
                renderRightActions={() => renderRightActions(item, close)}
                renderLeftActions={() => renderLeftActions(item, close)}
                containerStyle={{ marginBottom: Spacing.m }}
              >
                {CardWrapper}
              </Swipeable>
            );
          }}
        />

        {/* Re-using your existing modals but with improved layout inside */}
        <Modal visible={consumeModalVisible} transparent animationType="slide">
          <ThemedView style={styles.modalBackdrop}>
            <ThemedView style={styles.bottomSheet}>
              <ThemedText type="subtitle">How much {activeItem?.name}?</ThemedText>
              <ThemedView style={styles.modalInputWrapper}>
                <TextInput
                  style={styles.hugeInput}
                  keyboardType="numeric"
                  value={consumeAmount}
                  onChangeText={setConsumeAmount}
                  placeholder="0"
                  autoFocus
                />
                <ThemedText type="title">{activeItem?.unit}</ThemedText>
              </ThemedView>
              <ThemedView style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setConsumeModalVisible(false)}>
                  <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={confirmConsume}>
                  <ThemedText style={styles.confirmBtnText}>Confirm</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          </ThemedView>
        </Modal>

        {/* Existing Discard Modal Logic preserved */}
        <Modal visible={discardModalVisible} transparent animationType="fade">
          <ThemedView style={styles.modalBackdrop}>
            <ThemedView style={styles.modalCard}>
              <ThemedText type="subtitle">Discard {discardItem?.name}</ThemedText>
              <ThemedText style={styles.percentDisplay}>{discardPercent}% wasted</ThemedText>
              <Slider
                style={{ width: '100%', height: 40 }}
                minimumValue={0}
                maximumValue={100}
                step={5}
                value={discardPercent}
                onValueChange={setDiscardPercent}
                minimumTrackTintColor={Colors.light.danger}
                thumbTintColor={Colors.light.danger}
              />
              <ThemedView style={styles.modalFooter}>
                <Button title="Cancel" color={Colors.light.textMuted} onPress={() => setDiscardModalVisible(false)} />
                <Button title="Confirm Waste" color={Colors.light.danger} onPress={confirmDiscard} />
              </ThemedView>
            </ThemedView>
          </ThemedView>
        </Modal>

        <EditItemModal
          visible={!!editItem}
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(u) => { updateFridgeItem(u); setEditItem(null); }}
        />
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.l,
    marginBottom: Spacing.m,
    backgroundColor: 'transparent'
  },
  subtitle: { ...Typography.caption, marginTop: -4 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.strong
  },
  filterSection: { paddingHorizontal: Spacing.l, gap: Spacing.m, marginBottom: Spacing.l, backgroundColor: 'transparent' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    padding: Spacing.m,
    borderRadius: BorderRadius.l,
    ...Shadows.soft
  },
  searchInput: { flex: 1, marginLeft: Spacing.s, fontSize: 16, color: Colors.light.text },
  pillContainer: { flexDirection: 'row', gap: Spacing.s, backgroundColor: 'transparent' },
  pill: {
    paddingHorizontal: Spacing.l,
    paddingVertical: 8,
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border
  },
  pillActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  pillText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  pillTextActive: { color: 'white' },
  listContent: { paddingHorizontal: Spacing.l, paddingBottom: 120 },
  card: {
    padding: 0,
    overflow: 'hidden',
    borderRadius: BorderRadius.xl,
    marginBottom: 0 // Handled by gap/swipeable
  },
  cardInternal: { padding: Spacing.l, backgroundColor: 'transparent' },
  cardTopSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.s, backgroundColor: 'transparent' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  categoryEmoji: { fontSize: 24 },
  cardMainSection: { marginBottom: Spacing.m, backgroundColor: 'transparent' },
  itemName: { fontSize: 18, marginBottom: 2 },
  priceLabel: { fontSize: 13, color: Colors.light.textMuted },
  cardBottomSection: { backgroundColor: 'transparent' },
  qtyLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, backgroundColor: 'transparent' },
  qtyValue: { fontSize: 14, fontWeight: '700', color: Colors.light.tint },
  qtyPercent: { fontSize: 12, color: Colors.light.textMuted },
  qtySlider: { width: '100%', height: 20 },
  webActionOverlay: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.light.border + '40',
    backgroundColor: Colors.light.gray100 + '50'
  },
  webActionBtn: { flex: 1, padding: 10, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { backgroundColor: Colors.light.danger, justifyContent: 'center', alignItems: 'center', width: 90, borderRadius: BorderRadius.xl, marginLeft: Spacing.s },
  finishAction: { backgroundColor: Colors.light.success, justifyContent: 'center', alignItems: 'center', width: 90, borderRadius: BorderRadius.xl, marginRight: Spacing.s },
  actionText: { color: 'white', fontSize: 12, fontWeight: '800', marginTop: 4 },
  centerState: { alignItems: 'center', justifyContent: 'center', marginTop: 100, backgroundColor: 'transparent' },
  emptyText: { marginTop: Spacing.m, color: Colors.light.textMuted, fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  bottomSheet: { width: '100%', maxWidth: 500, backgroundColor: Colors.light.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: Spacing.xl, position: 'absolute', bottom: 0 },
  modalCard: { width: '90%', maxWidth: 400, backgroundColor: Colors.light.card, borderRadius: 24, padding: Spacing.xl, alignItems: 'center' },
  modalInputWrapper: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginVertical: Spacing.xxl, backgroundColor: 'transparent' },
  hugeInput: { fontSize: 64, fontWeight: '800', color: Colors.light.tint, textAlign: 'right', minWidth: 120 },
  modalFooter: { flexDirection: 'row', gap: Spacing.m, marginTop: Spacing.l, width: '100%', backgroundColor: 'transparent' },
  cancelBtn: { flex: 1, padding: Spacing.l, borderRadius: BorderRadius.m, alignItems: 'center' },
  confirmBtn: { flex: 2, padding: Spacing.l, backgroundColor: Colors.light.tint, borderRadius: BorderRadius.m, alignItems: 'center' },
  cancelBtnText: { fontWeight: '700', color: Colors.light.textMuted },
  confirmBtnText: { fontWeight: '700', color: 'white' },
  percentDisplay: { fontSize: 48, fontWeight: '800', color: Colors.light.danger, marginVertical: Spacing.l }
});