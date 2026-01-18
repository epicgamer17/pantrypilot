import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    useRouter,
    useSegments,
    useRootNavigationState,
} from 'expo-router';

type AuthContextType = {
    signIn: (token: string, hasHousehold: boolean, userId: string) => void;
    signOut: () => void;
    setHasHousehold: (v: boolean) => void;
    userToken: string | null;
    userId: string | null;
    hasHousehold: boolean;
    isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
    signIn: () => null,
    signOut: () => null,
    setHasHousehold: () => null,
    userToken: null,
    userId: null,
    hasHousehold: false,
    isLoading: true,
});

export function useAuth() {
    return useContext(AuthContext);
}

function useProtectedRoute(
    userToken: string | null,
    hasHousehold: boolean,
    isLoading: boolean,
) {
    const segments = useSegments();
    const router = useRouter();
    const rootNavigationState = useRootNavigationState();

    useEffect(() => {
        if (!rootNavigationState?.key) return;
        if (isLoading) return;

        const path = '/' + segments.join('/');
        const isLogin = path.startsWith('/login');
        const isOnboarding = path.startsWith('/onboarding');

        // 🚫 NOT LOGGED IN → force login
        if (!userToken) {
            if (!isLogin) router.replace('/login');
            return;
        }

        // 🚫 LOGGED IN BUT NOT SET UP → onboarding only
        if (userToken && !hasHousehold) {
            console.log('Routing to onboarding as no household is set up');
            if (!isOnboarding) router.replace('/onboarding');
            return;
        }

        // ✅ LOGGED IN + SET UP → Ensure we are NOT on login/onboarding
        if (userToken && hasHousehold) {
            if (isLogin || isOnboarding) {
                router.replace('/fridge');
            }
        }
    }, [
        userToken,
        hasHousehold,
        isLoading,
        segments.join('/'),
        rootNavigationState?.key,
    ]);
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [userToken, setUserToken] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [hasHousehold, setHasHousehold] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const updateHasHousehold = (value: boolean) => {
        setHasHousehold(value);
        AsyncStorage.setItem(STORAGE_KEYS.hasHousehold, String(value)).catch(() => null);
    };

    const STORAGE_KEYS = {
        token: 'auth.userToken',
        userId: 'auth.userId',
        hasHousehold: 'auth.hasHousehold',
    };

    // Restore persisted auth state
    useEffect(() => {
        const restore = async () => {

            // await AsyncStorage.clear();

            try {
                const [token, storedUserId, storedHasHousehold] = await AsyncStorage.multiGet([
                    STORAGE_KEYS.token,
                    STORAGE_KEYS.userId,
                    STORAGE_KEYS.hasHousehold,
                ]);
                const tokenValue = token?.[1] ?? null;
                const userIdValue = storedUserId?.[1] ?? null;
                const hasHouseholdValue = storedHasHousehold?.[1] === 'true';
                if (tokenValue) setUserToken(tokenValue);
                if (userIdValue) setUserId(userIdValue);
                setHasHousehold(hasHouseholdValue);
            } catch (error) {
                console.log('Error restoring auth state:', error);
                setUserToken(null);
                setUserId(null);
                setHasHousehold(false);
            } finally {
                setIsLoading(false);
            }
        };
        restore();
    }, []);

    // hook that performs route guarding
    useProtectedRoute(userToken, hasHousehold, isLoading);

    const signIn = (token: string, userHasHousehold: boolean, userObjectId: string) => {
        setHasHousehold(userHasHousehold);
        setUserToken(token);
        setUserId(userObjectId);
        AsyncStorage.multiSet([
            [STORAGE_KEYS.token, token],
            [STORAGE_KEYS.userId, userObjectId],
            [STORAGE_KEYS.hasHousehold, String(userHasHousehold)],
        ]).catch(() => null);
    };

    const signOut = () => {
        setHasHousehold(false);
        setUserToken(null);
        setUserId(null);
        AsyncStorage.multiRemove([
            STORAGE_KEYS.token,
            STORAGE_KEYS.userId,
            STORAGE_KEYS.hasHousehold,
        ]).catch(() => null);
    };

    return (
        <AuthContext.Provider
            value={{
                signIn,
                signOut,
                setHasHousehold: updateHasHousehold, // Use the persistent setter
                userToken,
                userId,
                hasHousehold,
                isLoading,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
