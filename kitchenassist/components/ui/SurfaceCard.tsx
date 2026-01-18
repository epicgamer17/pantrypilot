import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { BorderRadius, Colors, Layout, Shadows } from '../../constants/theme';

type SurfaceCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'soft';
};

export function SurfaceCard({ children, style, variant = 'default' }: SurfaceCardProps) {
  return (
    <View style={[styles.base, variant === 'soft' && styles.soft, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.light.card,
    borderRadius: BorderRadius.l,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: Layout.cardPadding,
    ...Shadows.default,
  },
  soft: {
    backgroundColor: Colors.light.primaryBg,
    ...Shadows.soft,
  },
});
