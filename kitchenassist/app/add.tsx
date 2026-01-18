import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator
} from 'react-native';

import {
  BorderRadius,
  Colors,
  Shadows,
  Spacing,
  Typography,
} from '../constants/theme';
import { API_BASE_URL } from '../constants/auth0';
import { useApp } from '../context/AppContext';
import ItemNameAutocomplete from '../components/ItemNameAutocomplete';
import { Category, Item } from '../types';
import { ThemedView } from '../components/themed-view';
import { ThemedText } from '../components/themed-text';

const CATEGORIES: Category[] = [
  'Produce',
  'Dairy',
  'Meat',
  'Pantry',
  'Frozen',
  'Beverages',
  'Other',
];
const UNITS: Item['unit'][] = ['unit', 'g', 'kg', 'ml', 'L', 'oz', 'lb', 'cup'];

export default function AddItemScreen() {
  const router = useRouter();
  const { addToFridge, householdId, userId, refreshData } = useApp();
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'receipt'>('manual');
  const [receiptMode, setReceiptMode] = useState<'upload' | 'url' | 'gmail'>('upload');
  const [selectedReceipt, setSelectedReceipt] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Item['unit']>('unit');
  const [category, setCategory] = useState<Category>('Other');
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 7 * 86400000),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Missing Info', 'Please enter an item name.');
      return;
    }
    if (!quantity || isNaN(parseFloat(quantity))) {
      Alert.alert('Missing Info', 'Please enter a valid quantity.');
      return;
    }

    addToFridge({
      id: selectedItemId ?? Math.random().toString(),
      name: name.trim(),
      quantity: parseFloat(quantity),
      unit,
      category,
      purchasePrice: 0,
      purchaseDate: new Date().toISOString(),
      expiryDate: expiryDate.toISOString(),
      store: 'Manual',
      isUsed: false,
    });

    router.replace('/(tabs)/fridge');
  };

  const pickReceipt = async () => {
    setUploadError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo access to upload a receipt.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) {
      setSelectedReceipt(result.assets[0]);
    }
  };

  const uploadReceipt = async () => {
    if (!householdId || !userId) return;
    
    if (receiptMode === 'upload' && !selectedReceipt) return;
    if (receiptMode === 'url' && !receiptUrl.trim()) return;
    // Gmail mode doesn't need any input validation
    
    setIsUploading(true);
    setUploadError(null);

    try {
      if (receiptMode === 'gmail') {
        // Process receipt from Gmail
        const res = await fetch(
          `${API_BASE_URL}/households/${householdId}/receipts/from-gmail`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId,
              'x-household-id': householdId,
            },
          },
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err?.error || 'Failed to process Gmail receipt.');
        }
      } else if (receiptMode === 'url') {
        // Process receipt from URL
        const res = await fetch(
          `${API_BASE_URL}/households/${householdId}/receipts/from-url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId,
              'x-household-id': householdId,
            },
            body: JSON.stringify({ receiptUrl: receiptUrl.trim() }),
          },
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err?.error || 'Failed to process receipt URL.');
        }
      } else {
        // Upload receipt file
        const formData = new FormData();
        const fileName = selectedReceipt!.fileName ?? `receipt-${Date.now()}.jpg`;
        const mimeType = selectedReceipt!.mimeType ?? 'image/jpeg';
        if (Platform.OS === 'web') {
          const response = await fetch(selectedReceipt!.uri);
          const blob = await response.blob();
          const file = new File([blob], fileName, { type: mimeType });
          formData.append('receipt', file);
        } else {
          formData.append('receipt', {
            uri: selectedReceipt!.uri,
            name: fileName,
            type: mimeType,
          } as any);
        }

      const res = await fetch(`${API_BASE_URL}/households/${householdId}/receipts`, {
        method: 'POST',
        headers: { 'x-user-id': userId, 'x-household-id': householdId },
        body: formData,
      });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err?.error || 'Failed to upload receipt.');
        }
      }

      await refreshData();
      setIsNavigating(true);
      Alert.alert('Receipt processed', 'Items have been added to your fridge.', [
        {
          text: 'OK',
          onPress: () => {
            setIsNavigating(false);
            router.replace('/(tabs)/fridge');
          },
        },
      ]);
      // Fallback navigation if alert doesn't work
      setTimeout(() => {
        if (isNavigating) {
          router.replace('/(tabs)/fridge');
        }
      }, 100);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setExpiryDate(selectedDate);
  };

  const categoryEmoji = (cat: Category) => {
    switch (cat) {
      case 'Produce': return '🥦';
      case 'Dairy': return '🥛';
      case 'Meat': return '🥩';
      case 'Frozen': return '🧊';
      case 'Beverages': return '🥤';
      case 'Pantry': return '🥫';
      default: return '📦';
    }
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
        >
          <ThemedView style={styles.contentWrapper}>
            {/* Header */}
            <ThemedView style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <MaterialCommunityIcons name="chevron-left" size={32} color={Colors.light.text} />
              </TouchableOpacity>
              <ThemedText type="title">Add Item</ThemedText>
              <View style={{ width: 44 }} />
            </ThemedView>

            {/* Tabs */}
            <ThemedView style={styles.tabContainer}>
              {(['manual', 'receipt'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabPill, activeTab === tab && styles.tabPillActive]}
                  onPress={() => setActiveTab(tab)}
                >
                  <ThemedText style={[styles.tabPillText, activeTab === tab && styles.tabPillTextActive]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ThemedView>

            {activeTab === 'manual' ? (
              <ThemedView style={styles.formCard}>
                <ThemedView style={styles.fieldGroup}>
                  <ThemedText type="defaultSemiBold">Item Name</ThemedText>
                  <ItemNameAutocomplete
                    value={name}
                    placeholder="e.g. Greek Yogurt, Apples"
                    autoFocus
                    inputStyle={styles.themedInput}
                    onChangeText={(value) => { setName(value); setSelectedItemId(null); }}
                    onSelectItem={(item) => { setName(item.name); setSelectedItemId(item.id); }}
                  />
                </ThemedView>

                <ThemedView style={styles.row}>
                  <ThemedView style={{ flex: 0.4 }}>
                    <ThemedText type="defaultSemiBold">Quantity</ThemedText>
                    <TextInput
                      style={styles.themedInput}
                      placeholder="0"
                      keyboardType="numeric"
                      value={quantity}
                      onChangeText={setQuantity}
                    />
                  </ThemedView>
                  <ThemedView style={{ flex: 0.6 }}>
                    <ThemedText type="defaultSemiBold">Unit</ThemedText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitList}>
                      {UNITS.map((u) => (
                        <TouchableOpacity
                          key={u}
                          style={[styles.unitChip, unit === u && styles.unitChipActive]}
                          onPress={() => setUnit(u)}
                        >
                          <ThemedText style={[styles.unitText, unit === u && styles.unitTextActive]}>{u}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </ThemedView>
                </ThemedView>

                <ThemedView style={styles.fieldGroup}>
                  <ThemedText type="defaultSemiBold">Category</ThemedText>
                  <ThemedView style={styles.categoryGrid}>
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.categoryPill, category === cat && styles.categoryPillActive]}
                        onPress={() => setCategory(cat)}
                      >
                        <ThemedText style={styles.categoryEmoji}>{categoryEmoji(cat)}</ThemedText>
                        <ThemedText style={[styles.categoryLabel, category === cat && styles.categoryLabelActive]}>
                          {cat}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </ThemedView>
                </ThemedView>

                <ThemedView style={styles.fieldGroup}>
                  <ThemedText type="defaultSemiBold">Estimated Expiry</ThemedText>
                  <TouchableOpacity style={styles.datePickerTrigger} onPress={() => setShowDatePicker(true)}>
                    <MaterialCommunityIcons name="calendar-clock" size={20} color={Colors.light.tint} />
                    <ThemedText style={styles.dateDisplay}>{expiryDate.toDateString()}</ThemedText>
                  </TouchableOpacity>

                  {(showDatePicker || Platform.OS === 'ios') && (
                    <ThemedView style={Platform.OS === 'ios' ? styles.iosDateContainer : {}}>
                      <DateTimePicker
                        value={expiryDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleDateChange}
                        minimumDate={new Date()}
                      />
                    </ThemedView>
                  )}
                </ThemedView>
              </ThemedView>
            ) : (
              <ThemedView style={styles.receiptContainer}>
                <ThemedView style={styles.receiptActionBox}>
                  <MaterialCommunityIcons name="receipt" size={64} color={Colors.light.tint} style={{ opacity: 0.3 }} />
                  <ThemedText type="subtitle" style={{ textAlign: 'center' }}>Receipt Scanner</ThemedText>
                  <ThemedText style={styles.receiptHint}>
                    Upload a photo of your grocery receipt and we'll automatically add the items to your pantry.
                  </ThemedText>
                  <TouchableOpacity style={styles.pickButton} onPress={pickReceipt}>
                    <MaterialCommunityIcons name="camera-plus" size={24} color="white" />
                    <ThemedText style={styles.pickButtonText}>
                      {selectedReceipt ? 'Replace Photo' : 'Capture Receipt'}
                    </ThemedText>
                  </TouchableOpacity>
                  {selectedReceipt && (
                    <ThemedView style={styles.selectionIndicator}>
                      <MaterialCommunityIcons name="file-check" size={16} color={Colors.light.success} />
                      <ThemedText style={styles.selectionText}>Ready to upload</ThemedText>
                    </ThemedView>
                  )}
                </ThemedView>
                {uploadError && <ThemedText style={styles.errorText}>{uploadError}</ThemedText>}
              </ThemedView>
            )}
          </ThemedView>
        </ScrollView>

        {/* Footer Action */}
        <ThemedView style={styles.footer}>
          <ThemedView style={styles.footerInner}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (activeTab === 'receipt' && !selectedReceipt) && styles.buttonDisabled
              ]}
              onPress={activeTab === 'manual' ? handleSubmit : uploadReceipt}
              disabled={isUploading || (activeTab === 'receipt' && !selectedReceipt)}
            >
              {isUploading ? (
                <ActivityIndicator color="white" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>
                  {activeTab === 'manual' ? 'Add Item to Fridge' : 'Process Receipt'}
                </ThemedText>
              )}
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 160 },
  contentWrapper: {
    padding: Spacing.l,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: 'transparent'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: Spacing.xl,
    backgroundColor: 'transparent'
  },
  iconButton: { padding: Spacing.xs },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.light.border + '40',
    borderRadius: BorderRadius.circle,
    padding: 4,
    marginBottom: Spacing.xl
  },
  tabPill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: BorderRadius.circle },
  tabPillActive: { backgroundColor: Colors.light.card, ...Shadows.soft },
  tabPillText: { fontSize: 14, fontWeight: '700', color: Colors.light.textMuted },
  tabPillTextActive: { color: Colors.light.tint },
  formCard: { gap: Spacing.xl, backgroundColor: 'transparent' },
  fieldGroup: { gap: Spacing.s, backgroundColor: 'transparent' },
  themedInput: {
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.l,
    padding: Spacing.m,
    fontSize: 16,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...Shadows.soft,
  },
  row: { flexDirection: 'row', gap: Spacing.m, backgroundColor: 'transparent' },
  unitList: { paddingVertical: 4 },
  unitChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.light.card, borderRadius: BorderRadius.m, marginRight: 8, borderWidth: 1, borderColor: Colors.light.border },
  unitChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  unitText: { fontSize: 14, fontWeight: '600', color: Colors.light.textSecondary },
  unitTextActive: { color: 'white' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, backgroundColor: 'transparent' },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.circle,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 6
  },
  categoryPillActive: { backgroundColor: Colors.light.tint + '15', borderColor: Colors.light.tint },
  categoryEmoji: { fontSize: 16 },
  categoryLabel: { fontSize: 13, color: Colors.light.textSecondary, fontWeight: '600' },
  categoryLabelActive: { color: Colors.light.tint },
  datePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    padding: Spacing.m,
    borderRadius: BorderRadius.l,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: Spacing.s
  },
  dateDisplay: { fontSize: 16, fontWeight: '500' },
  iosDateContainer: { backgroundColor: Colors.light.card, borderRadius: BorderRadius.l, marginTop: Spacing.s, overflow: 'hidden' },
  receiptContainer: { paddingVertical: Spacing.xxl, backgroundColor: 'transparent' },
  receiptActionBox: {
    backgroundColor: Colors.light.card,
    borderRadius: 24,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.l,
    ...Shadows.strong
  },
  receiptHint: { textAlign: 'center', color: Colors.light.textMuted, lineHeight: 20 },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: BorderRadius.circle,
    ...Shadows.default
  },
  pickButtonText: { color: 'white', fontWeight: '800', fontSize: 16 },
  selectionIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.light.success + '15', padding: 8, borderRadius: 8 },
  selectionText: { fontSize: 12, color: Colors.light.success, fontWeight: '800' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.l, backgroundColor: 'transparent' },
  footerInner: { maxWidth: 600, width: '100%', alignSelf: 'center', backgroundColor: 'transparent' },
  primaryButton: { backgroundColor: Colors.light.primary, paddingVertical: 18, borderRadius: BorderRadius.xl, alignItems: 'center', ...Shadows.strong },
  primaryButtonText: { color: 'white', fontSize: 18, fontWeight: '800' },
  buttonDisabled: { opacity: 0.5 },
  errorText: { color: Colors.light.danger, textAlign: 'center', marginTop: Spacing.m, fontWeight: '600' }
});