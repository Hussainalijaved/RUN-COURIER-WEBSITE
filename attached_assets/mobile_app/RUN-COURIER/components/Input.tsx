import React, { useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  TextInputProps,
  ViewStyle,
  Pressable,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: keyof typeof Feather.glyphMap;
  containerStyle?: ViewStyle;
  showPasswordToggle?: boolean;
}

export function Input({
  label,
  error,
  icon,
  containerStyle,
  showPasswordToggle,
  secureTextEntry,
  style,
  ...props
}: InputProps) {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const borderColor = error
    ? theme.error
    : isFocused
    ? theme.borderFocus
    : theme.border;

  const handleTogglePassword = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  const actualSecureTextEntry = showPasswordToggle
    ? !isPasswordVisible
    : secureTextEntry;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <ThemedText type="subhead" style={styles.label}>
          {label}
        </ThemedText>
      ) : null}
      <View
        style={[
          styles.inputContainer,
          {
            borderColor,
            backgroundColor: theme.backgroundDefault,
          },
        ]}
      >
        {icon ? (
          <Feather
            name={icon}
            size={20}
            color={isFocused ? theme.text : theme.placeholder}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          style={[
            styles.input,
            {
              color: theme.text,
            },
            icon && styles.inputWithIcon,
            (showPasswordToggle || secureTextEntry) && styles.inputWithToggle,
            style,
          ]}
          placeholderTextColor={theme.placeholder}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={actualSecureTextEntry}
          {...props}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={handleTogglePassword}
            style={styles.toggleButton}
            hitSlop={8}
          >
            <Feather
              name={isPasswordVisible ? "eye-off" : "eye"}
              size={20}
              color={theme.placeholder}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <ThemedText type="caption" color="error" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: BorderRadius.sm,
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    height: "100%",
    ...Typography.body,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  inputWithToggle: {
    paddingRight: Spacing["3xl"],
  },
  toggleButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  error: {
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
});
