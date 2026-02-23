import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, StyleSheet, Pressable, Alert, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase, Job } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  
  const len = base64.length;
  let bufferLength = len * 0.75;
  if (base64[len - 1] === '=') bufferLength--;
  if (base64[len - 2] === '=') bufferLength--;
  
  const arraybuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arraybuffer);
  
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];
    
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }
  
  return arraybuffer;
};

export function ProfileScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { driver, user, signOut, updateDriver, refreshDriver } = useAuth();
  const [weeklyStats, setWeeklyStats] = useState({ jobs: 0, earnings: 0, miles: 0 });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // CRITICAL: Use both driver.id AND user.id to catch jobs assigned with either ID
  const driverRecordId = driver?.id;
  const authUserId = user?.id;
  const driverId = driverRecordId || authUserId;
  const allDriverIds = [...new Set([driverRecordId, authUserId].filter(Boolean))] as string[];

  const fetchWeeklyStats = useCallback(async () => {
    if (!driverId || allDriverIds.length === 0) return;

    try {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .in('driver_id', allDriverIds)
        .eq('status', 'delivered')
        .gte('delivered_at', startOfWeek.toISOString());

      if (error) throw error;

      const jobs: Job[] = data || [];
      setWeeklyStats({
        jobs: jobs.length,
        earnings: jobs.reduce((sum: number, job: Job) => sum + (job.price_customer ?? job.price ?? 0), 0),
        miles: jobs.reduce((sum: number, job: Job) => sum + (job.distance || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
    }
  }, [driverId, allDriverIds.join(',')]);

  useEffect(() => {
    fetchWeeklyStats();
  }, [fetchWeeklyStats]);

  useFocusEffect(
    useCallback(() => {
      refreshDriver();
    }, [refreshDriver])
  );

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to logout?');
      if (confirmed) {
        await signOut();
      }
    } else {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Logout', style: 'destructive', onPress: () => signOut() },
        ]
      );
    }
  };

  const pickProfilePhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadProfilePhoto(result.assets[0].uri);
    }
  };

  const takeProfilePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow camera access.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadProfilePhoto(result.assets[0].uri);
    }
  };

  const showPhotoOptions = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: takeProfilePhoto },
      { text: 'Choose from Library', onPress: pickProfilePhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadProfilePhoto = async (uri: string) => {
    if (!user) return;
    const driverId = driver?.id || user.id;
    setUploadingPhoto(true);
    
    try {
      let contentType = 'image/jpeg';
      let fileExt = 'jpg';
      
      const uriParts = uri.split('.');
      const lastPart = uriParts[uriParts.length - 1]?.toLowerCase().split('?')[0];
      if (lastPart && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(lastPart)) {
        fileExt = lastPart === 'jpeg' ? 'jpg' : lastPart;
        if (lastPart === 'png') contentType = 'image/png';
        else if (lastPart === 'gif') contentType = 'image/gif';
        else if (lastPart === 'webp') contentType = 'image/webp';
        else if (lastPart === 'heic') contentType = 'image/heic';
      }
      
      console.log('[PROFILE] Uploading photo from:', uri.substring(0, 100));
      
      let base64: string;
      
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to read photo: ${response.status}`);
        }
        const blob = await response.blob();
        
        if (blob.type && blob.type !== 'application/octet-stream') {
          contentType = blob.type;
          if (contentType.includes('png')) fileExt = 'png';
          else if (contentType.includes('gif')) fileExt = 'gif';
          else if (contentType.includes('webp')) fileExt = 'webp';
        }
        
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
      }
      
      console.log('[PROFILE] Base64 length:', base64.length);
      
      const fileData = base64ToArrayBuffer(base64);
      
      // Get auth user ID for RLS compliance
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const authUserId = authUser?.id;
      if (!authUserId) {
        throw new Error('You must be logged in to upload a photo');
      }
      
      const fileName = `profile_picture_${Date.now()}.${fileExt}`;
      const filePath = `drivers/${authUserId}/profile_picture/${fileName}`;

      console.log('[PROFILE] Uploading to path:', filePath, 'Auth ID:', authUserId);

      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(filePath, fileData, { upsert: true, contentType });

      if (uploadError) {
        console.error('[PROFILE] Storage upload error:', uploadError);
        throw uploadError;
      }

      const { data } = supabase.storage.from('driver-documents').getPublicUrl(filePath);
      const publicUrl = data.publicUrl + `?t=${Date.now()}`;

      console.log('[PROFILE] Public URL:', publicUrl);

      const updateResult = await updateDriver({ profile_picture_url: publicUrl });
      if (updateResult.error) {
        console.error('[PROFILE] Failed to update driver profile:', updateResult.error);
        throw updateResult.error;
      }
      await refreshDriver();
      Alert.alert('Success', 'Profile photo updated!');
    } catch (error: any) {
      console.error('[PROFILE] Upload error:', error);
      Alert.alert('Error', error.message || 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const profilePictureUrl = useMemo(() => {
    const url = driver?.profile_picture_url;
    if (!url) return null;
    return url.includes('?') ? url : `${url}?t=${Date.now()}`;
  }, [driver?.profile_picture_url]);

  const getInitials = () => {
    const name = driver?.name || driver?.full_name || 'D';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatVehicleType = (type: string) => {
    if (!type) return 'Not set';
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const menuItems = [
    { id: '1', icon: 'edit-2', label: 'Edit Profile', screen: 'EditProfile' },
    { id: '2', icon: 'file-text', label: 'Documents', screen: 'ManageDocuments' },
    { id: '3', icon: 'credit-card', label: 'Bank Details', screen: 'BankDetails' },
    { id: '4', icon: 'settings', label: 'Settings', screen: 'Settings' },
  ];

  return (
    <ScreenScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} hasTabBar>
      <View style={styles.content}>
        <Card variant="glass" style={styles.profileCard}>
          <Pressable 
            onPress={showPhotoOptions}
            disabled={uploadingPhoto}
            style={styles.avatarContainer}
          >
            {profilePictureUrl ? (
              <Image 
                key={profilePictureUrl}
                source={{ uri: profilePictureUrl }} 
                style={styles.avatarImage}
                contentFit="cover"
                cachePolicy="none"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                <ThemedText style={styles.avatarText}>{getInitials()}</ThemedText>
              </View>
            )}
            {uploadingPhoto ? (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : null}
            <View style={[styles.editBadge, { backgroundColor: theme.backgroundDefault, borderColor: theme.glassBorder }]}>
              <Feather name="camera" size={14} color={theme.primary} />
            </View>
          </Pressable>

          <View style={[styles.driverIdBadge, { backgroundColor: theme.primary + '15' }]}>
            <ThemedText type="caption" style={{ color: theme.primary }}>
              ID: {driver?.driver_id || 'N/A'}
            </ThemedText>
          </View>
          
          <ThemedText type="h2" style={styles.name}>
            {driver?.name || driver?.full_name || 'Driver'}
          </ThemedText>
          <ThemedText type="subhead" style={styles.email}>
            {user?.email}
          </ThemedText>
          
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Feather name="phone" size={14} color={theme.secondaryText} />
              <ThemedText type="caption" color="secondary">
                {driver?.phone || 'No phone'}
              </ThemedText>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />
            <View style={styles.infoItem}>
              <Feather name="truck" size={14} color={theme.secondaryText} />
              <ThemedText type="caption" color="secondary">
                {formatVehicleType(driver?.vehicle_type || '')}
              </ThemedText>
            </View>
          </View>

          {(driver?.vehicle_make || driver?.vehicle_model || driver?.vehicle_color || driver?.vehicle_registration) && (
            <View style={[styles.vehicleDetailsRow, { borderTopColor: theme.border }]}>
              {driver?.vehicle_registration && (
                <ThemedText type="caption" color="secondary" style={styles.vehicleDetailText}>
                  Reg: {driver.vehicle_registration}
                </ThemedText>
              )}
              {driver?.vehicle_make && (
                <ThemedText type="caption" color="secondary" style={styles.vehicleDetailText}>
                  {driver.vehicle_make}
                </ThemedText>
              )}
              {driver?.vehicle_model && (
                <ThemedText type="caption" color="secondary" style={styles.vehicleDetailText}>
                  {driver.vehicle_model}
                </ThemedText>
              )}
              {driver?.vehicle_color && (
                <ThemedText type="caption" color="secondary" style={styles.vehicleDetailText}>
                  {driver.vehicle_color}
                </ThemedText>
              )}
            </View>
          )}

          <View style={[
            styles.statusBadge, 
            { backgroundColor: driver?.is_active ? theme.success + '15' : theme.warning + '15' }
          ]}>
            <View style={[
              styles.statusDot, 
              { backgroundColor: driver?.is_active ? theme.success : theme.warning }
            ]} />
            <ThemedText 
              type="caption" 
              style={{ color: driver?.is_active ? theme.success : theme.warning, fontWeight: '600' }}
            >
              {driver?.is_active ? 'Active' : 'Pending Verification'}
            </ThemedText>
          </View>
        </Card>

        <Card variant="glass" style={styles.statsCard}>
          <ThemedText type="h4" style={styles.sectionTitle}>This Week</ThemedText>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <ThemedText type="h1" style={{ color: theme.primary }}>
                {weeklyStats.jobs}
              </ThemedText>
              <ThemedText type="caption" color="secondary">Jobs</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statItem}>
              <ThemedText type="h1" style={{ color: theme.success }}>
                £{weeklyStats.earnings.toFixed(0)}
              </ThemedText>
              <ThemedText type="caption" color="secondary">Earned</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statItem}>
              <ThemedText type="h1" style={{ color: theme.primary }}>
                {weeklyStats.miles.toFixed(0)}
              </ThemedText>
              <ThemedText type="caption" color="secondary">Miles</ThemedText>
            </View>
          </View>
        </Card>

        <Card variant="glass" style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.menuItem,
                index < menuItems.length - 1 && [styles.menuItemBorder, { borderBottomColor: theme.border }],
                { opacity: pressed ? 0.7 : 1 }
              ]}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View style={styles.menuItemContent}>
                <View style={[styles.menuIconContainer, { backgroundColor: theme.primary + '12' }]}>
                  <Feather name={item.icon as any} size={18} color={theme.primary} />
                </View>
                <ThemedText type="body">{item.label}</ThemedText>
              </View>
              <Feather name="chevron-right" size={20} color={theme.secondaryText} />
            </Pressable>
          ))}
        </Card>

        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            { backgroundColor: theme.error + '10', borderColor: theme.error, opacity: pressed ? 0.7 : 1 }
          ]}
          onPress={handleLogout}
        >
          <Feather name="log-out" size={18} color={theme.error} />
          <ThemedText type="bodyMedium" style={{ color: theme.error }}>
            Logout
          </ThemedText>
        </Pressable>
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["3xl"],
  },
  profileCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.cardLight,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  driverIdBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  name: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  email: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  infoDivider: {
    width: 1,
    height: 16,
    marginHorizontal: Spacing.lg,
  },
  vehicleDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  vehicleDetailText: {
    fontSize: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statsCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  menuCard: {
    padding: 0,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: Spacing.sm,
  },
});
