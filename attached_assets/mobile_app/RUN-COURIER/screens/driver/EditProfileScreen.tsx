import React, { useState } from 'react';
import { View, StyleSheet, TextInput, Pressable, Image, Alert, Platform, ActivityIndicator, Modal } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Button } from '@/components/Button';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';

export function EditProfileScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { driver, user, updateDriver, refreshDriver } = useAuth();
  
  const [name, setName] = useState(driver?.full_name || driver?.name || '');
  const [phone, setPhone] = useState(driver?.phone || '');
  const [postcode, setPostcode] = useState(driver?.postcode || '');
  const [address, setAddress] = useState(driver?.address || '');
  const [nationalInsurance, setNationalInsurance] = useState((driver as any)?.national_insurance || '');
  const [vehicleRegistration, setVehicleRegistration] = useState(driver?.vehicle_registration || '');
  const [vehicleType, setVehicleType] = useState<string>(driver?.vehicle_type || 'car');
  const [vehicleMake, setVehicleMake] = useState(driver?.vehicle_make || '');
  const [vehicleModel, setVehicleModel] = useState(driver?.vehicle_model || '');
  const [vehicleColor, setVehicleColor] = useState(driver?.vehicle_color || '');
  const [showVehicleTypePicker, setShowVehicleTypePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');


  const vehicleTypes = [
    { value: 'motorbike', label: 'Motorbike', icon: 'navigation' },
    { value: 'car', label: 'Car', icon: 'truck' },
    { value: 'small_van', label: 'Small Van', icon: 'truck' },
    { value: 'medium_van', label: 'Medium Van', icon: 'truck' },
  ];

  const formatVehicleType = (type: string | undefined) => {
    if (!type) return 'Not set';
    // Normalize the type to lowercase with underscores for matching
    const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
    const found = vehicleTypes.find(t => t.value === normalizedType);
    if (found) return found.label;
    // Fallback: format the raw type nicely
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const getVehicleIcon = (type: string | undefined) => {
    if (!type) return 'truck';
    const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
    const found = vehicleTypes.find(t => t.value === normalizedType);
    return found?.icon || 'truck';
  };

  const showError = (message: string) => {
    if (Platform.OS === 'web') {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(''), 4000);
    } else {
      Alert.alert('Error', message);
    }
  };

  const showSuccess = (message: string, callback?: () => void) => {
    if (Platform.OS === 'web') {
      setSuccessMessage(message);
      setTimeout(() => {
        setSuccessMessage('');
        if (callback) callback();
      }, 2000);
    } else {
      Alert.alert('Success', message, [
        { text: 'OK', onPress: callback }
      ]);
    }
  };

  const pickProfilePhoto = async () => {
    setShowPhotoModal(false);
    
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      showError('Please allow access to your photos.');
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
    setShowPhotoModal(false);
    
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permissionResult.granted) {
      showError('Please allow camera access.');
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
    if (Platform.OS === 'web') {
      setShowPhotoModal(true);
    } else {
      Alert.alert(
        'Profile Photo',
        'Choose an option',
        [
          { text: 'Take Photo', onPress: takeProfilePhoto },
          { text: 'Choose from Library', onPress: pickProfilePhoto },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const uploadProfilePhoto = async (uri: string) => {
    if (!user) {
      showError('You must be logged in to upload a photo.');
      return;
    }

    const driverId = driver?.id || user.id;
    setUploadingPhoto(true);
    
    try {
      let fileData: ArrayBuffer;
      let contentType = 'image/jpeg';
      let fileExt = 'jpg';
      
      // Determine file extension from URI first
      const uriParts = uri.split('.');
      const lastPart = uriParts[uriParts.length - 1]?.toLowerCase().split('?')[0];
      if (lastPart && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(lastPart)) {
        fileExt = lastPart === 'jpeg' ? 'jpg' : lastPart;
        if (lastPart === 'png') contentType = 'image/png';
        else if (lastPart === 'gif') contentType = 'image/gif';
        else if (lastPart === 'webp') contentType = 'image/webp';
        else if (lastPart === 'heic') contentType = 'image/heic';
      }
      
      console.log('Uploading profile photo, reading from:', uri.substring(0, 100));
      
      // Handle web vs native differently
      if (Platform.OS === 'web') {
        // On web, fetch the blob URL directly
        const response = await fetch(uri);
        const blob = await response.blob();
        fileData = await blob.arrayBuffer();
        
        // Get content type from blob
        if (blob.type) {
          contentType = blob.type;
          if (blob.type.includes('png')) fileExt = 'png';
          else if (blob.type.includes('gif')) fileExt = 'gif';
          else if (blob.type.includes('webp')) fileExt = 'webp';
        }
      } else {
        // Use expo-file-system with pure JS base64 decoder - Hermes compatible
        const FileSystem = require('expo-file-system');
        const base64 = await FileSystem.readAsStringAsync(uri, { 
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
        
        fileData = base64ToArrayBuffer(base64);
      }
      
      // Get auth user ID for RLS compliance
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const authUserId = authUser?.id;
      if (!authUserId) {
        showError('You must be logged in to upload a photo.');
        return;
      }
      
      const fileName = `profile_${Date.now()}.${fileExt}`;
      // Use auth.uid() for storage path to comply with RLS policy
      const filePath = `${authUserId}/${fileName}`;

      console.log('Uploading profile photo to:', filePath, 'Auth ID:', authUserId);
      
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('DRIVER-DOCUMENTS')
        .upload(filePath, fileData, { 
          upsert: true,
          contentType: contentType,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        console.error('Upload error details:', JSON.stringify(uploadError));
        showError(`Storage upload failed. Please ensure the bucket has public access enabled in Supabase.`);
        return;
      }
      
      console.log('Upload successful:', uploadData);

      const { data } = supabase.storage
        .from('DRIVER-DOCUMENTS')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl + `?t=${Date.now()}`;

      // Save to both profile_picture_url and profile_picture for website compatibility
      const { error: updateError } = await updateDriver({ 
        profile_picture_url: publicUrl,
        profile_picture: publicUrl 
      });
      
      if (updateError) {
        console.error('Profile update error:', updateError);
        showError('Photo uploaded but profile could not be updated. Please try again.');
        return;
      }
      
      await refreshDriver();
      showSuccess('Profile photo updated successfully!');
    } catch (error: any) {
      console.error('Profile photo upload error:', error);
      showError(error.message || 'Failed to upload photo. Please check your connection and try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showError('Please enter your name');
      return;
    }
    if (!phone.trim()) {
      showError('Please enter your phone number');
      return;
    }

    setLoading(true);
    
    try {
      const { error } = await updateDriver({
        full_name: name.trim(),
        phone: phone.trim(),
        postcode: postcode.trim(),
        address: address.trim(),
        national_insurance: nationalInsurance.trim(),
        vehicle_registration: vehicleRegistration.trim().toUpperCase(),
        vehicle_type: vehicleType as 'motorbike' | 'car' | 'small_van' | 'medium_van',
        vehicle_make: vehicleMake.trim(),
        vehicle_model: vehicleModel.trim(),
        vehicle_color: vehicleColor.trim(),
      });

      if (error) {
        console.error('Profile update error:', error);
        showError('Failed to update profile. Please try again.');
        return;
      }

      await refreshDriver();
      showSuccess('Profile updated successfully!', () => navigation.goBack());
    } catch (error: any) {
      console.error('Save profile error:', error);
      showError(error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenKeyboardAwareScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} hasTabBar={true}>
      <View style={styles.content}>
        {errorMessage ? (
          <View style={[styles.messageBanner, { backgroundColor: theme.error }]}>
            <Feather name="alert-circle" size={18} color="#fff" />
            <ThemedText style={styles.messageText}>{errorMessage}</ThemedText>
          </View>
        ) : null}
        
        {successMessage ? (
          <View style={[styles.messageBanner, { backgroundColor: theme.success }]}>
            <Feather name="check-circle" size={18} color="#fff" />
            <ThemedText style={styles.messageText}>{successMessage}</ThemedText>
          </View>
        ) : null}

        <View style={styles.avatarSection}>
          <Pressable 
            style={[styles.avatarContainer, { backgroundColor: theme.primary }]}
            onPress={showPhotoOptions}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : driver?.profile_picture_url ? (
              <Image key={driver.profile_picture_url} source={{ uri: driver.profile_picture_url }} style={styles.avatarImage} />
            ) : (
              <ThemedText style={styles.avatarText}>
                {name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'DR'}
              </ThemedText>
            )}
            <View style={[styles.cameraOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <Feather name="camera" size={20} color="#fff" />
            </View>
          </Pressable>
          <Pressable onPress={showPhotoOptions} disabled={uploadingPhoto}>
            <ThemedText style={[styles.changePhotoText, { color: theme.link }]}>
              {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Full Name</ThemedText>
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
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Email</ThemedText>
            <TextInput
              style={[styles.input, styles.disabledInput, { 
                backgroundColor: theme.backgroundSecondary, 
                borderColor: theme.backgroundSecondary,
                color: theme.secondaryText 
              }]}
              value={user?.email || ''}
              editable={false}
            />
            <ThemedText style={[styles.helperText, { color: theme.secondaryText }]}>
              Email cannot be changed
            </ThemedText>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Phone Number</ThemedText>
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

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Postcode</ThemedText>
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

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Address</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter your address"
              placeholderTextColor={theme.secondaryText}
              multiline={false}
            />
          </View>

          <View style={styles.inputGroup}>
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
            <ThemedText style={[styles.helperText, { color: theme.secondaryText }]}>
              Your 9-character National Insurance number
            </ThemedText>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Vehicle Type</ThemedText>
            <Pressable 
              style={[styles.vehicleTypeSelector, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary 
              }]}
              onPress={() => setShowVehicleTypePicker(true)}
            >
              <Feather 
                name={getVehicleIcon(vehicleType) as any} 
                size={18} 
                color={theme.text} 
              />
              <ThemedText style={[styles.vehicleTypeSelectorText, { color: theme.text }]}>
                {formatVehicleType(vehicleType)}
              </ThemedText>
              <Feather name="chevron-down" size={18} color={theme.secondaryText} />
            </Pressable>
            <ThemedText style={[styles.helperText, { color: theme.secondaryText }]}>
              Select your current vehicle type
            </ThemedText>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Vehicle Registration Number</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={vehicleRegistration}
              onChangeText={(text) => setVehicleRegistration(text.toUpperCase())}
              placeholder="e.g., AB12 CDE"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="characters"
            />
            <ThemedText style={[styles.helperText, { color: theme.secondaryText }]}>
              Your vehicle registration plate number
            </ThemedText>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Vehicle Make</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={vehicleMake}
              onChangeText={setVehicleMake}
              placeholder="e.g., Ford, Toyota, Mercedes"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Vehicle Model</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={vehicleModel}
              onChangeText={setVehicleModel}
              placeholder="e.g., Transit, Corolla, Sprinter"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Vehicle Colour</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={vehicleColor}
              onChangeText={setVehicleColor}
              placeholder="e.g., White, Black, Silver"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="words"
            />
          </View>

          <Button
            title={loading ? 'Saving...' : 'Save Changes'}
            onPress={handleSave}
            disabled={loading || uploadingPhoto}
            style={styles.saveButton}
          />
        </View>
      </View>

      <Modal
        visible={showPhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowPhotoModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={styles.modalTitle}>Profile Photo</ThemedText>
            <ThemedText style={[styles.modalSubtitle, { color: theme.secondaryText }]}>
              Choose an option
            </ThemedText>
            
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={takeProfilePhoto}
              >
                <Feather name="camera" size={20} color="#fff" />
                <ThemedText style={styles.modalButtonText}>Take Photo</ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={pickProfilePhoto}
              >
                <Feather name="image" size={20} color="#fff" />
                <ThemedText style={styles.modalButtonText}>Choose from Library</ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.modalCancelButton, { borderColor: theme.backgroundSecondary }]}
                onPress={() => setShowPhotoModal(false)}
              >
                <ThemedText style={[styles.modalCancelText, { color: theme.text }]}>Cancel</ThemedText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showVehicleTypePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVehicleTypePicker(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowVehicleTypePicker(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={styles.modalTitle}>Select Vehicle Type</ThemedText>
            <ThemedText style={[styles.modalSubtitle, { color: theme.secondaryText }]}>
              Choose your vehicle type
            </ThemedText>
            
            <View style={styles.modalButtons}>
              {vehicleTypes.map((type) => (
                <Pressable
                  key={type.value}
                  style={[
                    styles.vehicleTypeOption, 
                    { 
                      backgroundColor: vehicleType === type.value ? theme.primary : theme.backgroundSecondary,
                      borderColor: vehicleType === type.value ? theme.primary : theme.backgroundSecondary,
                    }
                  ]}
                  onPress={() => {
                    setVehicleType(type.value);
                    setShowVehicleTypePicker(false);
                  }}
                >
                  <Feather 
                    name={type.icon as any} 
                    size={20} 
                    color={vehicleType === type.value ? '#fff' : theme.text} 
                  />
                  <ThemedText style={[
                    styles.vehicleTypeOptionText, 
                    { color: vehicleType === type.value ? '#fff' : theme.text }
                  ]}>
                    {type.label}
                  </ThemedText>
                  {vehicleType === type.value ? (
                    <Feather name="check" size={20} color="#fff" />
                  ) : null}
                </Pressable>
              ))}
              
              <Pressable
                style={[styles.modalCancelButton, { borderColor: theme.backgroundSecondary }]}
                onPress={() => setShowVehicleTypePicker(false)}
              >
                <ThemedText style={[styles.modalCancelText, { color: theme.text }]}>Cancel</ThemedText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  messageText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '500',
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoText: {
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  disabledInput: {
    opacity: 0.7,
  },
  helperText: {
    fontSize: 15,
    marginTop: Spacing.xs,
  },
  vehicleTypeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  vehicleTypeDisplayText: {
    fontSize: 16,
  },
  saveButton: {
    marginTop: Spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    fontSize: 17,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  modalButtons: {
    gap: Spacing.md,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalCancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  vehicleTypeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  vehicleTypeSelectorText: {
    fontSize: 16,
    flex: 1,
  },
  vehicleTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  vehicleTypeOptionText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
});
