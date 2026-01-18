import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { API_BASE_URL } from '../constants/auth0';
import { Colors, BorderRadius, Spacing } from '../constants/theme';
import { useApp } from '../context/AppContext';

type Suggestion = { id: string; name: string };

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  onSelectItem?: (item: Suggestion) => void;
  onCreate?: (name: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showCreate?: boolean;
  inputStyle?: object;
};

export default function ItemNameAutocomplete({
  value,
  onChangeText,
  onSelectItem,
  onCreate,
  placeholder,
  autoFocus,
  showCreate = false,
  inputStyle,
}: Props) {
  const { userId, householdId } = useApp();
  const [remoteItems, setRemoteItems] = useState<Suggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);

  const getAuthHeaders = () => {
    const headers: Record<string, string> = {};
    if (userId) headers['x-user-id'] = userId;
    if (householdId) headers['x-household-id'] = householdId;
    return headers;
  };

  useEffect(() => {
    if (!value.trim()) {
      setRemoteItems([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/items?search=${encodeURIComponent(value.trim())}`,
          { headers: getAuthHeaders() },
        );
        if (!res.ok) {
          setRemoteItems([]);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setRemoteItems(
            data.map((item: { id?: string; _id?: string; name: string }) => ({
              id: String(item.id ?? item._id),
              name: item.name,
            })),
          );
        } else {
          setRemoteItems([]);
        }
      } catch (error) {
        setRemoteItems([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value, userId, householdId]);

  const filteredSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    return remoteItems.filter((item) =>
      item.name.toLowerCase().includes(query),
    );
  }, [value, remoteItems]);

  const hasExactMatch = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return false;
    return remoteItems.some((item) => item.name.toLowerCase() === query);
  }, [value, remoteItems]);

  const showSuggestions =
    isFocused &&
    (filteredSuggestions.length > 0 ||
      (showCreate && !hasExactMatch && value.trim()));

  return (
    <View style={styles.wrapper}>
      <TextInput
        style={[styles.input, inputStyle]}
        placeholder={placeholder}
        placeholderTextColor={Colors.light.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
      />
      {showSuggestions && (
        <View style={styles.suggestionBox}>
          {filteredSuggestions.slice(0, 6).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.suggestionItem}
              onPress={() => {
                onSelectItem?.(item);
                onChangeText(item.name);
                setIsFocused(false);
              }}
            >
              <Text style={styles.suggestionText}>{item.name}</Text>
            </TouchableOpacity>
          ))}
          {showCreate && !hasExactMatch && value.trim() && (
            <TouchableOpacity
              style={[styles.suggestionItem, styles.suggestionCreate]}
              onPress={() => {
                onCreate?.(value.trim());
                setIsFocused(false);
              }}
            >
              <Text style={styles.suggestionCreateText}>
                Create "{value.trim()}"
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 2,
  },
  input: {
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.m,
    padding: Spacing.m,
    fontSize: 16,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    shadowColor: '#2D3436',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  suggestionBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.s,
    marginTop: 6,
    overflow: 'hidden',
    zIndex: 10,
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  suggestionItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  suggestionText: { fontSize: 14, color: Colors.light.text },
  suggestionCreate: { backgroundColor: Colors.light.primaryBg },
  suggestionCreateText: { fontSize: 14, color: Colors.light.primary, fontWeight: '600' },
});
