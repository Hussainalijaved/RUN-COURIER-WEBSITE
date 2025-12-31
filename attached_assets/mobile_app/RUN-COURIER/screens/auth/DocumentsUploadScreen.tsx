import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Button } from '@/components/Button';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

type Document = {
  id: string;
  name: string;
  required: boolean;
  uploaded: boolean;
  uploading: boolean;
  url?: string;
  vehicleTypes?: ('car' | 'van' | 'motorcycle' | 'bicycle')[];
};

const BASE_DOCUMENTS: Omit<Document, 'uploaded' | 'uploading'>[] = [
  { id: 'dbs', name: 'DBS Certificate', required: true },
  { id: 'id_proof', name: 'ID Proof (Passport/Driving License)', required: true },
  { id: 'vehicle_insurance', name: 'Vehicle Insurance', required: true, vehicleTypes: ['car', 'van', 'motorcycle'] },
  { id: 'goods_in_transit', name: 'Goods in Transit Insurance', required: true, vehicleTypes: ['car', 'van', 'motorcycle'] },
  { id: 'driving_license', name: 'Driving License', required: true, vehicleTypes: ['car', 'van', 'motorcycle'] },
  { id: 'vehicle_front', name: 'Vehicle Photo (Front)', required: true, vehicleTypes: ['car', 'van', 'motorcycle'] },
  { id: 'vehicle_back', name: 'Vehicle Photo (Back)', required: true, vehicleTypes: ['car', 'van', 'motorcycle'] },
  { id: 'bicycle_photo', name: 'Bicycle Photo', required: true, vehicleTypes: ['bicycle'] },
];

export function DocumentsUploadScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { user, driver, refreshDriver } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const driverVehicleType = driver?.vehicle_type || 'car';
    const mapVehicleType = (vt: string): 'car' | 'van' | 'motorcycle' | 'bicycle' => {
      if (vt === 'motorbike') return 'motorcycle';
      if (vt === 'small_van' || vt === 'medium_van') return 'van';
      if (vt === 'bicycle') return 'bicycle';
      return 'car';
    };
    const vehicleType = mapVehicleType(driverVehicleType);
    const filteredDocs = BASE_DOCUMENTS.filter(
      doc => !doc.vehicleTypes || doc.vehicleTypes.includes(vehicleType)
    ).map(doc => ({
      ...doc,
      uploaded: false,
      uploading: false,
    }));
    setDocuments(filteredDocs);
  }, [driver?.vehicle_type]);

  const requiredDocs = documents.filter(doc => doc.required);
  const allRequiredUploaded = requiredDocs.every(doc => doc.uploaded);
  const uploadedCount = documents.filter(doc => doc.uploaded).length;

  const showImageOptions = (docId: string) => {
    Alert.alert(
      'Upload Document',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: () => takePhoto(docId) },
        { text: 'Choose from Library', onPress: () => pickImage(docId) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const pickImage = async (docId: string) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadDocument(docId, result.assets[0].uri);
    }
  };

  const takePhoto = async (docId: string) => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your camera.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadDocument(docId, result.assets[0].uri);
    }
  };

  const uploadDocument = async (docId: string, uri: string) => {
    if (!user) return;

    setDocuments(prev => prev.map(doc => 
      doc.id === docId ? { ...doc, uploading: true } : doc
    ));

    try {
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
      
      const fileData = base64ToArrayBuffer(base64);
      const fileExt = (uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
      
      // Determine content type based on extension
      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'gif') contentType = 'image/gif';
      else if (fileExt === 'webp') contentType = 'image/webp';
      else if (fileExt === 'heic') contentType = 'image/heic';
      else if (fileExt === 'pdf') contentType = 'application/pdf';
      
      const fileName = `${user.id}/${docId}_${Date.now()}.${fileExt}`;
      const filePath = `documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('DRIVER-DOCUMENTS')
        .upload(filePath, fileData, { upsert: true, contentType });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        Alert.alert('Upload Failed', 'Could not upload the document. Please try again.');
        setDocuments(prev => prev.map(doc => 
          doc.id === docId ? { ...doc, uploading: false } : doc
        ));
        return;
      }

      const { data } = supabase.storage
        .from('DRIVER-DOCUMENTS')
        .getPublicUrl(filePath);

      setDocuments(prev => prev.map(doc => 
        doc.id === docId ? { ...doc, uploaded: true, uploading: false, url: data.publicUrl } : doc
      ));

    } catch (error) {
      console.error('Document upload error:', error);
      Alert.alert('Upload Failed', 'Something went wrong. Please try again.');
      setDocuments(prev => prev.map(doc => 
        doc.id === docId ? { ...doc, uploading: false } : doc
      ));
    }
  };

  const handleSubmit = async () => {
    if (!allRequiredUploaded) {
      Alert.alert('Missing Documents', 'Please upload all required documents before continuing.');
      return;
    }

    setSubmitting(true);

    try {
      const uploadedDocs: Record<string, string> = {};
      documents.forEach(doc => {
        if (doc.uploaded && doc.url) {
          if (doc.id === 'driving_license') {
            uploadedDocs.license_url = doc.url;
          } else if (doc.id === 'vehicle_insurance') {
            uploadedDocs.insurance_url = doc.url;
          } else if (doc.id === 'vehicle_front') {
            uploadedDocs.vehicle_photo_url = doc.url;
          }
        }
      });

      if (Object.keys(uploadedDocs).length > 0) {
        const { error } = await supabase
          .from('drivers')
          .update(uploadedDocs)
          .eq('user_id', user?.id);

        if (error) {
          console.error('Update driver error:', error);
        }
      }

      await refreshDriver();

      Alert.alert(
        'Documents Submitted',
        'Your documents have been submitted for review. You can now start using the app.',
        [
          { 
            text: 'Continue', 
            onPress: () => navigation.replace('DriverTabs') 
          }
        ]
      );
    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Error', 'Failed to submit documents. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueLater = () => {
    navigation.replace('DriverTabs');
  };

  return (
    <ScreenScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <ThemedText style={styles.title}>Upload Documents</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.secondaryText }]}>
          {uploadedCount} of {documents.length} uploaded
        </ThemedText>

        <View style={[styles.infoCard, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="info" size={20} color={theme.link} />
          <ThemedText style={[styles.infoText, { color: theme.secondaryText }]}>
            Documents are securely stored and used for verification purposes only.
          </ThemedText>
        </View>

        <View style={styles.documentsList}>
          {documents.map((doc) => (
            <ThemedView key={doc.id} style={styles.documentCard}>
              <View style={styles.documentInfo}>
                <View style={styles.documentHeader}>
                  <ThemedText style={styles.documentName}>{doc.name}</ThemedText>
                  {doc.required ? (
                    <ThemedText style={[styles.requiredTag, { color: theme.error }]}>Required</ThemedText>
                  ) : null}
                </View>
                <View style={styles.documentStatus}>
                  {doc.uploading ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : doc.uploaded ? (
                    <Feather name="check-circle" size={20} color={theme.success} />
                  ) : (
                    <Feather name="clock" size={20} color={theme.warning} />
                  )}
                  <ThemedText 
                    style={[
                      styles.statusText, 
                      { color: doc.uploading ? theme.primary : doc.uploaded ? theme.success : theme.warning }
                    ]}
                  >
                    {doc.uploading ? 'Uploading...' : doc.uploaded ? 'Uploaded' : 'Pending'}
                  </ThemedText>
                </View>
              </View>
              <Pressable 
                onPress={() => showImageOptions(doc.id)}
                disabled={doc.uploading}
                style={[
                  styles.uploadButton, 
                  { 
                    borderColor: doc.uploading ? theme.secondaryText : theme.primary,
                    opacity: doc.uploading ? 0.5 : 1,
                  }
                ]}
              >
                <ThemedText style={[styles.uploadText, { color: doc.uploading ? theme.secondaryText : theme.primary }]}>
                  {doc.uploaded ? 'Replace' : 'Upload'}
                </ThemedText>
              </Pressable>
            </ThemedView>
          ))}
        </View>

        <Button 
          title={submitting ? 'Submitting...' : 'Submit for Review'}
          onPress={handleSubmit}
          disabled={!allRequiredUploaded || submitting}
          style={styles.button}
        />

        <Pressable onPress={handleContinueLater} style={styles.skipButton}>
          <ThemedText style={[styles.skipText, { color: theme.link }]}>
            Continue Later
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
    marginBottom: Spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing['2xl'],
    gap: Spacing.sm,
  },
  infoText: {
    fontSize: 17,
    flex: 1,
  },
  documentsList: {
    gap: Spacing.md,
    marginBottom: Spacing['2xl'],
  },
  documentCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  documentInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  requiredTag: {
    fontSize: 15,
    fontWeight: '500',
  },
  documentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusText: {
    fontSize: 17,
  },
  uploadButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  uploadText: {
    fontSize: 17,
    fontWeight: '600',
  },
  button: {
    marginTop: Spacing.lg,
  },
  skipButton: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
