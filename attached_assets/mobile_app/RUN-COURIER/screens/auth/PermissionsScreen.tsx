import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Platform, Linking } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PERMISSIONS_REQUESTED_KEY = '@permissions_requested';

type PermissionStatus = 'pending' | 'granted' | 'denied';

export function PermissionsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('pending');
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('pending');
  const [loading, setLoading] = useState(false);
  const [permissionsDenied, setPermissionsDenied] = useState(false);

  useEffect(() => {
    checkCurrentPermissions();
  }, []);

  const checkCurrentPermissions = async () => {
    const [cameraPermission, locationPermission] = await Promise.all([
      Camera.getCameraPermissionsAsync(),
      Location.getForegroundPermissionsAsync()
    ]);

    const cameraGranted = cameraPermission.granted;
    const locationGranted = locationPermission.granted;

    setCameraStatus(cameraGranted ? 'granted' : 'pending');
    setLocationStatus(locationGranted ? 'granted' : 'pending');

    if (cameraGranted && locationGranted) {
      await AsyncStorage.setItem(PERMISSIONS_REQUESTED_KEY, 'true');
      navigation.replace('DocumentsUpload');
    }
  };

  const requestAllPermissions = async () => {
    setLoading(true);
    setPermissionsDenied(false);

    try {
      const cameraResult = await Camera.requestCameraPermissionsAsync();
      const cameraGranted = cameraResult.status === 'granted';
      setCameraStatus(cameraGranted ? 'granted' : 'denied');

      const locationResult = await Location.requestForegroundPermissionsAsync();
      const locationGranted = locationResult.status === 'granted';
      setLocationStatus(locationGranted ? 'granted' : 'denied');

      if (cameraGranted && locationGranted) {
        await AsyncStorage.setItem(PERMISSIONS_REQUESTED_KEY, 'true');
        navigation.replace('DocumentsUpload');
      } else {
        setPermissionsDenied(true);
      }
    } catch (error) {
      console.log('Error requesting permissions:', error);
      setPermissionsDenied(true);
    } finally {
      setLoading(false);
    }
  };

  const openSettings = async () => {
    if (Platform.OS !== 'web') {
      try {
        await Linking.openSettings();
      } catch (error) {
        console.log('Could not open settings:', error);
      }
    }
  };

  const allPermissionsGranted = cameraStatus === 'granted' && locationStatus === 'granted';

  const renderPermissionStatus = (
    icon: string,
    title: string,
    description: string,
    status: PermissionStatus
  ) => (
    <ThemedView style={[styles.permissionCard, { backgroundColor: theme.backgroundSecondary }]}>
      <View style={styles.permissionHeader}>
        <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
          <Feather name={icon as any} size={24} color={theme.primary} />
        </View>
        <View style={styles.permissionInfo}>
          <ThemedText style={styles.permissionTitle}>{title}</ThemedText>
          <ThemedText style={[styles.permissionDescription, { color: theme.secondaryText }]}>
            {description}
          </ThemedText>
        </View>
      </View>
      
      {status === 'granted' ? (
        <View style={[styles.statusBadge, { backgroundColor: '#4CAF50' + '20' }]}>
          <Feather name="check-circle" size={16} color="#4CAF50" />
          <ThemedText style={[styles.statusText, { color: '#4CAF50' }]}>Enabled</ThemedText>
        </View>
      ) : status === 'denied' ? (
        <View style={[styles.statusBadge, { backgroundColor: '#FF5722' + '20' }]}>
          <Feather name="x-circle" size={16} color="#FF5722" />
          <ThemedText style={[styles.statusText, { color: '#FF5722' }]}>Denied</ThemedText>
        </View>
      ) : (
        <View style={[styles.statusBadge, { backgroundColor: theme.primary + '20' }]}>
          <Feather name="clock" size={16} color={theme.primary} />
          <ThemedText style={[styles.statusText, { color: theme.primary }]}>Required</ThemedText>
        </View>
      )}
    </ThemedView>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { 
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl 
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: theme.primary + '20' }]}>
            <Feather name="shield" size={40} color={theme.primary} />
          </View>
          <ThemedText style={styles.title}>App Permissions</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.secondaryText }]}>
            To provide the best delivery experience, Run Courier needs access to the following features
          </ThemedText>
        </View>

        <View style={styles.permissionsList}>
          {renderPermissionStatus(
            'camera',
            'Camera Access',
            'Take photos for proof of delivery, scan barcodes, and upload documents',
            cameraStatus
          )}

          {renderPermissionStatus(
            'map-pin',
            'Location Access',
            'Track deliveries in real-time and provide accurate navigation',
            locationStatus
          )}
        </View>

        {permissionsDenied && (
          <View style={[styles.deniedMessage, { backgroundColor: '#FF5722' + '10' }]}>
            <Feather name="alert-circle" size={20} color="#FF5722" />
            <ThemedText style={[styles.deniedText, { color: '#FF5722' }]}>
              Permissions are required to use this app. Please enable them in Settings.
            </ThemedText>
          </View>
        )}

        <View style={styles.footer}>
          {permissionsDenied && Platform.OS !== 'web' ? (
            <Pressable
              onPress={openSettings}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }
              ]}
            >
              <ThemedText style={styles.primaryButtonText}>Open Settings</ThemedText>
            </Pressable>
          ) : (
            <Pressable
              onPress={requestAllPermissions}
              disabled={loading || allPermissionsGranted}
              style={({ pressed }) => [
                styles.primaryButton,
                { 
                  backgroundColor: theme.primary, 
                  opacity: loading ? 0.6 : pressed ? 0.8 : 1 
                }
              ]}
            >
              <ThemedText style={styles.primaryButtonText}>
                {loading ? 'Requesting...' : 'Enable Permissions'}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
  },
  permissionsList: {
    flex: 1,
    gap: Spacing.md,
  },
  permissionCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionInfo: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  permissionDescription: {
    fontSize: 16,
    lineHeight: 22,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '500',
  },
  deniedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  deniedText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  footer: {
    paddingTop: Spacing.xl,
  },
  primaryButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
