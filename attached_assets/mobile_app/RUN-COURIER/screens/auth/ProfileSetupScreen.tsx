import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput, Alert, Image } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/Button';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

type VehicleType = 'motorbike' | 'car' | 'small_van' | 'medium_van';

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string; photoInfo: string }[] = [
  { value: 'motorbike', label: 'Motorbike', icon: 'navigation', photoInfo: '2 photos required (front, back)' },
  { value: 'car', label: 'Car', icon: 'truck', photoInfo: '2 photos required (front, back)' },
  { value: 'small_van', label: 'Small Van', icon: 'truck', photoInfo: '5 photos required (front, back, left, right, load space)' },
  { value: 'medium_van', label: 'Medium Van', icon: 'truck', photoInfo: '5 photos required (front, back, left, right, load space)' },
];

export function ProfileSetupScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { user, updateDriver } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState('');
  const [nationalInsurance, setNationalInsurance] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    (user?.user_metadata?.vehicle_type as VehicleType) || 'car'
  );
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photos to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your camera to take a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      'Profile Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const uploadProfileImage = async (): Promise<string | null> => {
    if (!profileImage || !user) return null;

    try {
      const FileSystem = require('expo-file-system');
      const base64 = await FileSystem.readAsStringAsync(profileImage, { 
        encoding: FileSystem.EncodingType.Base64 
      });
      
      // Pure JavaScript base64 to ArrayBuffer (Hermes compatible - no atob)
      const base64ToArrayBuffer = (base64String: string): ArrayBuffer => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const lookup = new Uint8Array(256);
        for (let i = 0; i < chars.length; i++) {
          lookup[chars.charCodeAt(i)] = i;
        }
        let bufferLength = base64String.length * 0.75;
        if (base64String[base64String.length - 1] === '=') bufferLength--;
        if (base64String[base64String.length - 2] === '=') bufferLength--;
        const arraybuffer = new ArrayBuffer(bufferLength);
        const bytes = new Uint8Array(arraybuffer);
        let p = 0;
        for (let i = 0; i < base64String.length; i += 4) {
          const encoded1 = lookup[base64String.charCodeAt(i)];
          const encoded2 = lookup[base64String.charCodeAt(i + 1)];
          const encoded3 = lookup[base64String.charCodeAt(i + 2)];
          const encoded4 = lookup[base64String.charCodeAt(i + 3)];
          bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
          bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
          bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
        }
        return arraybuffer;
      };
      
      const fileData = base64ToArrayBuffer(base64);
      const fileExt = (profileImage.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
      
      // Determine content type based on extension
      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'gif') contentType = 'image/gif';
      else if (fileExt === 'webp') contentType = 'image/webp';
      else if (fileExt === 'heic') contentType = 'image/heic';
      
      // Use auth.uid() as root folder for RLS compliance
      const fileName = `profile_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/profile_pictures/${fileName}`;

      console.log('[PROFILE SETUP] Uploading to:', filePath);

      const { error } = await supabase.storage
        .from('DRIVER-DOCUMENTS')
        .upload(filePath, fileData, { upsert: true, contentType });

      if (error) {
        console.error('Upload error:', error);
        return null;
      }

      const { data } = supabase.storage
        .from('DRIVER-DOCUMENTS')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Profile image upload error:', error);
      return null;
    }
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }
    if (!postcode.trim()) {
      Alert.alert('Error', 'Please enter your postcode');
      return;
    }
    if (!registrationNumber.trim()) {
      Alert.alert('Error', 'Please enter your vehicle registration number');
      return;
    }
    if (sortCode && sortCode.replace(/-/g, '').length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit sort code');
      return;
    }
    if (accountNumber && accountNumber.length !== 8) {
      Alert.alert('Error', 'Please enter a valid 8-digit account number');
      return;
    }

    setLoading(true);

    try {
      let profilePictureUrl = null;
      if (profileImage) {
        profilePictureUrl = await uploadProfileImage();
        if (!profilePictureUrl && profileImage) {
          Alert.alert('Warning', 'Profile photo could not be uploaded, but your profile will be saved.');
        }
      }

      const profileData: any = {
        name: name.trim(),
        phone: phone.trim(),
        postcode: postcode.trim().toUpperCase(),
        vehicle_type: vehicleType,
        email: user?.email || '',
        is_active: false,
      };

      if (address.trim()) {
        profileData.address = address.trim();
      }
      if (nationalInsurance.trim()) {
        profileData.national_insurance = nationalInsurance.trim().toUpperCase();
      }
      if (registrationNumber.trim()) {
        profileData.registration_number = registrationNumber.trim().toUpperCase();
      }
      if (accountHolderName.trim()) {
        profileData.bank_account_name = accountHolderName.trim();
      }
      if (sortCode) {
        profileData.bank_sort_code = sortCode.replace(/-/g, '');
      }
      if (accountNumber) {
        profileData.bank_account_number = accountNumber;
      }
      if (profilePictureUrl) {
        profileData.profile_picture_url = profilePictureUrl;
        profileData.profile_picture = profilePictureUrl;
      }

      const { error } = await updateDriver(profileData);

      if (error) {
        Alert.alert('Error', 'Failed to save profile. Please try again.');
      } else {
        navigation.replace('DocumentsUpload');
      }
    } catch (error) {
      console.error('Profile save error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatSortCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    if (digits.length > 4) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    } else if (digits.length > 2) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return digits;
  };

  return (
    <ScreenKeyboardAwareScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <ThemedText style={styles.title}>Complete Your Profile</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.secondaryText }]}>
          Please provide your details to continue
        </ThemedText>

        <View style={styles.form}>
          <View style={styles.photoSection}>
            <Pressable 
              onPress={showImageOptions}
              style={[styles.photoButton, { backgroundColor: theme.backgroundSecondary }]}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImage} />
              ) : (
                <Feather name="camera" size={32} color={theme.secondaryText} />
              )}
            </Pressable>
            <Pressable onPress={showImageOptions}>
              <ThemedText style={[styles.photoLabel, { color: theme.link }]}>
                {profileImage ? 'Change Photo' : 'Upload Photo'}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Full Name *</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={name}
              onChangeText={setName}
              placeholder="Enter your full name"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Phone Number *</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter your phone number"
              placeholderTextColor={theme.secondaryText}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Postcode *</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={postcode}
              onChangeText={setPostcode}
              placeholder="Enter your postcode"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Full Address</ThemedText>
            <TextInput
              style={[styles.input, styles.multilineInput, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter your full address"
              placeholderTextColor={theme.secondaryText}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>National Insurance Number</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={nationalInsurance}
              onChangeText={(text) => setNationalInsurance(text.toUpperCase())}
              placeholder="e.g., AB 12 34 56 C"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Vehicle Type *</ThemedText>
            <View style={styles.vehicleTypeContainer}>
              {VEHICLE_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  onPress={() => setVehicleType(type.value)}
                  style={[
                    styles.vehicleTypeButton,
                    { 
                      backgroundColor: vehicleType === type.value ? theme.primary : theme.backgroundDefault,
                      borderColor: vehicleType === type.value ? theme.primary : theme.backgroundSecondary,
                    }
                  ]}
                >
                  <Feather 
                    name={type.icon as any} 
                    size={20} 
                    color={vehicleType === type.value ? '#FFFFFF' : theme.text} 
                  />
                  <ThemedText 
                    style={[
                      styles.vehicleTypeLabel,
                      { color: vehicleType === type.value ? '#FFFFFF' : theme.text }
                    ]}
                  >
                    {type.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <View style={[styles.vehicleInfoBox, { backgroundColor: theme.primary + '15' }]}>
              <Feather name="camera" size={16} color={theme.primary} />
              <ThemedText style={[styles.vehicleInfoText, { color: theme.text }]}>
                {VEHICLE_TYPES.find(t => t.value === vehicleType)?.photoInfo}
              </ThemedText>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Registration Number *</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={registrationNumber}
              onChangeText={setRegistrationNumber}
              placeholder="e.g., AB12 CDE"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="characters"
            />
          </View>

          <ThemedText style={styles.sectionTitle}>Bank Details (Optional)</ThemedText>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Account Holder Name</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={accountHolderName}
              onChangeText={setAccountHolderName}
              placeholder="Enter account holder name"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Sort Code</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={sortCode}
              onChangeText={(text) => setSortCode(formatSortCode(text))}
              placeholder="00-00-00"
              placeholderTextColor={theme.secondaryText}
              keyboardType="number-pad"
              maxLength={8}
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Account Number</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={accountNumber}
              onChangeText={(text) => setAccountNumber(text.replace(/\D/g, '').slice(0, 8))}
              placeholder="8-digit account number"
              placeholderTextColor={theme.secondaryText}
              keyboardType="number-pad"
              maxLength={8}
            />
          </View>

          <Button 
            title={loading ? 'Saving...' : 'Continue to Documents'}
            onPress={handleSaveProfile}
            disabled={loading}
            style={styles.button}
          />
        </View>
      </View>
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing['3xl'],
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: Spacing['2xl'],
  },
  form: {
    gap: Spacing.md,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  photoButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  photoLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: 17,
    marginBottom: Spacing.xs,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  multilineInput: {
    height: 80,
    paddingTop: Spacing.sm,
    textAlignVertical: 'top',
  },
  vehicleTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  vehicleTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  vehicleTypeLabel: {
    fontSize: 17,
    fontWeight: '500',
  },
  vehicleInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  vehicleInfoText: {
    fontSize: 16,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  button: {
    marginTop: Spacing.xl,
  },
});
