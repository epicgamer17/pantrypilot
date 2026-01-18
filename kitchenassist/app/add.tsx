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
  Text,
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
import { Category, Item } from '../types'; // Import types

// Typed arrays to match Item interface
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

  // Explicitly Typed Form State
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
      Alert.alert(
        'Permission required',
        'Please allow photo access to upload a receipt.',
      );
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

      const res = await fetch(
        `${API_BASE_URL}/households/${householdId}/receipts`,
        {
          method: 'POST',
          headers: {
            'x-user-id': userId,
            'x-household-id': householdId,
          },
          body: formData,
        },
      );

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
      const message = error instanceof Error ? error.message : 'Upload failed.';
      setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setExpiryDate(selectedDate);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={Colors.light.text}
            />
          </TouchableOpacity>
          <Text style={Typography.header}>Add Item</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'manual' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('manual')}
          >
            <Text
              style={[styles.tabText, activeTab === 'manual' && styles.tabTextActive]}
            >
              Manual
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'receipt' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('receipt')}
          >
            <Text
              style={[styles.tabText, activeTab === 'receipt' && styles.tabTextActive]}
            >
              Receipt
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'manual' && (
        <View style={styles.form}>
          {/* Name Input */}
          <Text style={Typography.label}>Item Name</Text>
          <ItemNameAutocomplete
            value={name}
            placeholder="e.g. Milk, Avocados"
            autoFocus
            inputStyle={styles.input}
            onChangeText={(value) => {
              setName(value);
              setSelectedItemId(null);
            }}
            onSelectItem={(item) => {
              setName(item.name);
              setSelectedItemId(item.id);
            }}
          />

          {/* Quantity Row */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: Spacing.m }}>
              <Text style={Typography.label}>Quantity</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={Typography.label}>Unit</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.unitScroll}
                contentContainerStyle={{ alignItems: 'center' }}
              >
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, unit === u && styles.chipActive]}
                    onPress={() => setUnit(u)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        unit === u && styles.chipTextActive,
                      ]}
                    >
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Category Selection */}
          <Text style={Typography.label}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryCard,
                  category === cat && styles.categoryCardActive,
                ]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === cat && styles.categoryTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Expiry Date */}
          <Text style={Typography.label}>Expiry Date</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons
              name="calendar"
              size={20}
              color={Colors.light.primary}
            />
            <Text style={styles.dateText}>{expiryDate.toDateString()}</Text>
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
                {/* Receipt Mode Toggle */}
                <ThemedView style={styles.receiptModeToggle}>
                  {(['upload', 'url', 'gmail'] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.receiptModePill, receiptMode === mode && styles.receiptModePillActive]}
                      onPress={() => setReceiptMode(mode)}
                    >
                      <ThemedText style={[styles.receiptModeText, receiptMode === mode && styles.receiptModeTextActive]}>
                        {mode === 'upload' ? '📷 Upload' : mode === 'url' ? '🔗 URL' : '📧 Gmail'}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </ThemedView>

                {receiptMode === 'upload' ? (
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
                ) : receiptMode === 'url' ? (
                  <ThemedView style={styles.formCard}>
                    <ThemedView style={styles.fieldGroup}>
                      <ThemedText type="defaultSemiBold">Receipt Image URL</ThemedText>
                      <TextInput
                        style={styles.themedInput}
                        placeholder="https://example.com/receipt.jpg"
                        value={receiptUrl}
                        onChangeText={setReceiptUrl}
                        autoCapitalize="none"
                        keyboardType="url"
                        placeholderTextColor={Colors.light.textMuted}
                      />
                      <ThemedText style={styles.receiptHint}>
                        Enter the URL of a receipt image to process
                      </ThemedText>
                    </ThemedView>
                  </ThemedView>
                ) : (
                  <ThemedView style={styles.receiptActionBox}>
                    <MaterialCommunityIcons name="email-outline" size={64} color={Colors.light.tint} style={{ opacity: 0.3 }} />
                    <ThemedText type="subtitle" style={{ textAlign: 'center' }}>Gmail Receipt</ThemedText>
                    <ThemedText style={styles.receiptHint}>
                      Process the most recent receipt from your linked Gmail account. No input needed!
                    </ThemedText>
                  </ThemedView>
                )}

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
                (isUploading || 
                 (activeTab === 'receipt' && receiptMode === 'upload' && !selectedReceipt) ||
                 (activeTab === 'receipt' && receiptMode === 'url' && !receiptUrl.trim())) && styles.buttonDisabled
              ]}
              onPress={activeTab === 'manual' ? handleSubmit : uploadReceipt}
              disabled={
                isUploading || 
                (activeTab === 'receipt' && receiptMode === 'upload' && !selectedReceipt) ||
                (activeTab === 'receipt' && receiptMode === 'url' && !receiptUrl.trim())
              }
            >
              {isUploading ? (
                <ActivityIndicator color="white" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>
                  {activeTab === 'manual' ? 'Add Item to Fridge' : 
                   receiptMode === 'gmail' ? 'Process Gmail Receipt' : 'Process Receipt'}
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
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: Spacing.l,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  backButton: {
    padding: Spacing.xs,
  },
  form: {
    gap: Spacing.l,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.light.secondary,
    borderRadius: BorderRadius.m,
    padding: 4,
    marginBottom: Spacing.l,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: BorderRadius.s,
  },
  tabButtonActive: { backgroundColor: Colors.light.card, ...Shadows.soft },
  tabText: { fontWeight: '600', color: Colors.light.textSecondary, fontSize: 13 },
  tabTextActive: { color: Colors.light.text },
  input: {
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.m,
    padding: Spacing.m,
    fontSize: 16,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    // Manually applying shadow to avoid ViewStyle/TextStyle conflict
    shadowColor: '#2D3436',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  unitScroll: {
    flexDirection: 'row',
    height: 50,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.m,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  chipActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  chipText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  chipTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.s,
  },
  categoryCard: {
    width: '30%',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.m,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  categoryCardActive: {
    backgroundColor: Colors.light.primaryBg, // Now valid
    borderColor: Colors.light.primary,
  },
  categoryText: {
    fontSize: 13,
    color: Colors.light.text,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: Colors.light.primary,
    fontWeight: 'bold',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    padding: Spacing.m,
    borderRadius: BorderRadius.m,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: Spacing.s
  },
  dateDisplay: { fontSize: 16, fontWeight: '500' },
  iosDateContainer: { backgroundColor: Colors.light.card, borderRadius: BorderRadius.l, marginTop: Spacing.s, overflow: 'hidden' },
  receiptContainer: { paddingVertical: Spacing.l, backgroundColor: 'transparent', gap: Spacing.l },
  receiptModeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.light.border + '40',
    borderRadius: BorderRadius.circle,
    padding: 4,
    gap: 4
  },
  receiptModePill: { 
    flex: 1, 
    paddingVertical: 10, 
    alignItems: 'center', 
    borderRadius: BorderRadius.circle 
  },
  receiptModePillActive: { 
    backgroundColor: Colors.light.card, 
    ...Shadows.soft 
  },
  receiptModeText: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: Colors.light.textMuted 
  },
  receiptModeTextActive: { 
    color: Colors.light.tint 
  },
  receiptActionBox: {
    backgroundColor: Colors.light.card,
    paddingVertical: 12,
    borderRadius: BorderRadius.m,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  secondaryButtonText: {
    color: Colors.light.text,
    fontWeight: '600',
  },
  receiptName: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  errorText: {
    color: Colors.light.danger,
    fontSize: 13,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
