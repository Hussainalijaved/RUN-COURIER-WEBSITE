import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Modal, ScrollView, Platform, Linking } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PERMISSIONS_CHECKED_KEY = '@permissions_checked_v2';

type PermissionStatus = 'checking' | 'pending' | 'granted' | 'denied';

interface PermissionGateProps {
  children: React.ReactNode;
}

export function PermissionGate({ children }: PermissionGateProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('checking');
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('checking');
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [permissionsDenied, setPermissionsDenied] = useState(false);

  useEffect(() => {
    checkInitialPermissions();
  }, []);

  const checkInitialPermissions = async () => {
    try {
      const [cameraPermission, locationPermission] = await Promise.all([
        Camera.getCameraPermissionsAsync(),
        Location.getForegroundPermissionsAsync()
      ]);

      const cameraGranted = cameraPermission.granted;
      const locationGranted = locationPermission.granted;

      setCameraStatus(cameraGranted ? 'granted' : 'pending');
      setLocationStatus(locationGranted ? 'granted' : 'pending');

      if (!cameraGranted || !locationGranted) {
        const alreadyChecked = await AsyncStorage.getItem(PERMISSIONS_CHECKED_KEY);
        if (!alreadyChecked) {
          setShowModal(true);
        }
      }
    } catch (error) {
      console.log('Error checking permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestAllPermissions = async () => {
    setRequesting(true);
    setPermissionsDenied(false);

    try {
      const cameraResult = await Camera.requestCameraPermissionsAsync();
      const cameraGranted = cameraResult.status === 'granted';
      setCameraStatus(cameraGranted ? 'granted' : 'denied');

      const locationResult = await Location.requestForegroundPermissionsAsync();
      const locationGranted = locationResult.status === 'granted';
      setLocationStatus(locationGranted ? 'granted' : 'denied');

      if (cameraGranted && locationGranted) {
        await AsyncStorage.setItem(PERMISSIONS_CHECKED_KEY, 'true');
        setShowModal(false);
      } else {
        setPermissionsDenied(true);
      }
    } catch (error) {
      console.log('Error requesting permissions:', error);
      setPermissionsDenied(true);
    } finally {
      setRequesting(false);
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

  const allGranted = cameraStatus === 'granted' && locationStatus === 'granted';

  const renderPermissionStatus = (
    icon: string,
    title: string,
    description: string,
    status: PermissionStatus
  ) => (
    <View style={[styles.permissionCard, { backgroundColor: theme.backgroundSecondary }]}>
      <View style={styles.permissionHeader}>
        <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
          <Feather name={icon as any} size={28} color={theme.primary} />
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
          <Feather name="check-circle" size={18} color="#4CAF50" />
          <ThemedText style={[styles.statusText, { color: '#4CAF50' }]}>Enabled</ThemedText>
        </View>
      ) : status === 'denied' ? (
        <View style={[styles.statusBadge, { backgroundColor: '#FF5722' + '20' }]}>
          <Feather name="x-circle" size={18} color="#FF5722" />
          <ThemedText style={[styles.statusText, { color: '#FF5722' }]}>Denied</ThemedText>
        </View>
      ) : (
        <View style={[styles.statusBadge, { backgroundColor: theme.primary + '20' }]}>
          <Feather name="clock" size={18} color={theme.primary} />
          <ThemedText style={[styles.statusText, { color: theme.primary }]}>Required</ThemedText>
        </View>
      )}
    </View>
  );

  const renderInfoItem = (
    icon: string,
    title: string,
    description: string
  ) => (
    <View style={[styles.permissionCard, { backgroundColor: theme.backgroundSecondary }]}>
      <View style={styles.permissionHeader}>
        <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
          <Feather name={icon as any} size={28} color={theme.primary} />
        </View>
        <View style={styles.permissionInfo}>
          <ThemedText style={styles.permissionTitle}>{title}</ThemedText>
          <ThemedText style={[styles.permissionDescription, { color: theme.secondaryText }]}>
            {description}
          </ThemedText>
        </View>
      </View>
      
      <View style={[styles.statusBadge, { backgroundColor: theme.primary + '20' }]}>
        <Feather name="external-link" size={18} color={theme.primary} />
        <ThemedText style={[styles.statusText, { color: theme.primary }]}>Uses External Apps</ThemedText>
      </View>
    </View>
  );

  if (loading) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {}}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: insets.top + Spacing.xl,
                paddingBottom: insets.bottom + Spacing.xl,
              }
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={[styles.headerIcon, { backgroundColor: theme.primary + '20' }]}>
                <Feather name="map-pin" size={48} color={theme.primary} />
              </View>
              <ThemedText style={styles.title}>Enable Permissions</ThemedText>
              <ThemedText style={[styles.subtitle, { color: theme.secondaryText }]}>
                Run Courier needs these permissions to track deliveries, navigate to addresses, and capture proof of delivery
              </ThemedText>
            </View>

            <View style={styles.permissionsList}>
              {renderPermissionStatus(
                'map-pin',
                'Location Tracking',
                'Required for GPS navigation and real-time delivery tracking',
                locationStatus
              )}

              {renderPermissionStatus(
                'camera',
                'Camera Access',
                'Required for proof of delivery photos, barcode scanning, and document uploads',
                cameraStatus
              )}

              {renderInfoItem(
                'navigation',
                'Maps Navigation',
                'Opens Google Maps, Waze, or Apple Maps for turn-by-turn directions to pickup and delivery addresses'
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
                  disabled={requesting || allGranted}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { 
                      backgroundColor: theme.primary, 
                      opacity: requesting ? 0.6 : pressed ? 0.8 : 1 
                    }
                  ]}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {requesting ? 'Requesting...' : 'Enable Permissions'}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
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
    marginBottom: Spacing['2xl'],
  },
  headerIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: Spacing.md,
  },
  permissionsList: {
    flex: 1,
    gap: Spacing.lg,
  },
  permissionCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionInfo: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 20,
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
    fontSize: 18,
    fontWeight: '600',
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
    fontSize: 18,
    fontWeight: '600',
  },
});
