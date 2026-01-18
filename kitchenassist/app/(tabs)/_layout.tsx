import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { Colors, Shadows } from '../../constants/theme';

export default function TabLayout() {
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.light.primary,
        tabBarInactiveTintColor: Colors.light.textSecondary,
        tabBarShowLabel: isWeb,
        tabBarStyle: {
          backgroundColor: Colors.light.card,
          borderTopWidth: 0,
          ...Shadows.strong,
          height: isWeb ? 60 : (Platform.OS === 'ios' ? 85 : 65),
          paddingTop: isWeb ? 5 : 10,
          paddingBottom: isWeb ? 5 : (Platform.OS === 'ios' ? 25 : 10),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 4,
        },
      }}
    >
      {/* CHANGED: Name is now 'fridge' */}
      <Tabs.Screen
        name="fridge"
        options={{
          title: 'Fridge',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "fridge" : "fridge-outline"} size={28} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="grocery"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "cart" : "cart-outline"} size={28} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Cook',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "chef-hat" : "chef-hat"} size={28} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "chart-box" : "chart-box-outline"} size={28} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "account-circle" : "account-circle-outline"} size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
