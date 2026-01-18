import React from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle, StyleProp, TouchableOpacityProps, ViewProps } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface CardProps extends TouchableOpacityProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    variant?: 'default' | 'elevated' | 'outlined';
    // Add pointerEvents explicitly to the interface
    pointerEvents?: ViewProps['pointerEvents'];
}

export function Card({ children, style, onPress, variant = 'elevated', pointerEvents, ...props }: CardProps) {
    const containerStyle = [
        styles.base,
        variant === 'elevated' && styles.elevated,
        variant === 'outlined' && styles.outlined,
        style,
        // Apply pointerEvents as a style on web if needed, though strictly it's a prop
        Platform.OS === 'web' && pointerEvents ? { pointerEvents } : undefined
    ];

    if (onPress || props.onLongPress) {
        return (
            <TouchableOpacity
                style={containerStyle}
                onPress={onPress}
                activeOpacity={0.7}
                {...props}
            >
                {children}
            </TouchableOpacity>
        );
    }

    // Pass pointerEvents directly to View
    return <View style={containerStyle} pointerEvents={pointerEvents} {...props}>{children}</View>;
}

import { Platform } from 'react-native';

const styles = StyleSheet.create({
    base: {
        backgroundColor: Colors.light.card,
        borderRadius: BorderRadius.l,
        padding: Spacing.l,
        marginBottom: Spacing.m,
    },
    elevated: {
        ...Shadows.default,
    },
    outlined: {
        borderWidth: 1,
        borderColor: Colors.light.border,
    },
});