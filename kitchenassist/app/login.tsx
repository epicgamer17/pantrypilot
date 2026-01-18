import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../constants/theme';
import { API_BASE_URL, AUTH0_CLIENT_ID, AUTH0_DOMAIN } from '../constants/auth0';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
    const router = useRouter();
    const { signIn, userToken } = useAuth(); // <- read userToken here
    const { setUserId, setHouseholdId } = useApp();
    const [authError, setAuthError] = useState<string | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);

    const discovery = AuthSession.useAutoDiscovery(`https://${AUTH0_DOMAIN}`);
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'kitchenassist' });

    const [request, response, promptAsync] = AuthSession.useAuthRequest(
        {
            clientId: AUTH0_CLIENT_ID,
            redirectUri,
            scopes: ['openid', 'profile', 'email'],
            responseType: AuthSession.ResponseType.Token,
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
            <View style={styles.content}>
                <Text style={Typography.header}>KitchenAssist</Text>

                <View style={styles.authCard}>
                    <Text style={Typography.subHeader}>Welcome Back</Text>
                    <Text style={Typography.body}>
                        Sign in to manage your fridge, grocery lists, and recipes.
                    </Text>

                    <TouchableOpacity
                        style={[styles.authButton, isSigningIn && styles.authButtonDisabled]}
                        disabled={!request || isSigningIn}
                        onPress={() => {
                            setAuthError(null);
                            promptAsync();
                        }}
                    >
                        <Text style={styles.authButtonText}>
                            {isSigningIn ? 'Signing in...' : 'Continue with Auth0'}
                        </Text>
                    </TouchableOpacity>

                    {authError && <Text style={styles.authError}>{authError}</Text>}
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
        padding: Spacing.xl,
    },
    content: {
        gap: Spacing.xl,
        maxWidth: 500,
        width: '100%',
        alignSelf: 'center',
    },
    authCard: {
        backgroundColor: Colors.light.card,
        borderRadius: BorderRadius.l,
        padding: Spacing.l,
        gap: Spacing.m,
        ...Shadows.default,
    },
    authButton: {
        backgroundColor: Colors.light.tint,
        paddingVertical: Spacing.m,
        borderRadius: BorderRadius.m,
        alignItems: 'center',
        marginTop: Spacing.s,
    },
    authButtonDisabled: { opacity: 0.6 },
    authButtonText: { color: 'white', fontWeight: '700', fontSize: 16 },
    authError: { color: Colors.light.danger, marginTop: Spacing.xs, textAlign: 'center' },
});
