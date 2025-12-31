import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Spacing } from '@/constants/theme';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';

interface NetworkState {
  isConnected: boolean | null;
  type: string;
  isInternetReachable: boolean | null;
}

export function DeviceStatusBar() {
  const { theme } = useTheme();
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState | null>(null);

  useEffect(() => {
    let batterySubscription: Battery.Subscription | null = null;
    let batteryStateSubscription: Battery.Subscription | null = null;

    const initBattery = async () => {
      try {
        const level = await Battery.getBatteryLevelAsync();
        const state = await Battery.getBatteryStateAsync();
        setBatteryLevel(level);
        setIsCharging(state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL);

        batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
          setBatteryLevel(batteryLevel);
        });

        batteryStateSubscription = Battery.addBatteryStateListener(({ batteryState }) => {
          setIsCharging(batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL);
        });
      } catch (error) {
        console.log('Battery API not available:', error);
      }
    };

    initBattery();

    const unsubscribeNetwork = NetInfo.addEventListener(state => {
      setNetworkState(state);
    });

    return () => {
      batterySubscription?.remove();
      batteryStateSubscription?.remove();
      unsubscribeNetwork();
    };
  }, []);

  const getBatteryIcon = () => {
    if (isCharging) return 'battery-charging';
    if (batteryLevel === null) return 'battery';
    if (batteryLevel > 0.75) return 'battery';
    if (batteryLevel > 0.25) return 'battery';
    return 'battery';
  };

  const getBatteryColor = () => {
    if (isCharging) return '#4CAF50';
    if (batteryLevel === null) return theme.secondaryText;
    if (batteryLevel > 0.25) return theme.text;
    return '#F44336';
  };

  const getNetworkIcon = () => {
    if (!networkState?.isConnected) return 'wifi-off';
    if (networkState?.type === 'wifi') return 'wifi';
    if (networkState?.type === 'cellular') return 'smartphone';
    return 'wifi';
  };

  const getNetworkLabel = () => {
    if (!networkState?.isConnected) return 'Offline';
    if (networkState?.type === 'wifi') return 'Wi-Fi';
    if (networkState?.type === 'cellular') return 'Mobile';
    return 'Connected';
  };

  const batteryPercent = batteryLevel !== null ? Math.round(batteryLevel * 100) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
      <View style={styles.statusItem}>
        <Feather 
          name={getNetworkIcon() as any} 
          size={18} 
          color={networkState?.isConnected ? theme.primary : theme.error} 
        />
        <ThemedText style={[styles.statusText, { color: theme.text }]}>
          {getNetworkLabel()}
        </ThemedText>
      </View>

      {networkState?.type === 'cellular' && (
        <View style={styles.statusItem}>
          <Feather name="bar-chart-2" size={18} color={theme.text} />
          <ThemedText style={[styles.statusText, { color: theme.text }]}>
            Signal
          </ThemedText>
        </View>
      )}

      <View style={styles.statusItem}>
        <Feather 
          name={getBatteryIcon() as any} 
          size={18} 
          color={getBatteryColor()} 
        />
        <ThemedText style={[styles.statusText, { color: getBatteryColor() }]}>
          {batteryPercent !== null ? `${batteryPercent}%` : '--'}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xl,
    borderRadius: 20,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
