import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, Switch, Platform, ActivityIndicator } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../constants/theme';
import { API_BASE_URL, AUTH0_CLIENT_ID, AUTH0_DOMAIN } from '../constants/auth0';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ThemedView } from '../components/themed-view';
import { ThemedText } from '../components/themed-text';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
    const router = useRouter();
    const { signIn, userToken } = useAuth();
    const { setUserId, setHouseholdId } = useApp();
    const [authError, setAuthError] = useState<string | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [gmailOptIn, setGmailOptIn] = useState(false);

    const discovery = AuthSession.useAutoDiscovery(`https://${AUTH0_DOMAIN}`);
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'kitchenassist' });

    const [request, response, promptAsync] = AuthSession.useAuthRequest(
        {
            clientId: AUTH0_CLIENT_ID,
            redirectUri,
            scopes: ['openid', 'profile', 'email'],
            responseType: AuthSession.ResponseType.Token,
            extraParams: gmailOptIn
                ? {
                    connection: 'google-oauth2',
                    connection_scope: 'https://www.googleapis.com/auth/gmail.readonly',
                    prompt: 'consent',
                }
                : undefined,
        },
        discovery,
    );

    useEffect(() => {
        if (userToken) {
            router.replace('/fridge');
        }
    }, [userToken, router]);

    useEffect(() => {
        if (response?.type === 'error') {
            setAuthError(response.error?.message ?? 'Authentication failed.');
        }
    }, [response]);

    useEffect(() => {
        const handleAuth = async () => {
            if (response?.type !== 'success') return;
            setIsSigningIn(true);
            setAuthError(null);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            try {
                const accessToken = response.authentication?.accessToken ?? response.params.access_token;
                if (!accessToken) throw new Error('Missing access token.');

                const userInfoResponse = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    signal: controller.signal,
                });

                if (!userInfoResponse.ok) throw new Error('Failed to fetch user info.');
                const profile = await userInfoResponse.json();

                const createResponse = await fetch(`${API_BASE_URL}/users/auth0`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        auth0UserId: profile.sub,
                        email: profile.email,
                        firstName: profile.given_name,
                        lastName: profile.family_name,
                        auth0: {
                            provider: profile.sub?.split('|')[0],
                            emailVerified: profile.email_verified,
                            gmailReadOnlyEnabled: gmailOptIn,
                        },
                    }),
                    signal: controller.signal,
                });

                if (!createResponse.ok) throw new Error('Failed to create user.');

                const backendUser = await createResponse.json();
                const resolvedHouseholdId =
                    backendUser.householdId?.$oid ??
                    backendUser.householdId?.toString?.() ??
                    backendUser.householdId ??
                    null;
                const hasHousehold = !!resolvedHouseholdId;
                const resolvedUserId =
                    backendUser._id?.$oid ??
                    backendUser._id?.toString?.() ??
                    backendUser._id ??
                    backendUser.id;

                if (!resolvedUserId) throw new Error('Missing user id from backend.');

                signIn(accessToken, hasHousehold, String(resolvedUserId));
                setUserId(String(resolvedUserId));
                setHouseholdId(hasHousehold ? String(resolvedHouseholdId) : null);

            } catch (error) {
                const message = error instanceof Error && error.name === 'AbortError'
                    ? 'Auth request timed out.'
                    : error instanceof Error ? error.message : 'Authentication failed.';
                setAuthError(message);
            } finally {
                clearTimeout(timeout);
                setIsSigningIn(false);
            }
        };

        handleAuth();
    }, [response]);

    return (
        <ThemedView style={styles.container}>
            <ThemedView style={styles.content}>
                <ThemedText type="title" style={styles.headerText}>Pantry Pilot</ThemedText>

                <ThemedView style={styles.authCard}>
                    <ThemedText type="subtitle">Welcome Back</ThemedText>
                    <ThemedText style={styles.description}>
                        Sign in to manage your fridge, grocery lists, and smart recipes.
                    </ThemedText>

                    <ThemedView style={styles.gmailToggleRow}>
                        <ThemedView style={styles.gmailToggleText}>
                            <ThemedText type="defaultSemiBold">Enable Gmail integration</ThemedText>
                            <ThemedText style={styles.gmailToggleHint}>
                                Optional. Automatically sync grocery items from receipts.
                            </ThemedText>
                        </ThemedView>
                        <Switch
                            value={gmailOptIn}
                            onValueChange={setGmailOptIn}
                            disabled={isSigningIn}
                            trackColor={{ false: Colors.light.border, true: Colors.light.tint }}
                        />
                    </ThemedView>

                    <TouchableOpacity
                        style={[
                            styles.authButton,
                            isSigningIn && styles.authButtonDisabled,
                            { backgroundColor: Colors.light.tint }
                        ]}
                        disabled={!request || isSigningIn}
                        onPress={() => {
                            setAuthError(null);
                            promptAsync();
                        }}
                    >
                        {isSigningIn ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <ThemedText style={styles.authButtonText}>Continue with Auth0</ThemedText>
                        )}
                    </TouchableOpacity>

                    {authError && (
                        <ThemedText style={styles.authError}>{authError}</ThemedText>
                    )}
                </ThemedView>

                <ThemedText style={styles.footerCaption}>
                    Secure login powered by Auth0
                </ThemedText>
            </ThemedView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    content: {
        gap: Spacing.xl,
        maxWidth: 480, // Optimized for desktop readability
        width: '100%',
        alignSelf: 'center',
        backgroundColor: 'transparent',
    },
    headerText: {
        textAlign: 'center',
        marginBottom: Spacing.m,
        color: Colors.light.tint,
    },
    authCard: {
        backgroundColor: Colors.light.card,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        gap: Spacing.l,
        ...Shadows.strong, // Elevated card design
    },
    description: {
        opacity: 0.8,
        marginBottom: Spacing.s,
    },
    gmailToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.m,
        backgroundColor: Colors.light.primaryBg,
        borderRadius: BorderRadius.m,
        gap: Spacing.m,
    },
    gmailToggleText: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    gmailToggleHint: {
        fontSize: 12,
        opacity: 0.6,
        marginTop: 2,
    },
    authButton: {
        paddingVertical: Spacing.l,
        borderRadius: BorderRadius.m,
        alignItems: 'center',
        marginTop: Spacing.m,
        ...Platform.select({
            web: { cursor: 'pointer' } as any,
        }),
    },
    authButtonDisabled: {
        opacity: 0.6
    },
    authButtonText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 16
    },
    authError: {
        color: Colors.light.danger,
        marginTop: Spacing.xs,
        textAlign: 'center',
        fontSize: 14,
    },
    footerCaption: {
        textAlign: 'center',
        fontSize: 12,
        opacity: 0.5,
        backgroundColor: 'transparent',
    }
});