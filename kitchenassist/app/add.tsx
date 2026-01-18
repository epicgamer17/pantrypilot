import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
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
  const [activeTab, setActiveTab] = useState<'manual' | 'receipt'>('manual');
  const [selectedReceipt, setSelectedReceipt] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Explicitly Typed Form State
  const [name, setName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Item['unit']>('unit');
  const [category, setCategory] = useState<Category>('Other');
  const defaultExpiry = new Date(Date.now() + 7 * 86400000);
  const [expiryDate, setExpiryDate] = useState(defaultExpiry);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [webCalendarVisible, setWebCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(defaultExpiry.getFullYear(), defaultExpiry.getMonth(), 1),
  );

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

    router.back();
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
    if (!selectedReceipt || !householdId || !userId) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      const fileName = selectedReceipt.fileName ?? `receipt-${Date.now()}.jpg`;
      const mimeType = selectedReceipt.mimeType ?? 'image/jpeg';
      if (Platform.OS === 'web') {
        const response = await fetch(selectedReceipt.uri);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: mimeType });
        formData.append('receipt', file);
      } else {
        formData.append('receipt', {
          uri: selectedReceipt.uri,
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

      await refreshData();
      Alert.alert('Receipt processed', 'Items have been added to your fridge.');
      router.back();
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

  const openWebCalendar = () => {
    setCalendarMonth(new Date(expiryDate.getFullYear(), expiryDate.getMonth(), 1));
    setWebCalendarVisible(true);
  };

  const getCalendarWeeks = (monthDate: Date) => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const daysInMonth = end.getDate();
    const startWeekday = start.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i += 1) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
    }
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

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
            onPress={() =>
              Platform.OS === 'web' ? openWebCalendar() : setShowDatePicker(true)
            }
          >
            <MaterialCommunityIcons
              name="calendar"
              size={20}
              color={Colors.light.primary}
            />
            <Text style={styles.dateText}>{expiryDate.toDateString()}</Text>
          </TouchableOpacity>

          {Platform.OS !== 'web' && (showDatePicker || Platform.OS === 'ios') && (
            <View
              style={Platform.OS === 'ios' ? styles.iosDatePicker : undefined}
            >
              <DateTimePicker
                value={expiryDate}
                mode="date"
                display="default"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            </View>
          )}
        </View>
        )}

        {activeTab === 'receipt' && (
          <View style={styles.form}>
            <Text style={Typography.subHeader}>Upload a receipt</Text>
            <Text style={Typography.body}>
              We will scan the receipt and add items to your fridge.
            </Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={pickReceipt}>
              <Text style={styles.secondaryButtonText}>
                {selectedReceipt ? 'Change receipt' : 'Choose receipt'}
              </Text>
            </TouchableOpacity>
            {selectedReceipt && (
              <Text style={styles.receiptName}>
                Selected: {selectedReceipt.fileName ?? selectedReceipt.uri.split('/').pop()}
              </Text>
            )}
            {uploadError && <Text style={styles.errorText}>{uploadError}</Text>}
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      {activeTab === 'manual' && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>Add to Fridge</Text>
          </TouchableOpacity>
        </View>
      )}

      {Platform.OS === 'web' && (
        <Modal visible={webCalendarVisible} transparent animationType="fade">
          <View style={styles.calendarOverlay}>
            <View style={styles.calendarCard}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  style={styles.calendarNavButton}
                  onPress={() =>
                    setCalendarMonth(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                    )
                  }
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.light.text} />
                </TouchableOpacity>
                <Text style={styles.calendarTitle}>
                  {calendarMonth.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
                <TouchableOpacity
                  style={styles.calendarNavButton}
                  onPress={() =>
                    setCalendarMonth(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                    )
                  }
                >
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.light.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.calendarWeekdays}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
                  <Text key={day} style={styles.calendarWeekdayText}>
                    {day}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {getCalendarWeeks(calendarMonth).map((week, weekIndex) => (
                  <View key={`week-${weekIndex}`} style={styles.calendarRow}>
                    {week.map((date, dayIndex) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isDisabled = !date || date < today;
                      const selected = date ? isSameDay(date, expiryDate) : false;
                      return (
                        <TouchableOpacity
                          key={`day-${weekIndex}-${dayIndex}`}
                          style={[
                            styles.calendarCell,
                            selected && styles.calendarCellSelected,
                            isDisabled && styles.calendarCellDisabled,
                          ]}
                          disabled={isDisabled}
                          onPress={() => {
                            if (!date) return;
                            setExpiryDate(date);
                            setWebCalendarVisible(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.calendarCellText,
                              selected && styles.calendarCellTextSelected,
                              isDisabled && styles.calendarCellTextDisabled,
                            ]}
                          >
                            {date ? date.getDate() : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>

              <View style={styles.calendarActions}>
                <TouchableOpacity
                  style={styles.calendarCancel}
                  onPress={() => setWebCalendarVisible(false)}
                >
                  <Text style={styles.calendarCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calendarApply}
                  onPress={() => {
                    setWebCalendarVisible(false);
                  }}
                >
                  <Text style={styles.calendarApplyText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {activeTab === 'receipt' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, isUploading && styles.disabledButton]}
            onPress={uploadReceipt}
            disabled={isUploading || !selectedReceipt}
          >
            <Text style={styles.submitButtonText}>
              {isUploading ? 'Uploading...' : 'Upload Receipt'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
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
    gap: Spacing.s,
  },
  dateText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  iosDatePicker: {
    alignItems: 'center',
    marginTop: Spacing.s,
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  calendarCard: {
    width: 340,
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.l,
    padding: Spacing.l,
    ...Shadows.strong,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.m,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  calendarNavButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.light.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarWeekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.s,
  },
  calendarWeekdayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  calendarGrid: {
    gap: Spacing.xs,
  },
  calendarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarCell: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellSelected: {
    backgroundColor: Colors.light.primary,
  },
  calendarCellDisabled: {
    backgroundColor: Colors.light.secondary,
  },
  calendarCellText: {
    color: Colors.light.text,
    fontSize: 13,
    fontWeight: '600',
  },
  calendarCellTextSelected: {
    color: 'white',
  },
  calendarCellTextDisabled: {
    color: Colors.light.textMuted,
  },
  calendarActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.s,
    marginTop: Spacing.l,
  },
  calendarCancel: {
    paddingVertical: Spacing.s,
    paddingHorizontal: Spacing.m,
    borderRadius: BorderRadius.m,
    backgroundColor: Colors.light.secondary,
  },
  calendarCancelText: {
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  calendarApply: {
    paddingVertical: Spacing.s,
    paddingHorizontal: Spacing.m,
    borderRadius: BorderRadius.m,
    backgroundColor: Colors.light.primary,
  },
  calendarApplyText: {
    color: 'white',
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.l,
    backgroundColor: Colors.light.background,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  submitButton: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.l,
    alignItems: 'center',
    ...Shadows.default,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
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
