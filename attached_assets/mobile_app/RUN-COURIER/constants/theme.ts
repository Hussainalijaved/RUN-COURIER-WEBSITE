import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#0f1825",
    secondaryText: "#4a5568",
    buttonText: "#ffffff",
    tabIconDefault: "#4a5568",
    tabIconSelected: "#2196F3",
    link: "#2196F3",
    primary: "#2196F3",
    primaryLight: "#64B5F6",
    secondary: "#ffffff",
    error: "#f44336",
    success: "#00c853",
    warning: "#ff9800",
    backgroundRoot: "#f8f9fb",
    backgroundDefault: "#ffffff",
    backgroundSecondary: "#f1f3f6",
    backgroundTertiary: "#e8ebf0",
    glass: "rgba(255, 255, 255, 0.85)",
    glassOverlay: "rgba(255, 255, 255, 0.15)",
    glassBorder: "rgba(255, 255, 255, 0.3)",
    border: "#e1e5eb",
    borderFocus: "#1a2942",
    placeholder: "#9ca3af",
    cardShadow: "#1a2942",
  },
  dark: {
    text: "#ffffff",
    secondaryText: "#a0aab8",
    buttonText: "#1a2942",
    tabIconDefault: "#6b7888",
    tabIconSelected: "#ffffff",
    link: "#64b5f6",
    primary: "#64b5f6",
    primaryLight: "#90caf9",
    secondary: "#1a2942",
    error: "#ff5252",
    success: "#69f0ae",
    warning: "#ffab40",
    backgroundRoot: "#0d1421",
    backgroundDefault: "#1a2942",
    backgroundSecondary: "#243350",
    backgroundTertiary: "#2d4563",
    glass: "rgba(26, 41, 66, 0.85)",
    glassOverlay: "rgba(255, 255, 255, 0.08)",
    glassBorder: "rgba(255, 255, 255, 0.12)",
    border: "#2d4563",
    borderFocus: "#64b5f6",
    placeholder: "#6b7888",
    cardShadow: "#000000",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 54,
  buttonHeight: 54,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  full: 9999,
};

export const Typography = {
  largeTitle: {
    fontSize: 38,
    lineHeight: 46,
    fontWeight: "700" as const,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "600" as const,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "400" as const,
  },
  bodyMedium: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "500" as const,
  },
  subhead: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  button: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600" as const,
  },
  small: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "500" as const,
  },
};

export const Shadows = {
  card: {
    shadowColor: "#1a2942",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardLight: {
    shadowColor: "#1a2942",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  button: {
    shadowColor: "#1a2942",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "System",
    sansMedium: "System",
    sansBold: "System",
    rounded: "System",
    mono: "Menlo",
  },
  default: {
    sans: "System",
    sansMedium: "System",
    sansBold: "System",
    rounded: "System",
    mono: "monospace",
  },
  web: {
    sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    sansMedium: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    sansBold: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    rounded: "-apple-system, BlinkMacSystemFont, 'SF Pro Rounded', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
