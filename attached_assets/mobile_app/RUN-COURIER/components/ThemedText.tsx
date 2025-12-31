import { Text, type TextProps } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Typography } from "@/constants/theme";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "largeTitle" | "title" | "h1" | "h2" | "h3" | "h4" | "body" | "bodyMedium" | "subhead" | "caption" | "button" | "small" | "link";
  color?: "primary" | "secondary" | "success" | "warning" | "error" | "muted";
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "body",
  color,
  ...rest
}: ThemedTextProps) {
  const { theme, isDark } = useTheme();

  const getColor = () => {
    if (isDark && darkColor) {
      return darkColor;
    }

    if (!isDark && lightColor) {
      return lightColor;
    }

    if (color) {
      switch (color) {
        case "primary":
          return theme.primary;
        case "secondary":
          return theme.secondaryText;
        case "success":
          return theme.success;
        case "warning":
          return theme.warning;
        case "error":
          return theme.error;
        case "muted":
          return theme.placeholder;
        default:
          return theme.text;
      }
    }

    if (type === "link") {
      return theme.link;
    }

    if (type === "subhead" || type === "caption") {
      return theme.secondaryText;
    }

    return theme.text;
  };

  const getTypeStyle = () => {
    switch (type) {
      case "largeTitle":
        return Typography.largeTitle;
      case "title":
        return Typography.title;
      case "h1":
        return Typography.h1;
      case "h2":
        return Typography.h2;
      case "h3":
        return Typography.h3;
      case "h4":
        return Typography.h4;
      case "body":
        return Typography.body;
      case "bodyMedium":
        return Typography.bodyMedium;
      case "subhead":
        return Typography.subhead;
      case "caption":
        return Typography.caption;
      case "button":
        return Typography.button;
      case "small":
        return Typography.small;
      case "link":
        return Typography.link;
      default:
        return Typography.body;
    }
  };

  return (
    <Text style={[{ color: getColor() }, getTypeStyle(), style]} {...rest} />
  );
}
