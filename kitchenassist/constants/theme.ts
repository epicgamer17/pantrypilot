import { Platform, ViewStyle, TextStyle } from 'react-native';

// 1. PALETTE
const Palette = {
  primary: '#2D3436',
  primarySoft: '#636E72',
  primaryBg: '#F0F2F5',
  accent: '#0984E3',
  success: '#00B894',
  successBg: '#E6FFFA',
  warning: '#FDCB6E',
  warningBg: '#FFFBE6',
  danger: '#FF7675',
  dangerBg: '#FFF0F0',
  info: '#74B9FF',
  infoBg: '#E8F4FF',
  gray900: '#2D3436',
  gray700: '#636E72',
  gray500: '#B2BEC3',
  gray300: '#DFE6E9',
  gray100: '#F5F6FA',
  white: '#FFFFFF',
};

// 2. SPACING
export const Spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
};

// 3. BORDERS
export const BorderRadius = {
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  circle: 9999,
};

// 4. SHADOWS
// Helper to generate platform-specific shadows
const createShadow = (width: number, height: number, radius: number, opacity: number, elevation: number) => {
  return Platform.select({
    web: {
      boxShadow: `${width}px ${height}px ${radius}px rgba(45, 52, 54, ${opacity})`,
    },
    default: {
      shadowColor: '#2D3436',
      shadowOffset: { width, height },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation,
    },
  }) as ViewStyle;
};

export const Shadows = {
  default: createShadow(0, 4, 12, 0.08, 3),
  strong: createShadow(0, 8, 16, 0.12, 6),
  soft: createShadow(0, 2, 6, 0.04, 1),
};

// 5. TYPOGRAPHY
export const Typography = {
  header: {
    fontSize: 28,
    fontWeight: '800',
    color: Palette.gray900,
    marginBottom: Spacing.s,
    letterSpacing: -0.5,
  } as TextStyle,
  subHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: Palette.gray900,
    marginBottom: Spacing.xs,
  } as TextStyle,
  body: {
    fontSize: 16,
    color: Palette.gray700,
    lineHeight: 24,
  } as TextStyle,
  caption: {
    fontSize: 13,
    color: Palette.gray500,
    fontWeight: '500',
  } as TextStyle,
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  } as TextStyle,
};

// 6. SEMANTIC COLORS
export const Colors = {
  light: {
    text: Palette.gray900,
    textSecondary: Palette.gray700,
    textMuted: Palette.gray500,
    background: Palette.gray100,
    card: Palette.white,
    tint: Palette.accent,
    border: Palette.gray300,
    primary: Palette.primary,
    primaryBg: Palette.primaryBg,
    secondary: Palette.gray300,
    accent: Palette.accent,
    success: Palette.success,
    successBg: Palette.successBg,
    warning: Palette.warning,
    warningBg: Palette.warningBg,
    danger: Palette.danger,
    dangerBg: Palette.dangerBg,
    info: Palette.info,
    infoBg: Palette.infoBg,
  },
  dark: { ...Palette }
};