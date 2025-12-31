import { Platform, StyleSheet, ScrollView } from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";

import { useTheme } from "@/hooks/useTheme";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { Spacing } from "@/constants/theme";

interface ScreenKeyboardAwareScrollViewProps extends KeyboardAwareScrollViewProps {
  hasTabBar?: boolean;
}

export function ScreenKeyboardAwareScrollView({
  children,
  contentContainerStyle,
  style,
  keyboardShouldPersistTaps = "handled",
  hasTabBar = false,
  ...scrollViewProps
}: ScreenKeyboardAwareScrollViewProps) {
  const { theme } = useTheme();
  const { paddingTop, paddingBottom, scrollInsetBottom } = useScreenInsets({ hasTabBar });

  const ScrollComponent = Platform.OS === "web" ? ScrollView : KeyboardAwareScrollView;
  const scrollProps = Platform.OS === "web" 
    ? {} 
    : { scrollIndicatorInsets: { bottom: scrollInsetBottom } };

  return (
    <ScrollComponent
      style={[
        styles.container,
        { backgroundColor: theme.backgroundRoot },
        style,
      ]}
      contentContainerStyle={[
        {
          paddingTop,
          paddingBottom,
        },
        styles.contentContainer,
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={true}
      bounces={true}
      {...scrollProps}
      {...scrollViewProps}
    >
      {children}
    </ScrollComponent>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
});
