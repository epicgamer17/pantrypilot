import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import CreateHouseholdModal from '@/components/CreateHouseholdModal';
import EditHouseholdModal from '@/components/EditHouseholdModal';
import { API_BASE_URL, AUTH0_CLIENT_ID, AUTH0_DOMAIN } from '@/constants/auth0';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

export default function AccountScreen() {
  const router = useRouter();

  const { setHouseholdId, setHouseholdInfo, householdInfo, householdId } = useApp();
  const { userId: authUserId, setHasHousehold, signIn, hasHousehold } = useAuth();
  const { userId: appUserId } = useApp();

  const [inviteCode, setInviteCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [gmailOptIn, setGmailOptIn] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [isGmailUpdating, setIsGmailUpdating] = useState(false);
  const [auth0Profile, setAuth0Profile] = useState<Record<string, any> | null>(null);
  const [members, setMembers] = useState<Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  }> | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const discovery = AuthSession.useAutoDiscovery(`https://${AUTH0_DOMAIN}`);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'kitchenassist' });

  const [gmailRequest, , gmailPromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: AUTH0_CLIENT_ID,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.Token,
      extraParams: {
        connection: 'google-oauth2',
        connection_scope: 'https://www.googleapis.com/auth/gmail.readonly',
        prompt: 'consent',
      },
    },
    discovery,
  );

  const userId = authUserId ?? appUserId;

  useEffect(() => {
    const fetchUser = async () => {
      if (!userId) return;
      try {
        const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
          headers: { 'x-user-id': userId },
        });
        if (!response.ok) throw new Error('Failed to fetch account settings.');
        const data = await response.json();
        setAuth0Profile(data.auth0 ?? null);
        setGmailOptIn(Boolean(data.auth0?.gmailReadOnlyEnabled));
      } catch (error) {
        setGmailError(error instanceof Error ? error.message : 'Failed to fetch account settings.');
      }
    };
    fetchUser();
  }, [userId]);

  useEffect(() => {
    const fetchMembers = async () => {
      if (!userId || !householdId) return;
      setIsMembersLoading(true);
      setMembersError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/households/${householdId}/members`,
          {
            headers: {
              'x-user-id': userId,
              'x-household-id': householdId,
            },
          },
        );
        if (!response.ok) throw new Error('Failed to fetch household members.');
        const data = await response.json();
        setMembers(Array.isArray(data) ? data : []);
      } catch (error) {
        setMembersError(error instanceof Error ? error.message : 'Failed to fetch household members.');
      } finally {
        setIsMembersLoading(false);
      }
    };
    fetchMembers();
  }, [userId, householdId]);

  const formatLocation = () => {
    const location = householdInfo?.location;
    if (!location) return null;
    const parts: string[] = [];
    if (location.address) parts.push(location.address);
    const cityStateZip = [location.city, location.state, location.zipCode]
      .filter(Boolean)
      .join(' ');
    if (cityStateZip) parts.push(cityStateZip);
    return parts.join(', ');
  };

  const formatMembers = () => {
    if (!members?.length) return 'No members found.';
    const formatted = members.map((member) => {
      const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
      return name || member.email || 'Member';
    });
    return formatted.join(', ');
  };

  const updateAuth0 = async (updates: Record<string, any>) => {
    if (!userId) return false;
    const nextAuth0 = { ...(auth0Profile ?? {}), ...updates };
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ auth0: nextAuth0 }),
      });
      if (!response.ok) throw new Error('Failed to update account settings.');
      setAuth0Profile(nextAuth0);
      return true;
    } catch (error) {
      setGmailError(error instanceof Error ? error.message : 'Failed to update account settings.');
      return false;
    }
  };

  const handleGmailToggle = async (nextValue: boolean) => {
    if (!userId) {
      setGmailError('User is not available.');
      return;
    }

    setGmailError(null);
    setGmailOptIn(nextValue);

    if (!nextValue) {
      setIsGmailUpdating(true);
      const ok = await updateAuth0({ gmailReadOnlyEnabled: false });
      if (!ok) setGmailOptIn(true);
      setIsGmailUpdating(false);
      return;
    }

    if (!gmailRequest) {
      setGmailError('Gmail auth is not ready.');
      setGmailOptIn(false);
      return;
    }

    setIsGmailUpdating(true);
    const result = await gmailPromptAsync();
    if (result.type !== 'success') {
      setGmailOptIn(false);
      setIsGmailUpdating(false);
      return;
    }

    const accessToken =
      result.authentication?.accessToken ?? result.params?.access_token;
    if (!accessToken) {
      setGmailError('Missing access token.');
      setGmailOptIn(false);
      setIsGmailUpdating(false);
      return;
    }

    try {
      const profileResponse = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!profileResponse.ok) {
        throw new Error('Failed to fetch Auth0 profile.');
      }
      const profile = await profileResponse.json();
      if (!profile?.sub) {
        throw new Error('Missing Auth0 user id.');
      }

      const linkResponse = await fetch(`${API_BASE_URL}/users/${userId}/link-google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ googleSub: profile.sub }),
      });
      if (!linkResponse.ok) {
        throw new Error('Failed to link Google account.');
      }
    } catch (error) {
      setGmailError(error instanceof Error ? error.message : 'Failed to link Google account.');
      setGmailOptIn(false);
      setIsGmailUpdating(false);
      return;
    }

    const ok = await updateAuth0({ gmailReadOnlyEnabled: true });
    if (!ok) {
      setGmailOptIn(false);
      setIsGmailUpdating(false);
      return;
    }

    signIn(accessToken, hasHousehold, userId);
    setIsGmailUpdating(false);
  };

  const handleLeaveHousehold = async () => {
    if (!userId) {
      setLeaveError('User is not available.');
      return;
    }
    if (!hasHousehold) return;
    setIsLeaving(true);
    setLeaveError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/leave-household`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
      });
      if (!response.ok) throw new Error('Failed to leave household.');
      setHasHousehold(false);
      setHouseholdId(null);
      setHouseholdInfo(null);
      setMembers(null);
    } catch (error) {
      setLeaveError(error instanceof Error ? error.message : 'Failed to leave household.');
    } finally {
      setIsLeaving(false);
    }
  };

  const handleJoin = async () => {
    if (hasHousehold) {
      setJoinError('You already belong to a household.');
      return;
    }
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={Typography.header}>Account</Text>
      <Text style={Typography.body}>Manage your household and connected services.</Text>

      <View style={styles.card}>
        <Text style={Typography.subHeader}>Connected services</Text>
        <Text style={Typography.body}>
          Optional. You can opt in to Gmail read-only access.
        </Text>
        <View style={styles.gmailToggleRow}>
          <View style={styles.gmailToggleText}>
            <Text style={Typography.body}>Gmail read-only</Text>
            <Text style={styles.gmailToggleHint}>
              Allows us to read Gmail metadata when you opt in.
            </Text>
            <Text style={styles.gmailToggleHint}>
              Disconnecting requires revoking access in your Google account settings.
            </Text>
          </View>
          <Switch
            value={gmailOptIn}
            onValueChange={handleGmailToggle}
            disabled={isGmailUpdating}
          />
        </View>
        {gmailError ? <Text style={styles.errorText}>{gmailError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={Typography.subHeader}>Household</Text>
        <Text style={Typography.body}>
          {hasHousehold
            ? (householdInfo?.name ? householdInfo.name : 'Household linked')
            : 'Not connected to a household yet.'}
        </Text>
        {hasHousehold && householdInfo?.inviteCode ? (
          <Text style={styles.detailText}>
            Invite code: {householdInfo.inviteCode}
          </Text>
        ) : null}
        {hasHousehold ? (
          <Text style={styles.detailText}>
            Location: {formatLocation() ?? 'Not set'}
          </Text>
        ) : null}
        {hasHousehold ? (
          <Text style={styles.detailText}>
            Members: {isMembersLoading ? 'Loading...' : formatMembers()}
          </Text>
        ) : null}
        {hasHousehold ? (
          <TouchableOpacity
            style={[styles.dangerButton, isLeaving && styles.disabledButton]}
            onPress={handleLeaveHousehold}
            disabled={isLeaving}
          >
            <Text style={styles.buttonText}>
              {isLeaving ? 'Leaving...' : 'Leave household'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {membersError ? <Text style={styles.errorText}>{membersError}</Text> : null}
        {leaveError ? <Text style={styles.errorText}>{leaveError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={Typography.subHeader}>Create</Text>
        <Text style={Typography.body}>
          Start a new household and invite others with a code.
        </Text>
        {hasHousehold ? (
          <Text style={styles.helperText}>
            You already belong to a household.
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.primaryButton, hasHousehold && styles.disabledButton]}
          onPress={() => setShowCreateModal(true)}
          disabled={hasHousehold}
        >
          <Text style={styles.buttonText}>Create household</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={Typography.subHeader}>Join</Text>
        {hasHousehold ? (
          <Text style={styles.helperText}>
            You already belong to a household.
          </Text>
        ) : null}
        <TextInput
          placeholder="Invite code"
          placeholderTextColor={Colors.light.textSecondary}
          value={inviteCode}
          onChangeText={setInviteCode}
          style={styles.input}
        />
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            (isJoining || hasHousehold) && styles.disabledButton,
          ]}
          onPress={handleJoin}
          disabled={isJoining || hasHousehold}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: Spacing.xl,
    gap: Spacing.l,
    paddingBottom: Spacing.xl * 2,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.l,
    padding: Spacing.l,
    gap: Spacing.s,
    ...Shadows.default,
  },
  gmailToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.m,
  },
  gmailToggleText: {
    flex: 1,
  },
  gmailToggleHint: {
    color: Colors.light.textSecondary,
    marginTop: Spacing.xs,
    fontSize: 12,
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
  dangerButton: {
    backgroundColor: Colors.light.danger,
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
  helperText: {
    color: Colors.light.textSecondary,
  },
  detailText: {
    color: Colors.light.textSecondary,
  },
  errorText: {
    color: Colors.light.danger,
  },
});
