import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, useWindowDimensions } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius, Shadows, Layout } from '../constants/theme';
import { API_BASE_URL, AUTH0_CLIENT_ID, AUTH0_DOMAIN } from '../constants/auth0';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { SurfaceCard } from '../components/ui/SurfaceCard';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { signIn, userToken } = useAuth(); // <- read userToken here
    const { setUserId, setHouseholdId } = useApp();
    const [authError, setAuthError] = useState<string | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [gmailOptIn, setGmailOptIn] = useState(false);
    const isWide = width >= 900;

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
            console.log('Auth response:', response);
            setIsSigningIn(true);
            setAuthError(null);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            try {
                const accessToken = response.authentication?.accessToken ?? response.params.access_token;
                if (!accessToken) throw new Error('Missing access token.');

                // 1. Fetch User Info from Auth0
                const userInfoResponse = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    signal: controller.signal,
                });

                console.log('User info response:', userInfoResponse);

                if (!userInfoResponse.ok) throw new Error('Failed to fetch user info.');
                const profile = await userInfoResponse.json();

                // 2. Create/Update User in your Backend
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

                // Parse the backend user object to check for householdId
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
                if (!resolvedUserId) {
                    throw new Error('Missing user id from backend.');
                }
                console.log('User has household:', hasHousehold);
                // 3. Update Global Auth State
                // Pass true/false so AuthContext knows where to redirect
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
        <View style={styles.container}>
            <View style={[styles.shell, isWide && styles.shellWide]}>
                <View style={[styles.hero, isWide && styles.heroWide]}>
                    <View style={styles.brandRow}>
                        <View style={styles.brandBadge}>
                            <Text style={styles.brandBadgeText}>KA</Text>
                        </View>
                        <Text style={styles.brandText}>KitchenAssist</Text>
                    </View>
                    <Text style={styles.heroTitle}>Stay ahead of the fridge.</Text>
                    <Text style={styles.heroBody}>
                        Track what you have, plan recipes, and keep your grocery list in sync across devices.
                    </Text>
                    <View style={styles.heroHighlights}>
                        <View style={styles.heroPill}>
                            <Text style={styles.heroPillText}>Waste insights</Text>
                        </View>
                        <View style={styles.heroPill}>
                            <Text style={styles.heroPillText}>Price tracking</Text>
                        </View>
                        <View style={styles.heroPill}>
                            <Text style={styles.heroPillText}>Smart lists</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.content}>
                    <SurfaceCard style={styles.authCard}>
                        <Text style={Typography.subHeader}>Welcome back</Text>
                        <Text style={styles.authBody}>
                            Sign in to manage your fridge, grocery lists, and recipes.
                        </Text>

                        <View style={styles.gmailToggleRow}>
                            <View style={styles.gmailToggleText}>
                                <Text style={styles.toggleTitle}>Enable Gmail read-only</Text>
                                <Text style={styles.gmailToggleHint}>
                                    Optional. Lets us read your Gmail metadata when you opt in.
                                </Text>
                            </View>
                            <Switch
                                value={gmailOptIn}
                                onValueChange={setGmailOptIn}
                                disabled={isSigningIn}
                                trackColor={{ false: Colors.light.border, true: Colors.light.success }}
                                thumbColor={gmailOptIn ? Colors.light.card : Colors.light.textMuted}
                            />
                        </View>

                        <PrimaryButton
                            title={isSigningIn ? 'Signing in...' : 'Continue with Auth0'}
                            disabled={!request || isSigningIn}
                            onPress={() => {
                                setAuthError(null);
                                promptAsync();
                            }}
                        />

                        {authError && (
                            <View style={styles.authErrorBox}>
                                <Text style={styles.authError}>{authError}</Text>
                            </View>
                        )}
                    </SurfaceCard>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.light.background,
        justifyContent: 'center',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.xxl,
    },
    shell: {
        gap: Spacing.xl,
        width: '100%',
        maxWidth: Layout.pageMaxWidth,
        alignSelf: 'center',
    },
    shellWide: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: Spacing.xxl,
    },
    hero: {
        gap: Spacing.m,
        padding: Layout.cardPadding,
        borderRadius: BorderRadius.l,
        backgroundColor: Colors.light.primaryBg,
        borderWidth: 1,
        borderColor: Colors.light.border,
    },
    heroWide: {
        flex: 1,
        minHeight: 360,
        justifyContent: 'center',
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: Colors.light.text,
    },
    heroBody: {
        ...Typography.body,
        color: Colors.light.textSecondary,
    },
    heroHighlights: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.s,
    },
    heroPill: {
        backgroundColor: Colors.light.card,
        paddingHorizontal: Spacing.m,
        paddingVertical: Spacing.s,
        borderRadius: BorderRadius.circle,
        borderWidth: 1,
        borderColor: Colors.light.border,
    },
    heroPillText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.light.textSecondary,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.s,
    },
    brandBadge: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.s,
        backgroundColor: Colors.light.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandBadgeText: {
        color: Colors.light.card,
        fontWeight: '800',
        letterSpacing: 1,
    },
    brandText: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.light.text,
    },
    content: {
        gap: Spacing.xl,
        maxWidth: Layout.contentMaxWidth,
        width: '100%',
        alignSelf: 'center',
    },
    authCard: {
        gap: Spacing.l,
    },
    authBody: {
        ...Typography.body,
        color: Colors.light.textSecondary,
    },
    gmailToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.m,
        padding: Spacing.m,
        backgroundColor: Colors.light.secondary,
        borderRadius: BorderRadius.m,
    },
    gmailToggleText: {
        flex: 1,
    },
    toggleTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.light.text,
    },
    gmailToggleHint: {
        color: Colors.light.textSecondary,
        marginTop: Spacing.xs,
        fontSize: 12,
    },
    authErrorBox: {
        backgroundColor: Colors.light.dangerBg,
        padding: Spacing.m,
        borderRadius: BorderRadius.m,
        borderWidth: 1,
        borderColor: Colors.light.danger,
    },
    authError: {
        color: Colors.light.danger,
        fontSize: 13,
        fontWeight: '600',
    },
});
