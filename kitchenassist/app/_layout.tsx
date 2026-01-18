import { Stack } from 'expo-router';
import { AppProvider } from '../context/AppContext';
import { AuthProvider } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export default function RootLayout() {
  return (
    // Wrap with AuthProvider first
    <AuthProvider>
      <AppProvider>
        <Stack screenOptions={{ contentStyle: { backgroundColor: Colors.light.background } }}>
          {/* Main Tab Routes */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* Login Screen (Outside of tabs) */}
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="add" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ headerShown: false }} />
        </Stack>
      </AppProvider>
    </AuthProvider>
  );
}
