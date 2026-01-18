import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_BASE_URL } from '../constants/auth0';
import {
  BorderRadius,
  Colors,
  Shadows,
  Spacing,
  Typography,
} from '../constants/theme';
import { HouseholdInfo, useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (household: HouseholdInfo) => void; // ✅ NEW
};

export default function CreateHouseholdModal({
  visible,
  onClose,
  onCreated, // ✅ NEW
}: Props) {
  const { userId: authUserId, setHasHousehold } = useAuth(); // ✅ NEW
  const { userId: appUserId, setHouseholdId, setHouseholdInfo } = useApp();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [hasRequestedLocation, setHasRequestedLocation] = useState(false);

  const resetState = () => {
    setName('');
    setAddress('');
    setCity('');
    setState('');
    setZipCode('');
    setLatitude('');
    setLongitude('');
    setInviteCode(null);
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

      const [reverse] = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });

      if (reverse) {
        setAddress(
          reverse.street
            ? `${reverse.street} ${reverse.streetNumber ?? ''}`.trim()
            : '',
        );
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
    setHasRequestedLocation(true);
    handleUseLocation();
  }, [visible, hasRequestedLocation]);

  const handleCreate = async () => {
    const userId = authUserId ?? appUserId;
    if (!userId || !name.trim()) {
      setError('User is not available or household name is missing.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = { name: name.trim(), userId };

    const hasLocation =
      address.trim() ||
      city.trim() ||
      state.trim() ||
      zipCode.trim() ||
      (latitude.trim() && longitude.trim());

    if (hasLocation) {
      const location: Record<string, unknown> = {
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
      };

      if (latitude.trim() && longitude.trim()) {
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setError('Latitude and longitude must be numbers.');
          setIsSubmitting(false);
          return;
        }
        location.coordinates = { type: 'Point', coordinates: [lng, lat] };
      }

      payload.location = location;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/households`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to create household.');
      }

      const data = await response.json();
      setInviteCode(data.inviteCode ?? null);

      if (!data.householdId) {
        throw new Error('Missing household id.');
      }
      handleClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create household.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.center}>
        <View style={styles.card}>
          <Text style={styles.title}>Create Household</Text>

          <Text style={Typography.label}>Household Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. McTavish Apartment"
            placeholderTextColor={Colors.light.textSecondary}
          />

          {/* --- Location fields unchanged --- */}

          {inviteCode ? (
            <Text style={styles.successText}>Invite code: {inviteCode}</Text>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              style={[styles.saveBtn, isSubmitting && styles.disabledBtn]}
              disabled={isSubmitting}
            >
              <Text style={styles.saveText}>
                {isSubmitting ? 'Creating...' : 'Create'}
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
  row: { flexDirection: 'row', gap: Spacing.m },
  rowItem: { flex: 1 },
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
  successText: { color: Colors.light.success, fontWeight: '600' },
});
