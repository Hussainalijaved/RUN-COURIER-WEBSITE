import { View, type ViewProps, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";

import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Shadows } from "@/constants/theme";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  variant?: "default" | "glass" | "card" | "elevated";
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  variant = "default",
  ...otherProps
}: ThemedViewProps) {
  const { theme, isDark } = useTheme();

  const getBackgroundColor = () => {
    if (isDark && darkColor) {
      return darkColor;
    }
    if (!isDark && lightColor) {
      return lightColor;
    }

    switch (variant) {
      case "glass":
        return theme.glass;
      case "card":
        return theme.backgroundDefault;
      case "elevated":
        return theme.backgroundSecondary;
      default:
        return theme.backgroundRoot;
    }
  };

  const getExtraStyles = () => {
    if (variant === "glass") {
      return {
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: theme.glassBorder,
        overflow: "hidden" as const,
      };
    }
    if (variant === "card" || variant === "elevated") {
      return {
        borderRadius: BorderRadius.md,
        ...Shadows.cardLight,
      };
    }
    return {};
  };

  if (variant === "glass" && Platform.OS === "ios") {
    return (
      <BlurView
        intensity={80}
        tint={isDark ? "dark" : "light"}
        style={[
          { backgroundColor: theme.glass },
          getExtraStyles(),
          style,
        ]}
        {...otherProps}
      />
    );
  }

  return (
    <View
      style={[
        { backgroundColor: getBackgroundColor() },
        getExtraStyles(),
        style,
      ]}
      {...otherProps}
    />
  );
}
