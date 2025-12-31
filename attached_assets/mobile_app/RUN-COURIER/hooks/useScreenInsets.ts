import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

import { Spacing } from "@/constants/theme";

const TAB_BAR_HEIGHT = 90;
const HEADER_HEIGHT_IOS = 44;
const HEADER_HEIGHT_ANDROID = 56;

interface UseScreenInsetsOptions {
  hasTabBar?: boolean;
}

export function useScreenInsets(options: UseScreenInsetsOptions = {}) {
  const { hasTabBar = false } = options;
  const insets = useSafeAreaInsets();
  
  let headerHeight = 0;
  try {
    headerHeight = useHeaderHeight();
  } catch (e) {
    headerHeight = Platform.select({ 
      ios: HEADER_HEIGHT_IOS, 
      android: HEADER_HEIGHT_ANDROID, 
      default: HEADER_HEIGHT_ANDROID 
    }) || HEADER_HEIGHT_ANDROID;
  }

  const effectiveTabBarHeight = hasTabBar ? TAB_BAR_HEIGHT : 0;
  
  const hasVisibleHeader = headerHeight > insets.top;
  
  const paddingTop = hasVisibleHeader 
    ? headerHeight + Spacing.md 
    : insets.top + Spacing.xl;

  return {
    paddingTop,
    paddingBottom: insets.bottom + effectiveTabBarHeight + Spacing.xl,
    scrollInsetBottom: insets.bottom + effectiveTabBarHeight,
    headerHeight,
    tabBarHeight: TAB_BAR_HEIGHT,
    insets,
  };
}
