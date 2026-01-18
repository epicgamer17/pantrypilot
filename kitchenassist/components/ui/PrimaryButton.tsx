import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Buttons, Colors } from '../../constants/theme';

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ title, onPress, disabled }: PrimaryButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.disabled]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
    >
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    ...Buttons.primary,
  },
  disabled: {
    ...Buttons.primaryDisabled,
  },
  text: {
    ...Buttons.primaryText,
    color: Colors.light.card,
  },
});
