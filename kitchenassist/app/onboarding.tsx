import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import CreateHouseholdModal from '@/components/CreateHouseholdModal';
import EditHouseholdModal from '@/components/EditHouseholdModal';
import { API_BASE_URL } from '@/constants/auth0';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';

export default function OnboardingScreen() {
  const router = useRouter();

  const { setHouseholdId, setHouseholdInfo } = useApp();
  const { userId: authUserId, setHasHousehold } = useAuth();
  const { userId: appUserId } = useApp();

  const [inviteCode, setInviteCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    const userId = authUserId ?? appUserId;
    if (!userId || !inviteCode) {
      setJoinError('User is not available or invite code is missing.');
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/households/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ inviteCode, userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to join household.');
      }

      const data = await response.json();

      if (data.householdId) {
        const householdId = String(data.householdId);

        // Update app-level household state
        setHouseholdId(householdId);

        const householdResponse = await fetch(
          `${API_BASE_URL}/households/${householdId}`,
          {
            headers: {
              'x-user-id': userId,
              'x-household-id': householdId,
            },
          }
        );

        if (householdResponse.ok) {
          const household = await householdResponse.json();
          setHouseholdInfo({
            id: householdId,
            name: household.name ?? '',
            location: household.location ?? undefined,
            inviteCode: household.inviteCode ?? undefined,
          });
        } else {
          setHouseholdInfo({ id: householdId, name: '' });
        }

        // 🔑 Mark auth state as having household
        setHasHousehold(true);

        // 🚀 Go to fridge
        router.replace('/fridge');
      }
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Failed to join household.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={Typography.header}>Set up your household</Text>
      <Text style={Typography.body}>
        Create a new household or join one using an invite code.
      </Text>

      <View style={styles.card}>
        <Text style={Typography.subHeader}>Create</Text>
        <Text style={Typography.body}>
          Start a new household and invite others with a code.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.buttonText}>Create household</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={Typography.subHeader}>Join</Text>
        <TextInput
          placeholder="Invite code"
          placeholderTextColor={Colors.light.textSecondary}
          value={inviteCode}
          onChangeText={setInviteCode}
          style={styles.input}
        />
        <TouchableOpacity
          style={[styles.secondaryButton, isJoining && styles.disabledButton]}
          onPress={handleJoin}
          disabled={isJoining}
        >
          <Text style={styles.buttonText}>
            {isJoining ? 'Joining...' : 'Join household'}
          </Text>
        </TouchableOpacity>
        {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={Typography.subHeader}>Modify</Text>
        <Text style={Typography.body}>
          Update your household details like name or location.
        </Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setShowEditModal(true)}
        >
          <Text style={styles.buttonText}>Modify household</Text>
        </TouchableOpacity>
      </View>

      <CreateHouseholdModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(household) => {
          // 🔑 Called by modal after successful creation
          setHouseholdId(household.id);
          setHouseholdInfo(household);
          setHasHousehold(true);
          setShowCreateModal(false);
          router.replace('/fridge');
        }}
      />

      <EditHouseholdModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: Spacing.xl,
    gap: Spacing.l,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.l,
    padding: Spacing.l,
    gap: Spacing.s,
    ...Shadows.default,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.m,
    paddingHorizontal: Spacing.m,
    paddingVertical: Spacing.s,
    color: Colors.light.text,
  },
  primaryButton: {
    backgroundColor: Colors.light.tint,
    borderRadius: BorderRadius.m,
    paddingVertical: Spacing.s,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: BorderRadius.m,
    paddingVertical: Spacing.s,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
  },
  errorText: {
    color: Colors.light.danger,
  },
});
