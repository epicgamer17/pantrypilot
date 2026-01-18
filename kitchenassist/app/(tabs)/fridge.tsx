import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, useWindowDimensions, TextInput, Modal, Button, Platform, ActivityIndicator } from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useApp } from '../../context/AppContext';
import { Item } from '../../types';
import EditItemModal from '../../components/EditItemModal';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';

export default function FridgeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { fridgeItems, removeFromFridge, updateFridgeItem, consumeItem, fridgeLoading } = useApp();

  const [editItem, setEditItem] = useState<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'expiry' | 'az' | 'category'>('expiry');

  // Consume Modal State
  const [consumeModalVisible, setConsumeModalVisible] = useState(false);
  const [consumeAmount, setConsumeAmount] = useState('');
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [discardModalVisible, setDiscardModalVisible] = useState(false);
  const [discardPercent, setDiscardPercent] = useState(0);
  const [discardItem, setDiscardItem] = useState<Item | null>(null);

  const isWeb = Platform.OS === 'web';

  // --- GRID CALCULATION ---
  const numColumns = width > 1024 ? 3 : width > 700 ? 2 : 1;
  const gap = Spacing.m;
  const screenPadding = Spacing.l * 2;
  const availableWidth = width - screenPadding - ((numColumns - 1) * gap);
  const cardWidth = availableWidth / numColumns;

  // Filter & Sort Logic
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
        setDiscardItem(item);
        setDiscardPercent(0);
        setDiscardModalVisible(true);
        close();
      }}
    >
      <MaterialCommunityIcons name="trash-can-outline" size={24} color="white" />
      <Text style={styles.actionText}>Bin</Text>
    </TouchableOpacity>
  );

  const renderLeftActions = (item: Item, close: () => void) => (
    <TouchableOpacity
      style={styles.finishAction}
      onPress={() => { removeFromFridge(item.id, 0); close(); }}
    >
      <MaterialCommunityIcons name="check-circle-outline" size={24} color="white" />
      <Text style={styles.actionText}>Finish</Text>
    </TouchableOpacity>
  );

  const handlePartialEat = (item: Item) => {
    setActiveItem(item);
    setConsumeAmount('');
    setConsumeModalVisible(true);
  };

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
    const timeProgress = daysLeft === null ? 0 : Math.max(0, Math.min(1, daysLeft / 14));
    const timeColor = daysLeft === null
      ? Colors.light.textSecondary
      : isExpired
        ? Colors.light.danger
        : isExpiringSoon
          ? Colors.light.warning
          : Colors.light.success;
    const initial = item.initialQuantity || item.quantity;
    const qtyProgress = Math.max(0, Math.min(1, item.quantity / initial));
    const qtyColor = Colors.light.tint;

    return (
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Text style={styles.categoryEmoji}>
              {item.category === 'Dairy' ? '🥛' : item.category === 'Meat' ? '🥩' : item.category === 'Produce' ? '🥬' : '📦'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', flex: 1 }}>
            <Text style={[styles.daysText, { color: timeColor }]}>
              {daysLeft === null ? 'No expiry' : isExpired ? 'Expired' : `${daysLeft} days`}
            </Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${timeProgress * 100}%`, backgroundColor: timeColor }]} />
            </View>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.categoryText}>{item.category}</Text>
          {item.purchasePrice > 0 ? (
            <Text style={styles.priceText}>${(item.purchasePrice * item.quantity).toFixed(2)}</Text>
          ) : (
            <Text style={styles.estimateMissing}>No estimate</Text>
          )}
          <View style={styles.qtyContainer}>
            <Text style={Typography.caption}>
              {item.quantity} / {initial} {item.unit}
            </Text>
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
                minimumTrackTintColor={qtyColor}
                maximumTrackTintColor={Colors.light.background}
                thumbTintColor={qtyColor}
              />
          </View>
        </View>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={Typography.header}>My Fridge</Text>
          <TouchableOpacity onPress={() => router.push('/add')} style={styles.addButton}>
            <MaterialCommunityIcons name="plus" size={24} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.light.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor={Colors.light.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.sortContainer}>
          <TouchableOpacity
            style={[styles.sortBtn, sortMode === 'expiry' && styles.sortBtnActive]}
            onPress={() => setSortMode('expiry')}
          >
            <Text style={[styles.sortBtnText, sortMode === 'expiry' && styles.sortBtnTextActive]}>By Expiry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sortMode === 'az' && styles.sortBtnActive]}
            onPress={() => setSortMode('az')}
          >
            <Text style={[styles.sortBtnText, sortMode === 'az' && styles.sortBtnTextActive]}>A-Z</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sortMode === 'category' && styles.sortBtnActive]}
            onPress={() => setSortMode('category')}
          >
            <Text style={[styles.sortBtnText, sortMode === 'category' && styles.sortBtnTextActive]}>Category</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          key={numColumns}
          numColumns={numColumns}
          data={filteredItems}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          columnWrapperStyle={numColumns > 1 ? { gap: Spacing.m } : undefined}
          ListEmptyComponent={
            fridgeLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
                <Text style={styles.loadingText}>Loading fridge items...</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="fridge-outline" size={64} color={Colors.light.border} />
                <Text style={styles.emptyText}>Fridge is empty!</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            let swipeableRef: Swipeable | null = null;
            const close = () => swipeableRef?.close();

            const CardBody = (
              <Card
                variant="elevated"
                onLongPress={() => setEditItem(item)}
                style={[
                  styles.cardLayoutOverrides,
                  { width: numColumns > 1 ? cardWidth : '100%' }
                ]}
              >
                {renderCardContent(item)}
                {isWeb && (
                  <View style={styles.webActions}>
                    <TouchableOpacity style={[styles.webBtn, styles.btnFinish]} onPress={() => removeFromFridge(item.id, 0)}>
                      <Text style={styles.webBtnText}>Finish</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.webBtn, styles.btnTrash]}
                      onPress={() => {
                        setDiscardItem(item);
                        setDiscardPercent(0);
                        setDiscardModalVisible(true);
                      }}
                    >
                      <Text style={styles.webBtnText}>Bin</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            );

            if (isWeb) return (
              <View style={{ width: numColumns > 1 ? cardWidth : '100%', marginBottom: Spacing.m }}>
                {CardBody}
              </View>
            );

            return (
              <Swipeable
                ref={ref => swipeableRef = ref}
                renderRightActions={() => renderRightActions(item, close)}
                renderLeftActions={() => renderLeftActions(item, close)}
                containerStyle={{ width: numColumns > 1 ? cardWidth : '100%', marginBottom: Spacing.m }}
              >
                {CardBody}
              </Swipeable>
            );
          }}
        />

        <Modal visible={consumeModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={Typography.subHeader}>Eat {activeItem?.name}</Text>
              <Text style={Typography.body}>How much did you use?</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  value={consumeAmount}
                  onChangeText={setConsumeAmount}
                  placeholder="0"
                  autoFocus
                />
                <Text style={Typography.subHeader}>{activeItem?.unit}</Text>
              </View>
              <View style={styles.modalButtons}>
                <Button title="Cancel" color={Colors.light.textMuted} onPress={() => setConsumeModalVisible(false)} />
                <Button title="Confirm" color={Colors.light.primary} onPress={confirmConsume} />
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={discardModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={Typography.subHeader}>Throw out {discardItem?.name}</Text>
              <Text style={Typography.body}>How much are you discarding?</Text>
              <Text style={styles.percentText}>{discardPercent}%</Text>
              <Slider
                style={{ width: '100%', height: 40 }}
                minimumValue={0}
                maximumValue={100}
                step={5}
                value={discardPercent}
                onValueChange={setDiscardPercent}
                minimumTrackTintColor={Colors.light.danger}
                maximumTrackTintColor={Colors.light.textSecondary}
                thumbTintColor={Colors.light.danger}
              />
              <View style={styles.labels}>
                <Text style={styles.tinyLabel}>0%</Text>
                <Text style={styles.tinyLabel}>100%</Text>
              </View>
              <View style={styles.modalButtons}>
                <Button title="Cancel" color={Colors.light.textMuted} onPress={() => setDiscardModalVisible(false)} />
                <Button title="Confirm" color={Colors.light.danger} onPress={confirmDiscard} />
              </View>
            </View>
          </View>
        </Modal>

        <EditItemModal visible={!!editItem} item={editItem} onClose={() => setEditItem(null)} onSave={(u) => { updateFridgeItem(u); setEditItem(null); }} />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.l, paddingTop: 60, backgroundColor: Colors.light.background },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.l },
  addButton: { width: 44, height: 44, borderRadius: BorderRadius.circle, backgroundColor: Colors.light.primary, justifyContent: 'center', alignItems: 'center', ...Shadows.default },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.background, paddingVertical: 10, paddingHorizontal: 12, borderRadius: BorderRadius.m, marginBottom: Spacing.l, borderWidth: 1, borderColor: Colors.light.border },
  searchInput: { flex: 1, fontSize: 16, color: Colors.light.text },
  sortContainer: { flexDirection: 'row', backgroundColor: Colors.light.secondary, borderRadius: BorderRadius.m, padding: 4, marginBottom: Spacing.m },
  sortBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.s },
  sortBtnActive: { backgroundColor: Colors.light.card, ...Shadows.soft },
  sortBtnText: { fontWeight: '600', color: Colors.light.textSecondary, fontSize: 13 },
  sortBtnTextActive: { color: Colors.light.text },
  cardLayoutOverrides: {
    padding: Spacing.m,
    minHeight: 160,
    justifyContent: 'space-between',
  },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.s },
  cardBody: { flex: 1, justifyContent: 'flex-end' },
  iconContainer: { width: 40, height: 40, borderRadius: BorderRadius.m, backgroundColor: Colors.light.background, justifyContent: 'center', alignItems: 'center' },
  categoryEmoji: { fontSize: 20 },
  categoryText: { ...Typography.caption, color: Colors.light.textSecondary, marginBottom: Spacing.xs },
  itemName: { fontSize: 16, fontWeight: '600', color: Colors.light.text, marginBottom: Spacing.xs },
  priceText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary, marginBottom: Spacing.xs },
  estimateMissing: { fontSize: 12, color: Colors.light.textMuted, marginBottom: Spacing.xs },
  qtyContainer: { marginTop: 4 },
  qtySlider: { width: '100%', height: 20, marginTop: 4 },
  daysText: { fontSize: 12, fontWeight: '700', marginBottom: 4, textAlign: 'right' },
  progressBarBg: { width: 60, height: 4, backgroundColor: Colors.light.background, borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 2 },
  deleteAction: { backgroundColor: Colors.light.danger, justifyContent: 'center', alignItems: 'center', width: 80, height: '100%', borderRadius: BorderRadius.l, marginLeft: Spacing.s },
  finishAction: { backgroundColor: Colors.light.success, justifyContent: 'center', alignItems: 'center', width: 80, height: '100%', borderRadius: BorderRadius.l, marginRight: Spacing.s },
  actionText: { color: 'white', fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  webActions: { flexDirection: 'row', gap: Spacing.s, marginTop: Spacing.m, paddingTop: Spacing.m, borderTopWidth: 1, borderTopColor: Colors.light.background },
  webBtn: { flex: 1, paddingVertical: 8, borderRadius: BorderRadius.s, alignItems: 'center' },
  btnFinish: { backgroundColor: Colors.light.successBg },
  btnTrash: { backgroundColor: Colors.light.dangerBg },
  webBtnText: { fontSize: 12, fontWeight: 'bold', color: Colors.light.text },
  loadingState: { alignItems: 'center', marginTop: 60 },
  loadingText: { fontSize: 14, fontWeight: '600', color: Colors.light.textSecondary, marginTop: Spacing.m },
  emptyState: { alignItems: 'center', marginTop: 60, opacity: 0.5 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.light.textSecondary, marginTop: Spacing.m },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '80%', maxWidth: 400, backgroundColor: 'white', borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', ...Shadows.strong },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, marginVertical: Spacing.l },
  modalInput: { fontSize: 32, fontWeight: 'bold', borderBottomWidth: 2, borderColor: Colors.light.border, textAlign: 'center', width: 100, color: Colors.light.primary },
  modalButtons: { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  percentText: { fontSize: 36, fontWeight: 'bold', color: Colors.light.text, marginTop: Spacing.l },
  labels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: Spacing.s },
  tinyLabel: { ...Typography.caption, fontSize: 12 }
});
