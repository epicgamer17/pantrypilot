import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';

import { API_BASE_URL } from '../constants/auth0';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type LocationInput = {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  coordinates?: { type: 'Point'; coordinates: [number, number] };
};

const omitEmpty = (value: Record<string, string>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry.trim() !== ''));

export default function EditHouseholdModal({ visible, onClose }: Props) {
  const { householdId, householdInfo, setHouseholdInfo } = useApp();
  const { userId: authUserId } = useAuth();
  const { userId: appUserId } = useApp();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [hasRequestedLocation, setHasRequestedLocation] = useState(false);

  useEffect(() => {
    if (!visible || !householdInfo) return;
    setName(householdInfo.name ?? '');
    setAddress(householdInfo.location?.address ?? '');
    setCity(householdInfo.location?.city ?? '');
    setState(householdInfo.location?.state ?? '');
    setZipCode(householdInfo.location?.zipCode ?? '');
    const coords = householdInfo.location?.coordinates?.coordinates;
    if (coords && coords.length === 2) {
      setLongitude(String(coords[0]));
      setLatitude(String(coords[1]));
    }
  }, [visible, householdInfo]);

  const resetState = () => {
    setName('');
    setAddress('');
    setCity('');
    setState('');
    setZipCode('');
    setLatitude('');
    setLongitude('');
    setError(null);
    setIsSubmitting(false);
    setIsLocating(false);
    setHasRequestedLocation(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleUseLocation = async () => {
    setIsLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied.');
      }

      const current = await Location.getCurrentPositionAsync({});
      const { latitude: lat, longitude: lng } = current.coords;
      setLatitude(String(lat));
      setLongitude(String(lng));

      const [reverse] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (reverse) {
        setAddress(reverse.street ? `${reverse.street} ${reverse.streetNumber ?? ''}`.trim() : '');
        setCity(reverse.city ?? '');
        setState(reverse.region ?? '');
        setZipCode(reverse.postalCode ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location.');
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    if (!visible || hasRequestedLocation) return;
    if (householdInfo?.location?.coordinates?.coordinates?.length) {
      setHasRequestedLocation(true);
      return;
    }
    setHasRequestedLocation(true);
    handleUseLocation();
  }, [visible, hasRequestedLocation, householdInfo]);

  const handleUpdate = async () => {
    const userId = authUserId ?? appUserId;
    if (!userId) {
      setError('User is not available.');
      return;
    }

    if (!householdId) {
      setError('No household is selected in the app.');
      return;
    }

    const locationFields = omitEmpty({
      address,
      city,
      state,
      zipCode,
    });

    let location: LocationInput | undefined;
    if (Object.keys(locationFields).length) {
      location = { ...locationFields };
    }

    if (latitude.trim() && longitude.trim()) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setError('Latitude and longitude must be numbers.');
        return;
      }
      location = {
        ...(location ?? {}),
        coordinates: { type: 'Point', coordinates: [lng, lat] },
      };
    }

    const payload: Record<string, unknown> = {};
    if (name.trim()) payload.name = name.trim();
    if (location) payload.location = location;

    if (!Object.keys(payload).length) {
      setError('Provide at least one field to update.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/households/${householdId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-household-id': householdId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to update household.');
      }

      setHouseholdInfo({
        id: householdId,
        name: name.trim() || householdInfo?.name || '',
        location: location ?? householdInfo?.location,
        inviteCode: householdInfo?.inviteCode,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update household.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.center}>
        <View style={styles.card}>
          <Text style={styles.title}>Modify Household</Text>

          <Text style={Typography.label}>Household Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Optional"
            placeholderTextColor={Colors.light.textSecondary}
          />

          <Text style={Typography.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Optional"
            placeholderTextColor={Colors.light.textSecondary}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={Typography.label}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="Optional"
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={Typography.label}>State</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="Optional"
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>
          </View>

          <Text style={Typography.label}>Zip Code</Text>
          <TextInput
            style={styles.input}
            value={zipCode}
            onChangeText={setZipCode}
            placeholder="Optional"
            placeholderTextColor={Colors.light.textSecondary}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={Typography.label}>Latitude</Text>
              <TextInput
                style={styles.input}
                value={latitude}
                onChangeText={setLatitude}
                placeholder="Optional"
                placeholderTextColor={Colors.light.textSecondary}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={Typography.label}>Longitude</Text>
              <TextInput
                style={styles.input}
                value={longitude}
                onChangeText={setLongitude}
                placeholder="Optional"
                placeholderTextColor={Colors.light.textSecondary}
                keyboardType="numeric"
              />
            </View>
          </View>
          <TouchableOpacity
            onPress={handleUseLocation}
            style={[styles.locationButton, isLocating && styles.disabledBtn]}
            disabled={isLocating}>
            <Text style={styles.locationButtonText}>
              {isLocating ? 'Locating...' : 'Use my location'}
            </Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleUpdate}
              style={[styles.saveBtn, isSubmitting && styles.disabledBtn]}
              disabled={isSubmitting}>
              <Text style={styles.saveText}>
                {isSubmitting ? 'Saving...' : 'Save changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.light.card,
    padding: Spacing.xl,
    borderRadius: BorderRadius.l,
    ...Shadows.strong,
    gap: Spacing.s,
  },
  title: { ...Typography.subHeader, marginBottom: Spacing.s },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.s,
    padding: Spacing.m,
    fontSize: 16,
    marginBottom: Spacing.m,
    backgroundColor: Colors.light.background,
    color: Colors.light.text,
  },
  row: { flexDirection: 'row', gap: Spacing.m },
  rowItem: { flex: 1 },
  actions: {
    flexDirection: 'row',
    marginTop: Spacing.l,
    justifyContent: 'flex-end',
    gap: Spacing.m,
  },
  cancelBtn: {
    paddingVertical: Spacing.m,
    paddingHorizontal: Spacing.l,
    borderRadius: BorderRadius.s,
    backgroundColor: Colors.light.secondary,
  },
  cancelText: { color: Colors.light.text, fontWeight: '600' },
  saveBtn: {
    backgroundColor: Colors.light.primary,
    paddingVertical: Spacing.m,
    paddingHorizontal: Spacing.l,
    borderRadius: BorderRadius.s,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  locationButton: {
    backgroundColor: Colors.light.secondary,
    borderRadius: BorderRadius.s,
    paddingVertical: Spacing.m,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  locationButtonText: {
    color: Colors.light.text,
    fontWeight: '600',
  },
  saveText: { color: 'white', fontWeight: '600' },
  errorText: { color: Colors.light.danger },
});
