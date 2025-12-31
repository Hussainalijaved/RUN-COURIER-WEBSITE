import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Alert, Image, ActivityIndicator, TextInput, Platform, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Button } from '@/components/Button';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { 
  uploadDocument, 
  getDocumentByType, 
  deleteDocument,
  getDocumentDisplayStatus,
  DriverDocument,
  DocumentDefinition 
} from '@/services/documentService';

type RouteParams = {
  documentDef: DocumentDefinition;
};

export function DocumentDetailScreen({ route, navigation }: any) {
  const { documentDef } = route.params as RouteParams;
  const { theme } = useTheme();
  const { driver, user } = useAuth();
  
  const isMultiPhoto = documentDef.multiPhoto && documentDef.multiPhoto.count > 1;
  const photoCount = documentDef.multiPhoto?.count || 1;
  const photoLabels = documentDef.multiPhoto?.labels || [''];

  const [documents, setDocuments] = useState<(DriverDocument | null)[]>(Array(photoCount).fill(null));
  const [selectedImages, setSelectedImages] = useState<(string | null)[]>(Array(photoCount).fill(null));
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const activePhotoIndexRef = useRef(0);
  const [deletePhotoIndex, setDeletePhotoIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const driverId = driver?.id || user?.id || '';

  const getDocTypeForIndex = (index: number) => {
    if (!isMultiPhoto) return documentDef.type;
    const label = photoLabels[index]?.toLowerCase() || index.toString();
    return `${documentDef.type}_${label}`;
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    if (Platform.OS !== 'web') {
      Alert.alert('Error', message);
    }
  };

  const showSuccess = (message: string, callback?: () => void) => {
    setSuccessMessage(message);
    if (Platform.OS !== 'web') {
      Alert.alert('Success', message, [{ text: 'OK', onPress: callback }]);
    } else if (callback) {
      setTimeout(callback, 1500);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [driverId, documentDef.type]);

  const loadDocuments = async () => {
    if (!driverId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const loadedDocs: (DriverDocument | null)[] = [];
      
      for (let i = 0; i < photoCount; i++) {
        const docType = getDocTypeForIndex(i);
        console.log(`[DOC LOAD] Index ${i}, Label: ${photoLabels[i]}, DocType: ${docType}`);
        const doc = await getDocumentByType(driverId, docType);
        console.log(`[DOC LOAD] Found doc for ${docType}:`, doc ? doc.file_url?.substring(0, 50) + '...' : 'null');
        loadedDocs.push(doc);
      }
      
      setDocuments(loadedDocs);
      
      const firstDocWithExpiry = loadedDocs.find(d => d?.expiry_date);
      if (firstDocWithExpiry?.expiry_date) {
        setExpiryDate(firstDocWithExpiry.expiry_date);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    setShowImageModal(false);
    setErrorMessage(null);
    const currentIndex = activePhotoIndexRef.current;
    console.log(`[PICK IMAGE] Using index ${currentIndex} (label: ${photoLabels[currentIndex]})`);
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        showError('Please allow access to your photos to upload documents.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets[0]) {
        const newSelectedImages = [...selectedImages];
        newSelectedImages[currentIndex] = result.assets[0].uri;
        console.log(`[PICK IMAGE] Saved image to index ${currentIndex}`);
        setSelectedImages(newSelectedImages);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showError('Failed to open photo library');
    }
  };

  const takePhoto = async () => {
    setShowImageModal(false);
    setErrorMessage(null);
    const currentIndex = activePhotoIndexRef.current;
    console.log(`[TAKE PHOTO] Using index ${currentIndex} (label: ${photoLabels[currentIndex]})`);
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        showError('Please allow camera access to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets[0]) {
        const newSelectedImages = [...selectedImages];
        newSelectedImages[currentIndex] = result.assets[0].uri;
        console.log(`[TAKE PHOTO] Saved image to index ${currentIndex}`);
        setSelectedImages(newSelectedImages);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showError('Failed to open camera. Camera may not be available on web.');
    }
  };

  const showImageOptions = (index: number) => {
    setActivePhotoIndex(index);
    activePhotoIndexRef.current = index;
    console.log(`[IMG SELECT] Setting active photo index to ${index} (label: ${photoLabels[index]})`);
    setErrorMessage(null);
    if (Platform.OS === 'web') {
      setShowImageModal(true);
    } else {
      Alert.alert(
        'Select Image',
        `Choose how to add ${isMultiPhoto ? photoLabels[index] : 'your document'}`,
        [
          { text: 'Take Photo', onPress: takePhoto },
          { text: 'Choose from Library', onPress: pickImage },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const validateExpiryDate = (date: string): boolean => {
    if (!date) return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(date)) return false;
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  };

  const hasAnyImage = () => {
    for (let i = 0; i < photoCount; i++) {
      if (selectedImages[i] || documents[i]?.file_url) {
        return true;
      }
    }
    return false;
  };

  const hasAllRequiredImages = () => {
    for (let i = 0; i < photoCount; i++) {
      if (!selectedImages[i] && !documents[i]?.file_url) {
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    
    if (!hasAnyImage()) {
      showError('Please select at least one image to upload');
      return;
    }

    if (isMultiPhoto && !hasAllRequiredImages()) {
      const missingLabels = photoLabels.filter((_, i) => !selectedImages[i] && !documents[i]?.file_url);
      showError(`Please upload all required photos: ${missingLabels.join(', ')}`);
      return;
    }

    if (documentDef.requiresExpiry && !expiryDate && !documents[0]?.expiry_date) {
      showError('Please enter an expiry date for this document');
      return;
    }

    if (documentDef.requiresExpiry && expiryDate && !validateExpiryDate(expiryDate)) {
      showError('Please enter a valid expiry date in format YYYY-MM-DD');
      return;
    }

    if (!driverId) {
      showError('Driver ID not found. Please log in again.');
      return;
    }

    const hasNewImages = selectedImages.some(img => img !== null);
    if (!hasNewImages) {
      navigation.goBack();
      return;
    }

    setUploading(true);
    try {
      let allSuccess = true;
      
      for (let i = 0; i < photoCount; i++) {
        if (selectedImages[i]) {
          const docType = getDocTypeForIndex(i);
          console.log(`[DOC UPLOAD] Index ${i}, Label: ${photoLabels[i]}, DocType: ${docType}`);
          const result = await uploadDocument(
            driverId,
            docType,
            selectedImages[i]!,
            documentDef.requiresExpiry ? expiryDate : undefined
          );
          console.log(`[DOC UPLOAD] Result for ${docType}:`, result.success ? 'SUCCESS' : result.error);
          
          if (!result.success) {
            allSuccess = false;
            showError(result.error || `Failed to upload ${isMultiPhoto ? photoLabels[i] : 'document'}. Please try again.`);
            break;
          }
        }
      }

      if (allSuccess) {
        showSuccess('Document uploaded successfully! It will be reviewed shortly.', () => navigation.goBack());
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      showError(error.message || 'Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    setShowDeleteModal(false);
    const doc = documents[deletePhotoIndex];
    if (!doc?.id) return;
    
    setDeleting(true);
    try {
      const success = await deleteDocument(doc.id);
      if (success) {
        const newDocs = [...documents];
        newDocs[deletePhotoIndex] = null;
        setDocuments(newDocs);
        
        const newSelected = [...selectedImages];
        newSelected[deletePhotoIndex] = null;
        setSelectedImages(newSelected);
        
        if (!isMultiPhoto || documents.filter((d, i) => i !== deletePhotoIndex && d).length === 0) {
          showSuccess('Document has been deleted.', () => navigation.goBack());
        } else {
          showSuccess(`${photoLabels[deletePhotoIndex]} photo has been deleted.`);
        }
      } else {
        showError('Failed to delete document. Please try again.');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showError('Failed to delete document. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = async (index: number) => {
    const doc = documents[index];
    if (!doc?.id) return;

    setDeletePhotoIndex(index);
    
    if (Platform.OS === 'web') {
      setShowDeleteModal(true);
    } else {
      Alert.alert(
        'Delete Document',
        `Are you sure you want to delete ${isMultiPhoto ? photoLabels[index] + ' photo' : 'this document'}? You will need to upload it again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ]
      );
    }
  };

  const getOverallStatus = () => {
    const statuses = documents.map(d => d?.status);
    if (statuses.every(s => s === 'verified')) return 'verified';
    if (statuses.some(s => s === 'rejected')) return 'rejected';
    if (statuses.some(s => s === 'pending')) return 'pending';
    return undefined;
  };

  const getStatusColor = (status?: string) => {
    const displayStatus = getDocumentDisplayStatus(status);
    switch (displayStatus.color) {
      case 'success':
        return theme.success;
      case 'warning':
        return theme.warning;
      case 'error':
        return theme.error;
      default:
        return theme.secondaryText;
    }
  };

  const overallStatus = getOverallStatus();
  const statusDisplay = getDocumentDisplayStatus(overallStatus);

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]} edges={['top', 'bottom', 'left', 'right']}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={styles.loadingText}>Loading document...</ThemedText>
      </SafeAreaView>
    );
  }

  const renderPhotoSlot = (index: number) => {
    const displayImage = selectedImages[index] || documents[index]?.file_url;
    const label = isMultiPhoto ? photoLabels[index] : '';
    const doc = documents[index];

    return (
      <View key={index} style={styles.photoSlot}>
        {isMultiPhoto ? (
          <ThemedText style={[styles.photoLabel, { color: theme.text }]}>
            {label}
          </ThemedText>
        ) : null}
        
        {displayImage ? (
          <View style={styles.imageContainer}>
            <Image 
              source={{ uri: displayImage }} 
              style={styles.previewImage}
              resizeMode="contain"
            />
            {selectedImages[index] ? (
              <View style={[styles.newBadge, { backgroundColor: theme.primary }]}>
                <ThemedText style={styles.newBadgeText}>NEW</ThemedText>
              </View>
            ) : null}
          </View>
        ) : (
          <Pressable 
            style={[styles.uploadPlaceholder, { borderColor: theme.backgroundSecondary }]}
            onPress={() => showImageOptions(index)}
          >
            <Feather name="upload-cloud" size={36} color={theme.secondaryText} />
            <ThemedText style={[styles.uploadText, { color: theme.secondaryText }]}>
              {isMultiPhoto ? `Upload ${label}` : 'Tap to upload document'}
            </ThemedText>
          </Pressable>
        )}

        <View style={styles.photoActions}>
          <Pressable
            style={[styles.photoActionButton, { backgroundColor: theme.primary }]}
            onPress={() => showImageOptions(index)}
          >
            <Feather name="camera" size={18} color="#fff" />
            <ThemedText style={styles.photoActionText}>
              {displayImage ? 'Replace' : 'Upload'}
            </ThemedText>
          </Pressable>
          
          {doc?.id ? (
            <Pressable
              style={[styles.photoActionButton, styles.deleteActionButton, { borderColor: theme.error }]}
              onPress={() => handleDelete(index)}
              disabled={deleting}
            >
              <Feather name="trash-2" size={18} color={theme.error} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <ScreenKeyboardAwareScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} hasTabBar={true}>
      <View style={styles.content}>
        {errorMessage ? (
          <View style={[styles.messageContainer, { backgroundColor: theme.error + '15' }]}>
            <ThemedText style={[styles.messageText, { color: theme.error }]}>
              {errorMessage}
            </ThemedText>
            <Pressable onPress={() => setErrorMessage(null)}>
              <Feather name="x" size={18} color={theme.error} />
            </Pressable>
          </View>
        ) : null}
        
        {successMessage ? (
          <View style={[styles.messageContainer, { backgroundColor: theme.success + '15' }]}>
            <ThemedText style={[styles.messageText, { color: theme.success }]}>
              {successMessage}
            </ThemedText>
          </View>
        ) : null}

        <ThemedView style={styles.headerCard}>
          <View style={styles.headerInfo}>
            <ThemedText style={styles.documentTitle}>{documentDef.name}</ThemedText>
            {isMultiPhoto ? (
              <ThemedText style={[styles.photoCountHint, { color: theme.secondaryText }]}>
                {photoCount} photos required ({photoLabels.join(' & ')})
              </ThemedText>
            ) : null}
            {documentDef.optional ? (
              <ThemedText style={[styles.optionalBadge, { color: theme.secondaryText }]}>
                Optional
              </ThemedText>
            ) : null}
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(overallStatus) + '20' }]}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(overallStatus) }]} />
                <ThemedText style={[styles.statusText, { color: getStatusColor(overallStatus) }]}>
                  {statusDisplay.label}
                </ThemedText>
              </View>
            </View>
          </View>
        </ThemedView>

        <ThemedView style={styles.previewCard}>
          <ThemedText style={styles.sectionTitle}>
            {isMultiPhoto ? 'Document Photos' : 'Document Preview'}
          </ThemedText>
          
          <View style={isMultiPhoto ? styles.multiPhotoGrid : undefined}>
            {Array.from({ length: photoCount }).map((_, index) => renderPhotoSlot(index))}
          </View>
        </ThemedView>

        {documentDef.requiresExpiry ? (
          <ThemedView style={styles.expiryCard}>
            <ThemedText style={styles.sectionTitle}>Expiry Date</ThemedText>
            <ThemedText style={[styles.expiryHint, { color: theme.secondaryText }]}>
              Select when this document expires
            </ThemedText>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[styles.datePickerButton, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
              }]}
            >
              <Feather name="calendar" size={20} color={theme.primary} />
              <ThemedText style={[styles.datePickerText, { 
                color: expiryDate || documents[0]?.expiry_date ? theme.text : theme.secondaryText 
              }]}>
                {expiryDate || documents[0]?.expiry_date 
                  ? new Date(expiryDate || documents[0]?.expiry_date || '').toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })
                  : 'Tap to select expiry date'}
              </ThemedText>
              <Feather name="chevron-down" size={20} color={theme.secondaryText} />
            </Pressable>
          </ThemedView>
        ) : null}

        {documents.some(d => d?.uploaded_at) ? (
          <ThemedView style={styles.metaCard}>
            <ThemedText style={styles.sectionTitle}>Document Info</ThemedText>
            <View style={styles.metaRow}>
              <ThemedText style={[styles.metaLabel, { color: theme.secondaryText }]}>Uploaded:</ThemedText>
              <ThemedText style={styles.metaValue}>
                {new Date(documents.find(d => d?.uploaded_at)?.uploaded_at || '').toLocaleDateString()}
              </ThemedText>
            </View>
            {documents[0]?.expiry_date ? (
              <View style={styles.metaRow}>
                <ThemedText style={[styles.metaLabel, { color: theme.secondaryText }]}>Expires:</ThemedText>
                <ThemedText style={[styles.metaValue, { 
                  color: new Date(documents[0].expiry_date) < new Date() ? theme.error : theme.text 
                }]}>
                  {new Date(documents[0].expiry_date).toLocaleDateString()}
                </ThemedText>
              </View>
            ) : null}
          </ThemedView>
        ) : null}

        <View style={styles.buttonContainer}>
          <Button
            title={uploading ? 'Uploading...' : 'Save Document'}
            onPress={handleSave}
            disabled={uploading || deleting || !hasAnyImage()}
            style={styles.saveButton}
          />
          {uploading ? (
            <View style={styles.uploadingHint}>
              <ActivityIndicator size="small" color={theme.primary} />
              <ThemedText style={[styles.uploadingText, { color: theme.secondaryText }]}>
                Please wait while your document is being uploaded...
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowImageModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={styles.modalTitle}>Select Image</ThemedText>
            <ThemedText style={[styles.modalSubtitle, { color: theme.secondaryText }]}>
              {isMultiPhoto ? `Add ${photoLabels[activePhotoIndex]} photo` : 'Choose how to add your document'}
            </ThemedText>
            
            <Pressable
              style={[styles.modalOption, { backgroundColor: theme.primary }]}
              onPress={takePhoto}
            >
              <Feather name="camera" size={20} color="#fff" />
              <ThemedText style={[styles.modalOptionText, { color: '#fff' }]}>
                Take Photo
              </ThemedText>
            </Pressable>
            
            <Pressable
              style={[styles.modalOption, { backgroundColor: theme.primary }]}
              onPress={pickImage}
            >
              <Feather name="image" size={20} color="#fff" />
              <ThemedText style={[styles.modalOptionText, { color: '#fff' }]}>
                Choose from Library
              </ThemedText>
            </Pressable>
            
            <Pressable
              style={[styles.modalCancelOption, { borderColor: theme.backgroundSecondary }]}
              onPress={() => setShowImageModal(false)}
            >
              <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowDeleteModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={styles.modalTitle}>Delete {isMultiPhoto ? photoLabels[deletePhotoIndex] : 'Document'}</ThemedText>
            <ThemedText style={[styles.modalSubtitle, { color: theme.secondaryText }]}>
              Are you sure you want to delete this {isMultiPhoto ? 'photo' : 'document'}? You will need to upload it again.
            </ThemedText>
            
            <Pressable
              style={[styles.modalOption, { backgroundColor: theme.error }]}
              onPress={confirmDelete}
            >
              <Feather name="trash-2" size={20} color="#fff" />
              <ThemedText style={[styles.modalOptionText, { color: '#fff' }]}>
                Delete
              </ThemedText>
            </Pressable>
            
            <Pressable
              style={[styles.modalCancelOption, { borderColor: theme.backgroundSecondary }]}
              onPress={() => setShowDeleteModal(false)}
            >
              <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {Platform.OS === 'web' ? (
        <Modal
          visible={showDatePicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <Pressable 
            style={styles.modalOverlay} 
            onPress={() => setShowDatePicker(false)}
          >
            <View style={[styles.datePickerModal, { backgroundColor: theme.backgroundDefault }]}>
              <ThemedText style={styles.modalTitle}>Select Expiry Date</ThemedText>
              <WebDatePicker
                value={expiryDate || documents[0]?.expiry_date || ''}
                onChange={(date: string) => {
                  setExpiryDate(date);
                  setShowDatePicker(false);
                }}
                theme={theme}
              />
              <Pressable
                style={[styles.modalCancelOption, { borderColor: theme.backgroundSecondary, marginTop: Spacing.md }]}
                onPress={() => setShowDatePicker(false)}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : showDatePicker ? (
        <DateTimePicker
          value={expiryDate ? new Date(expiryDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(event: any, selectedDate: Date | undefined) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (selectedDate && event.type !== 'dismissed') {
              const dateString = selectedDate.toISOString().split('T')[0];
              setExpiryDate(dateString);
            }
          }}
        />
      ) : null}
    </ScreenKeyboardAwareScrollView>
  );
}

function WebDatePicker({ value, onChange, theme }: { value: string; onChange: (date: string) => void; theme: any }) {
  const currentDate = value ? new Date(value) : new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [selectedDay, setSelectedDay] = useState(currentDate.getDate());

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };
  
  const days = Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1);

  const handleConfirm = () => {
    const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    onChange(dateStr);
  };

  return (
    <View style={webDatePickerStyles.container}>
      <View style={webDatePickerStyles.pickerRow}>
        <View style={webDatePickerStyles.pickerColumn}>
          <ThemedText style={[webDatePickerStyles.label, { color: theme.secondaryText }]}>Day</ThemedText>
          <ScrollView style={[webDatePickerStyles.scrollPicker, { borderColor: theme.backgroundSecondary }]} showsVerticalScrollIndicator={false}>
            {days.map((day) => (
              <Pressable
                key={day}
                onPress={() => setSelectedDay(day)}
                style={[
                  webDatePickerStyles.pickerItem,
                  selectedDay === day && { backgroundColor: theme.primary + '20' }
                ]}
              >
                <ThemedText style={[
                  webDatePickerStyles.pickerItemText,
                  selectedDay === day && { color: theme.primary, fontWeight: '600' }
                ]}>
                  {day}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        
        <View style={webDatePickerStyles.pickerColumn}>
          <ThemedText style={[webDatePickerStyles.label, { color: theme.secondaryText }]}>Month</ThemedText>
          <ScrollView style={[webDatePickerStyles.scrollPicker, { borderColor: theme.backgroundSecondary }]} showsVerticalScrollIndicator={false}>
            {months.map((month, index) => (
              <Pressable
                key={month}
                onPress={() => setSelectedMonth(index)}
                style={[
                  webDatePickerStyles.pickerItem,
                  selectedMonth === index && { backgroundColor: theme.primary + '20' }
                ]}
              >
                <ThemedText style={[
                  webDatePickerStyles.pickerItemText,
                  selectedMonth === index && { color: theme.primary, fontWeight: '600' }
                ]}>
                  {month.substring(0, 3)}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        
        <View style={webDatePickerStyles.pickerColumn}>
          <ThemedText style={[webDatePickerStyles.label, { color: theme.secondaryText }]}>Year</ThemedText>
          <ScrollView style={[webDatePickerStyles.scrollPicker, { borderColor: theme.backgroundSecondary }]} showsVerticalScrollIndicator={false}>
            {years.map((year) => (
              <Pressable
                key={year}
                onPress={() => setSelectedYear(year)}
                style={[
                  webDatePickerStyles.pickerItem,
                  selectedYear === year && { backgroundColor: theme.primary + '20' }
                ]}
              >
                <ThemedText style={[
                  webDatePickerStyles.pickerItemText,
                  selectedYear === year && { color: theme.primary, fontWeight: '600' }
                ]}>
                  {year}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
      
      <Pressable
        onPress={handleConfirm}
        style={[webDatePickerStyles.confirmButton, { backgroundColor: theme.primary }]}
      >
        <ThemedText style={webDatePickerStyles.confirmButtonText}>Confirm Date</ThemedText>
      </Pressable>
    </View>
  );
}

const webDatePickerStyles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: Spacing.md,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pickerColumn: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  scrollPicker: {
    height: 150,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  pickerItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  pickerItemText: {
    fontSize: 15,
  },
  confirmButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 16,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  headerCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  headerInfo: {
    gap: Spacing.sm,
  },
  documentTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  photoCountHint: {
    fontSize: 17,
  },
  optionalBadge: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  statusRow: {
    flexDirection: 'row',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xl,
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 17,
    fontWeight: '600',
  },
  previewCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  multiPhotoGrid: {
    gap: Spacing.lg,
  },
  photoSlot: {
    marginBottom: Spacing.md,
  },
  photoLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  imageContainer: {
    position: 'relative',
    marginBottom: Spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.md,
    backgroundColor: '#f0f0f0',
  },
  newBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  uploadPlaceholder: {
    height: 140,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  uploadText: {
    marginTop: Spacing.sm,
    fontSize: 17,
    fontWeight: '500',
  },
  photoActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  photoActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    flex: 1,
  },
  deleteActionButton: {
    flex: 0,
    backgroundColor: 'transparent',
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  photoActionText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  expiryCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  expiryHint: {
    fontSize: 16,
    marginBottom: Spacing.md,
    marginTop: -Spacing.xs,
  },
  dateInput: {
    height: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  datePickerButton: {
    height: 54,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  datePickerText: {
    flex: 1,
    fontSize: 16,
  },
  datePickerModal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  metaCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  metaLabel: {
    fontSize: 17,
  },
  metaValue: {
    fontSize: 17,
    fontWeight: '500',
  },
  buttonContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  saveButton: {
    marginTop: Spacing.sm,
  },
  uploadingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  uploadingText: {
    fontSize: 14,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  messageText: {
    fontSize: 17,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalCancelOption: {
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
});
