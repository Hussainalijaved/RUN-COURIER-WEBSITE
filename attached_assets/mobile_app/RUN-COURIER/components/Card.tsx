import React, { ReactNode } from "react";
import { StyleSheet, Pressable, View, ViewStyle, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";

interface CardProps {
  children: ReactNode;
  elevation?: 0 | 1 | 2 | 3;
  variant?: "default" | "glass" | "outline" | "filled";
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  noPadding?: boolean;
}

const springConfig: WithSpringConfig = {
  damping: 20,
  mass: 0.4,
  stiffness: 200,
  overshootClamping: true,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({ 
  children, 
  elevation = 1, 
  variant = "glass",
  onPress, 
  disabled = false,
  style,
  noPadding = false,
}: CardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const getBackgroundColor = () => {
    switch (variant) {
      case "glass":
        return theme.glass;
      case "outline":
        return "transparent";
      case "filled":
        return theme.primary;
      default:
        switch (elevation) {
          case 0:
            return theme.backgroundRoot;
          case 1:
            return theme.backgroundDefault;
          case 2:
            return theme.backgroundSecondary;
          case 3:
            return theme.backgroundTertiary;
          default:
            return theme.backgroundDefault;
        }
    }
  };

  const getBorderStyle = () => {
    if (variant === "outline") {
      return { borderWidth: 1.5, borderColor: theme.border };
    }
    if (variant === "glass") {
      return { borderWidth: 1, borderColor: theme.glassBorder };
    }
    return {};
  };

  const getShadow = () => {
    if (variant === "outline" || elevation === 0) {
      return Shadows.none;
    }
    if (elevation >= 2) {
      return Shadows.card;
    }
    return Shadows.cardLight;
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled && onPress) {
      scale.value = withSpring(0.98, springConfig);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
  };

  const handlePress = () => {
    if (!disabled && onPress) {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress();
    }
  };

  const cardStyle = [
    styles.card,
    { backgroundColor: getBackgroundColor() },
    getBorderStyle(),
    getShadow(),
    noPadding && styles.noPadding,
    disabled && styles.disabled,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[cardStyle, animatedStyle]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  noPadding: {
    padding: 0,
  },
  disabled: {
    opacity: 0.5,
  },
});
