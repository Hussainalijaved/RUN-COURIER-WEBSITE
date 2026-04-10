import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable, Linking, Alert, TextInput, Modal, Platform, Text, ScrollView, ActivityIndicator, Dimensions, KeyboardAvoidingView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Button } from '@/components/Button';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SignaturePad, SignaturePadRef } from '@/components/SignaturePad';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { supabase, Job } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { sendPODEmail, PODEmailData } from '@/services/emailService';
import { DriverJobMap } from '@/components/DriverJobMap';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  saveDriverContextForBg,
  clearDriverContextForBg,
  requestBackgroundPermission,
} from '@/services/backgroundLocation';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';

// FREEZE PREVENTION: Timeout wrapper for all async operations
// ALWAYS resolves - never rejects - to prevent UI freezes
const API_TIMEOUT_MS = 10000;
const LOCATION_TIMEOUT_MS = 5000;

// Safe timeout wrapper that ALWAYS resolves (never throws)
const safeTimeout = async <T,>(
  promise: Promise<T>, 
  timeoutMs: number,
  fallback: T
): Promise<T> => {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
  } catch (error) {
    console.warn('[SafeTimeout] Operation failed/timed out, using fallback:', error);
    return fallback;
  }
};

// Generate a simple UUID for file naming
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

type JobStatus = 'accepted' | 'arrived_pickup' | 'picked_up' | 'on_the_way' | 'delivered';

const STATUS_LABELS: Record<JobStatus, string> = {
  accepted: 'Accepted',
  arrived_pickup: 'At Pickup',
  picked_up: 'Picked Up',
  on_the_way: 'On The Way',
  delivered: 'Delivered',
};

const STATUS_STEPS: JobStatus[] = ['accepted', 'arrived_pickup', 'picked_up', 'on_the_way', 'delivered'];

const MAX_POD_PHOTOS = 10;

export function ActiveJobScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { user, driver } = useAuth();
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showPODModal, setShowPODModal] = useState(false);
  const [podNotes, setPodNotes] = useState('');
  const [podPhotos, setPodPhotos] = useState<string[]>([]);
  const [recipientName, setRecipientName] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const signatureRef = useRef<SignaturePadRef>(null);
  const activeJobRef = useRef<Job | null>(null);
  const driverIdRef = useRef<string | null>(null);
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [scanType, setScanType] = useState<'pickup' | 'delivery'>('pickup');
  const [pickupBarcode, setPickupBarcode] = useState<string | null>(null);
  const [deliveryBarcode, setDeliveryBarcode] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanSessionId, setScanSessionId] = useState(Date.now());
  const lastScanTime = useRef<number>(0);
  const lastScannedCode = useRef<string>('');
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [failureReason, setFailureReason] = useState('');
  const [showNavModal, setShowNavModal] = useState(false);
  const [navDestination, setNavDestination] = useState<{ lat: number; lng: number; address: string; type: 'pickup' | 'delivery' } | null>(null);
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);

  // Waiting time state
  const [arrivedPickupTime, setArrivedPickupTime] = useState<number | null>(null);
  const [waitingTimerSeconds, setWaitingTimerSeconds] = useState(0);
  const [showWaitingTimeModal, setShowWaitingTimeModal] = useState(false);
  const [waitingMinutesInput, setWaitingMinutesInput] = useState('');
  const [submittingWaitingTime, setSubmittingWaitingTime] = useState(false);
  const [waitingTimeLogged, setWaitingTimeLogged] = useState(false);

  // CRITICAL: Use both driver.id AND user.id to catch jobs assigned with either ID
  const driverRecordId = driver?.id;
  const authUserId = user?.id;
  const driverId = driverRecordId || authUserId;
  const allDriverIds = [...new Set([driverRecordId, authUserId].filter(Boolean))] as string[];

  // FREEZE PREVENTION: Mounted ref to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  useEffect(() => {
    driverIdRef.current = driverId || null;
  }, [driverId]);

  useEffect(() => {
    if (activeJob) {
      setPickupBarcode((activeJob as any).pickup_barcode || null);
      setDeliveryBarcode((activeJob as any).delivery_barcode || null);
    } else {
      setPickupBarcode(null);
      setDeliveryBarcode(null);
    }
  }, [activeJob?.id]);

  // Restore arrivedPickupTime from AsyncStorage when job loads or status changes
  useEffect(() => {
    const restoreArrivedTime = async () => {
      if (activeJob?.status === 'arrived_pickup') {
        try {
          const stored = await AsyncStorage.getItem(`arrivedPickupTime_${activeJob.id}`);
          if (stored) {
            setArrivedPickupTime(parseInt(stored, 10));
          }
        } catch (e) {}
      } else {
        setArrivedPickupTime(null);
        setWaitingTimerSeconds(0);
      }
    };
    restoreArrivedTime();
  }, [activeJob?.id, activeJob?.status]);

  // 1-second countdown timer when waiting at pickup
  useEffect(() => {
    if (!arrivedPickupTime || activeJob?.status !== 'arrived_pickup') return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - arrivedPickupTime) / 1000);
      setWaitingTimerSeconds(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [arrivedPickupTime, activeJob?.status]);

  // FREEZE PREVENTION: Fetch request counter to ignore late-arriving results
  const fetchRequestIdRef = useRef(0);

  // FREEZE PREVENTION: Fetch active job with timeout protection
  // Always resolves loading state - never leaves UI hanging
  const fetchActiveJob = useCallback(async () => {
    // FREEZE PREVENTION: Immediately resolve if no driverId
    if (!driverId || allDriverIds.length === 0) {
      if (isMountedRef.current) setLoading(false);
      return;
    }
    
    // FREEZE PREVENTION: Increment request ID to track this specific request
    const thisRequestId = ++fetchRequestIdRef.current;
    let timedOut = false;

    try {
      // FREEZE PREVENTION: Race query against timeout
      // Query jobs assigned to either driver.id or auth user.id
      // SECURITY: Query driver_jobs_view instead of jobs table to hide customer pricing
      const queryPromise = supabase
        .from('driver_jobs_view')
        .select('*')
        .in('driver_id', allDriverIds)
        .in('status', ['accepted', 'arrived_pickup', 'picked_up', 'on_the_way'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => { timedOut = true; resolve(null); }, API_TIMEOUT_MS)
      );

      const result = await Promise.race([queryPromise, timeoutPromise]);

      // FREEZE PREVENTION: Ignore late-arriving results from stale requests
      if (fetchRequestIdRef.current !== thisRequestId) {
        console.log('[ActiveJob] Ignoring stale fetch result');
        return;
      }

      // FREEZE PREVENTION: If timed out, use null fallback
      if (timedOut || !result) {
        console.warn('[ActiveJob] Query timed out, using null fallback');
        if (isMountedRef.current) {
          setActiveJob(null);
          setLoading(false);
        }
        return;
      }

      const { data, error } = result;

      // FREEZE PREVENTION: Handle errors gracefully - PGRST116 means no rows found
      if (error && error.code !== 'PGRST116') {
        console.warn('[ActiveJob] Query error (non-blocking):', error);
      }
      if (isMountedRef.current) setActiveJob(data || null);
    } catch (error) {
      // FREEZE PREVENTION: Catch-all - never block UI
      console.warn('[ActiveJob] Error fetching job (recovered):', error);
      if (isMountedRef.current) setActiveJob(null);
    } finally {
      // FREEZE PREVENTION: ALWAYS resolve loading state (only if this is still the active request)
      if (isMountedRef.current && fetchRequestIdRef.current === thisRequestId) {
        setLoading(false);
      }
    }
  }, [driverId, allDriverIds.join(',')]);

  const updateDriverLocation = useCallback(async (latitude: number, longitude: number) => {
    const currentDriverId = driverIdRef.current;
    const currentJob = activeJobRef.current;
    
    if (!currentDriverId || !currentJob) return;
    if (currentJob.status === 'delivered') return;

    try {
      await supabase
        .from('jobs')
        .update({
          current_latitude: latitude,
          current_longitude: longitude,
          last_location_update: new Date().toISOString(),
        })
        .eq('id', currentJob.id);

      await supabase
        .from('drivers')
        .update({
          current_latitude: latitude,
          current_longitude: longitude,
          last_location_update: new Date().toISOString(),
        })
        .eq('id', currentDriverId);
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }, []);

  // FREEZE PREVENTION: User-initiated location tracking with timeout protection
  // This complies with Apple App Store Guidelines 5.1.1 (no permission on launch)
  const startLocationTracking = useCallback(async () => {
    const currentJob = activeJobRef.current;
    if (!currentJob || !user) return;
    if (currentJob.status === 'delivered') return;

    // FREEZE PREVENTION: Race permission request against timeout
    let permissionStatus = 'undetermined';
    let permissionTimedOut = false;
    
    try {
      const permissionPromise = Location.requestForegroundPermissionsAsync();
      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => { permissionTimedOut = true; resolve(null); }, LOCATION_TIMEOUT_MS)
      );
      
      const permissionResult = await Promise.race([permissionPromise, timeoutPromise]);
      if (permissionResult && !permissionTimedOut) {
        permissionStatus = permissionResult.status;
      }
    } catch (err) {
      console.log('[ActiveJob] Permission check failed:', err);
    }

    try {
      if (permissionStatus !== 'granted' || permissionTimedOut) {
        if (isMountedRef.current) {
          setLocationPermissionDenied(!permissionTimedOut);
          setIsTrackingEnabled(false);
        }
        return;
      }

      if (isMountedRef.current) {
        setLocationPermissionDenied(false);
        setIsTrackingEnabled(true);
      }

      // FREEZE PREVENTION: Wrap location fetch in timeout (always resolves)
      const location = await safeTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATION_TIMEOUT_MS,
        null as any
      );
      if (location && isMountedRef.current) {
        setCurrentLocation(location);
        updateDriverLocation(location.coords.latitude, location.coords.longitude).catch(() => {});
      }

      // ── Foreground watcher (high accuracy, works when app is visible) ──
      try {
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000,
            distanceInterval: 50,
          },
          async (newLocation) => {
            const job = activeJobRef.current;
            if (job && job.status !== 'delivered' && isMountedRef.current) {
              setCurrentLocation(newLocation);
              updateDriverLocation(newLocation.coords.latitude, newLocation.coords.longitude).catch(() => {});
            }
          }
        );
      } catch (watchErr) {
        console.log('[ActiveJob] Could not start foreground watcher:', watchErr);
      }

      // ── Background tracking (continues when app is minimised / screen locked) ──
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const currentDriverId = driverIdRef.current;

        if (token && currentDriverId) {
          // Save context for the background task process
          await saveDriverContextForBg(token, currentDriverId, String(currentJob.id), true);

          // Request background permission (shows system dialog if not yet granted)
          const bgGranted = await requestBackgroundPermission();
          if (bgGranted) {
            await startBackgroundLocationTracking();
          } else {
            console.log('[ActiveJob] Background permission not granted — foreground only');
          }
        }
      } catch (bgErr) {
        console.log('[ActiveJob] Background tracking setup failed (non-blocking):', bgErr);
      }
    } catch (error) {
      console.warn('[ActiveJob] Error starting location tracking (recovered):', error);
      if (isMountedRef.current) setIsTrackingEnabled(false);
    }
  }, [user, updateDriverLocation]);

  const stopLocationTracking = async () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    // Stop background tracking and clear stored context
    await stopBackgroundLocationTracking().catch(() => {});
    await clearDriverContextForBg().catch(() => {});
  };

  useEffect(() => {
    fetchActiveJob();
  }, [fetchActiveJob]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveJob();
    }, [fetchActiveJob])
  );

  // Location tracking is now opt-in - user must tap "Enable Tracking" button
  // This complies with Apple App Store Guidelines 5.1.1 and 5.1.5
  useEffect(() => {
    return () => {
      stopLocationTracking();
    };
  }, [activeJob?.id]);

  const handleNavigate = (type: 'pickup' | 'delivery') => {
    if (!activeJob) return;
    
    const address = type === 'pickup' 
      ? (activeJob.pickup_address || activeJob.pickup_postcode || '')
      : (activeJob.dropoff_address || activeJob.delivery_address || activeJob.delivery_postcode || '');
    
    const lat = type === 'pickup' 
      ? ((activeJob as any).pickup_latitude ?? (activeJob as any).pickup_lat)
      : ((activeJob as any).delivery_latitude ?? (activeJob as any).dropoff_lat ?? (activeJob as any).delivery_lat);
    
    const lng = type === 'pickup' 
      ? ((activeJob as any).pickup_longitude ?? (activeJob as any).pickup_lng)
      : ((activeJob as any).delivery_longitude ?? (activeJob as any).dropoff_lng ?? (activeJob as any).delivery_lng);
    
    if (lat && lng && typeof lat === 'number' && typeof lng === 'number') {
      setNavDestination({ lat, lng, address, type });
      setShowNavModal(true);
    } else {
      Alert.alert(
        'Location Not Available',
        'GPS coordinates are not available for this address. Please check the address details.',
        [{ text: 'OK' }]
      );
    }
  };

  const openExternalNavigation = async (app: 'google' | 'waze' | 'apple' | 'inapp') => {
    if (!navDestination) return;
    
    const { lat, lng, address, type } = navDestination;
    setShowNavModal(false);

    if (app === 'inapp') {
      navigation.navigate('InAppNavigation', {
        destinationLat: lat,
        destinationLng: lng,
        destinationAddress: address,
        destinationType: type,
        jobId: activeJob?.id,
      });
      return;
    }

    try {
      let url = '';
      let fallbackUrl = '';

      if (Platform.OS === 'ios') {
        switch (app) {
          case 'google':
            url = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
            fallbackUrl = `maps://?daddr=${lat},${lng}&dirflg=d`;
            break;
          case 'waze':
            url = `waze://?ll=${lat},${lng}&navigate=yes`;
            fallbackUrl = `maps://?daddr=${lat},${lng}&dirflg=d`;
            break;
          case 'apple':
            url = `maps://?daddr=${lat},${lng}&dirflg=d`;
            break;
        }
      } else {
        switch (app) {
          case 'google':
            url = `google.navigation:q=${lat},${lng}&mode=d`;
            fallbackUrl = `geo:${lat},${lng}?q=${lat},${lng}`;
            break;
          case 'waze':
            url = `waze://?ll=${lat},${lng}&navigate=yes`;
            fallbackUrl = `geo:${lat},${lng}?q=${lat},${lng}`;
            break;
          case 'apple':
            url = `geo:${lat},${lng}?q=${lat},${lng}`;
            break;
        }
      }

      const canOpen = await Linking.canOpenURL(url);
      
      if (canOpen) {
        await Linking.openURL(url);
      } else if (fallbackUrl) {
        const canOpenFallback = await Linking.canOpenURL(fallbackUrl);
        if (canOpenFallback) {
          await Linking.openURL(fallbackUrl);
          if (app !== 'apple') {
            Alert.alert(
              'App Not Installed',
              `${app === 'google' ? 'Google Maps' : 'Waze'} is not installed. Opening Apple Maps instead.`
            );
          }
        } else {
          Alert.alert('Navigation Error', 'Unable to open navigation app. Please try another option.');
        }
      } else {
        Alert.alert('Navigation Error', 'This navigation option is not available on your device.');
      }
    } catch (error) {
      console.error('Navigation error:', error);
      Alert.alert('Navigation Error', 'Failed to open navigation. Please try again.');
    }
  };

  const completeDeliveryUpdate = async (updateData: any) => {
    if (!activeJob) return;
    
    try {
      const { error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', activeJob.id);

      if (error) throw error;

      // Sync delivered status and POD data to customer booking
      await syncToCustomerBooking(activeJob.id, 'delivered', {
        delivered_at: updateData.delivered_at,
        pod_notes: updateData.pod_notes,
        pod_photo_url: updateData.pod_photo_url,
        pod_photos: updateData.pod_photos,
        pod_signature_url: updateData.pod_signature_url,
        recipient_name: updateData.recipient_name,
      });

      const podPhotoUrls = updateData.pod_photos || [];
      const emailData: PODEmailData = {
        jobId: String(activeJob.id),
        customerName: activeJob.customer_name || 'Customer',
        customerEmail: activeJob.customer_email || '',
        recipientName: recipientName,
        pickupAddress: activeJob.pickup_address || activeJob.pickup_postcode || '',
        deliveryAddress: activeJob.dropoff_address || activeJob.delivery_address || activeJob.delivery_postcode || '',
        deliveredAt: updateData.delivered_at,
        driverName: driver?.full_name || driver?.name || 'Driver',
        trackingNumber: activeJob.tracking_number || '',
        podNotes: podNotes || undefined,
        podPhotoUrls: podPhotoUrls,
        signatureUrl: updateData.pod_signature_url || undefined,
      };
      
      sendPODEmail(emailData)
        .then(result => {
          if (!result.success) {
            console.warn('POD email failed to send:', result.error);
          }
        })
        .catch(err => {
          console.warn('POD email error:', err);
        });

      setShowPODModal(false);
      setPodNotes('');
      setPodPhotos([]);
      setRecipientName('');
      setHasSignature(false);
      signatureRef.current?.clear();
      Alert.alert('Success', 'Delivery completed successfully!');
      fetchActiveJob();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to complete delivery');
    } finally {
      setUpdating(false);
    }
  };

  // Map job status to customer booking status
  const mapJobStatusToBookingStatus = (jobStatus: JobStatus): string => {
    const statusMap: Record<string, string> = {
      'accepted': 'assigned',
      'arrived_pickup': 'assigned',
      'picked_up': 'picked_up',
      'on_the_way': 'in_transit',
      'delivered': 'delivered',
    };
    return statusMap[jobStatus] || jobStatus;
  };

  // Sync job status change to customer_bookings table
  const syncToCustomerBooking = async (jobId: string | number, jobStatus: JobStatus, podData?: any) => {
    try {
      // Find customer booking linked to this job
      const { data: booking, error: findError } = await supabase
        .from('customer_bookings')
        .select('id')
        .eq('driver_job_id', String(jobId))
        .single();

      if (findError || !booking) {
        console.log('No linked customer booking found for job:', jobId);
        return;
      }

      const bookingUpdate: any = {
        status: mapJobStatusToBookingStatus(jobStatus),
        updated_at: new Date().toISOString(),
      };

      // If delivered, sync POD data
      if (jobStatus === 'delivered' && podData) {
        bookingUpdate.delivered_at = podData.delivered_at;
        bookingUpdate.pod_notes = podData.pod_notes;
        bookingUpdate.pod_photo_url = podData.pod_photo_url;
        bookingUpdate.pod_photos = podData.pod_photos;
        bookingUpdate.pod_signature_url = podData.pod_signature_url;
        bookingUpdate.recipient_name = podData.recipient_name;
      }

      const { error: updateError } = await supabase
        .from('customer_bookings')
        .update(bookingUpdate)
        .eq('id', booking.id);

      if (updateError) {
        console.error('Failed to sync booking status:', updateError);
      } else {
        console.log('Customer booking synced:', booking.id, '→', bookingUpdate.status);
      }
    } catch (error) {
      console.error('Error syncing to customer booking:', error);
    }
  };

  const updateJobStatus = async (newStatus: JobStatus) => {
    if (!activeJob) return;
    
    setUpdating(true);
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'delivered') {
        if (podPhotos.length === 0) {
          Alert.alert('Photo Required', 'Please take at least one photo as proof of delivery.');
          setUpdating(false);
          return;
        }

        setUploadingPhotos(true);
        
        // Upload POD directly to Supabase Storage
        const uploadResult = await uploadPODToSupabase();
        
        setUploadingPhotos(false);
        
        if (!uploadResult.success) {
          const errorMessage = uploadResult.error || 'Failed to upload photos. Please try again.';
          console.error('[POD] Upload failed with error:', errorMessage);
          Alert.alert('Upload Error', errorMessage);
          setUpdating(false);
          return;
        }
        
        // Update job status to 'delivered' in the jobs table (only status columns)
        const deliveredAt = new Date().toISOString();
        const { error: jobUpdateError } = await supabase
          .from('jobs')
          .update({
            status: 'delivered',
            delivered_at: deliveredAt,
            updated_at: deliveredAt,
          })
          .eq('id', activeJob.id);

        if (jobUpdateError) {
          console.error('[POD] Failed to update job status:', jobUpdateError);
          Alert.alert('Error', 'Failed to complete delivery. Please try again.');
          setUpdating(false);
          return;
        }

        // Sync POD data to customer_bookings for website
        await syncToCustomerBooking(activeJob.id, 'delivered', {
          delivered_at: deliveredAt,
          pod_notes: podNotes.trim() || null,
          pod_photo_url: uploadResult.photos[0] || null,
          pod_photos: uploadResult.photos,
          pod_signature_url: uploadResult.signature || null,
          recipient_name: recipientName.trim() || null,
        });
        
        stopLocationTracking();
        setActiveJob(null);
        setShowPODModal(false);
        setPodPhotos([]);
        setPodNotes('');
        setRecipientName('');
        setHasSignature(false);
        signatureRef.current?.clear();
        
        Alert.alert('Success', 'Delivery completed successfully!');
        fetchActiveJob();
        setUpdating(false);
        return;
      }

      const { error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', activeJob.id);

      if (error) throw error;

      // Waiting time: save arrived time when arriving at pickup, clear when leaving
      if (newStatus === 'arrived_pickup') {
        const arrivedTime = Date.now();
        setArrivedPickupTime(arrivedTime);
        setWaitingTimerSeconds(0);
        setWaitingTimeLogged(false);
        AsyncStorage.setItem(`arrivedPickupTime_${activeJob.id}`, String(arrivedTime)).catch(() => {});
      } else if (newStatus === 'picked_up' || newStatus === 'on_the_way') {
        setArrivedPickupTime(null);
        setWaitingTimerSeconds(0);
        AsyncStorage.removeItem(`arrivedPickupTime_${activeJob.id}`).catch(() => {});
      }
      
      // Sync status to customer booking for real-time tracking
      await syncToCustomerBooking(activeJob.id, newStatus);
      
      fetchActiveJob();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update job status');
    } finally {
      setUpdating(false);
    }
  };

  const takePODPhoto = async () => {
    if (podPhotos.length >= MAX_POD_PHOTOS) {
      Alert.alert('Photo Limit Reached', `Maximum of ${MAX_POD_PHOTOS} photos allowed per delivery.`);
      return;
    }

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow camera access to take proof of delivery photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPodPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const pickPODPhotos = async () => {
    if (podPhotos.length >= MAX_POD_PHOTOS) {
      Alert.alert('Photo Limit Reached', `Maximum of ${MAX_POD_PHOTOS} photos allowed per delivery.`);
      return;
    }

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photos.');
      return;
    }

    const remainingSlots = MAX_POD_PHOTOS - podPhotos.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newPhotos = result.assets.slice(0, remainingSlots).map(asset => asset.uri);
      setPodPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      'Add Proof of Delivery Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: takePODPhoto },
        { text: 'Choose from Library', onPress: pickPODPhotos },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const removePhoto = (index: number) => {
    setPodPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Compress image to max 1280px width with JPEG quality 0.6
  const compressImage = async (uri: string): Promise<string> => {
    try {
      console.log('[POD] Compressing image:', uri.substring(0, 50) + '...');
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      );
      console.log('[POD] Compressed image URI:', result.uri.substring(0, 50) + '...');
      return result.uri;
    } catch (error: any) {
      console.error('[POD] Compression failed, using original:', error.message);
      return uri;
    }
  };

  // Upload a single file to Supabase Storage using direct upload
  const uploadFileToSupabase = async (
    uri: string,
    bucket: string,
    filePath: string,
    contentType: string
  ): Promise<{ success: boolean; url?: string; error?: string }> => {
    try {
      console.log(`[POD UPLOAD] Uploading to ${bucket}/${filePath}`);
      console.log(`[POD UPLOAD] URI: ${uri?.substring(0, 100) || 'undefined'}`);
      
      // Validate URI first
      if (!uri || typeof uri !== 'string') {
        console.error('[POD UPLOAD] Invalid URI provided:', uri);
        return { success: false, error: 'Invalid file URI' };
      }
      
      // Use expo-file-system with pure JS base64 decoder - Hermes compatible
      // Import safely to prevent "Cannot read property 'Base64' of undefined"
      let FileSystem: any;
      try {
        FileSystem = require('expo-file-system');
      } catch (importError) {
        console.error('[POD UPLOAD] Failed to import expo-file-system:', importError);
        return { success: false, error: 'File system not available' };
      }
      
      // Validate FileSystem is properly loaded
      if (!FileSystem || !FileSystem.EncodingType || !FileSystem.EncodingType.Base64) {
        console.error('[POD UPLOAD] expo-file-system not properly loaded');
        return { success: false, error: 'File system module not available. Please restart the app.' };
      }
      
      // Check if file exists first
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        console.error('[POD UPLOAD] File does not exist:', uri);
        return { success: false, error: 'File not found' };
      }
      console.log(`[POD UPLOAD] File exists, size: ${fileInfo.size} bytes`);
      
      const base64 = await FileSystem.readAsStringAsync(uri, { 
        encoding: FileSystem.EncodingType.Base64 
      });
      
      // Validate base64 result
      if (!base64 || typeof base64 !== 'string' || base64.length === 0) {
        console.error('[POD UPLOAD] Failed to read file as base64');
        return { success: false, error: 'Failed to read file' };
      }
      console.log(`[POD UPLOAD] Base64 length: ${base64.length}`);
      
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
      
      const arrayBuffer = base64ToArrayBuffer(base64);

      // Upload using Supabase SDK
      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, arrayBuffer, {
          contentType,
          upsert: true
        });

      if (uploadError) {
        console.error(`[POD UPLOAD] Upload error for ${filePath}:`, JSON.stringify(uploadError));
        return { 
          success: false, 
          error: uploadError.message || 'Upload failed'
        };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      console.log(`[POD UPLOAD] Successfully uploaded: ${urlData.publicUrl}`);
      return { success: true, url: urlData.publicUrl };
    } catch (error: any) {
      console.error(`[POD UPLOAD] Exception during upload:`, error);
      return { 
        success: false, 
        error: error.message || 'Network error during upload'
      };
    }
  };

  // Upload POD to Supabase Storage - uses 'pod' bucket with proper path format
  const uploadPODToSupabase = async (): Promise<{ success: boolean; photos: string[]; signature?: string; error?: string }> => {
    if (!activeJob || !driverId) {
      return { success: false, photos: [], error: 'No active job or driver ID' };
    }

    const jobId = String(activeJob.id);
    const uploadedPhotoUrls: string[] = [];
    let signatureUrl: string | undefined;
    const uploadErrors: string[] = [];

    try {
      console.log('[POD UPLOAD] ========== Starting POD Upload ==========');
      console.log('[POD UPLOAD] Job ID:', jobId);
      console.log('[POD UPLOAD] Driver ID:', driverId);
      console.log('[POD UPLOAD] Photos to upload:', podPhotos.length);
      console.log('[POD UPLOAD] Has signature:', hasSignature);

      // Upload ALL photos - must all succeed
      if (podPhotos.length > 0) {
        console.log('[POD UPLOAD] Compressing and uploading photos...');
        
        // Compress all photos first
        const compressedPhotos: string[] = [];
        for (const photoUri of podPhotos) {
          const compressed = await compressImage(photoUri);
          compressedPhotos.push(compressed);
        }

        // Upload all photos in parallel using Promise.all
        const photoUploadPromises = compressedPhotos.map(async (photoUri, index) => {
          const uuid = generateUUID();
          const filePath = `pod/${jobId}/${uuid}.jpg`;
          
          console.log(`[POD UPLOAD] Uploading photo ${index + 1}/${compressedPhotos.length}: ${filePath}`);
          
          const result = await uploadFileToSupabase(photoUri, 'pod', filePath, 'image/jpeg');
          
          if (!result.success) {
            throw new Error(result.error || `Photo ${index + 1} upload failed`);
          }
          
          return result.url!;
        });

        try {
          // Wait for ALL photos to upload successfully
          const urls = await Promise.all(photoUploadPromises);
          uploadedPhotoUrls.push(...urls);
          console.log(`[POD UPLOAD] All ${urls.length} photos uploaded successfully`);
        } catch (photoError: any) {
          console.error('[POD UPLOAD] Photo upload failed:', photoError.message);
          uploadErrors.push(photoError.message);
          // Do NOT continue - abort the entire upload process
          return { 
            success: false, 
            photos: [], 
            error: `Photo upload failed: ${photoError.message}` 
          };
        }
      }

      // Upload signature if exists
      if (hasSignature && signatureRef.current) {
        console.log('[POD UPLOAD] Getting signature data...');
        const signatureData = await signatureRef.current.getSignatureData();
        
        if (signatureData && (signatureData.startsWith('file://') || signatureData.startsWith('content://'))) {
          const uuid = generateUUID();
          const sigFilePath = `pod/${jobId}/signature_${uuid}.png`;

          console.log('[POD UPLOAD] Uploading signature:', sigFilePath);

          const sigResult = await uploadFileToSupabase(signatureData, 'pod', sigFilePath, 'image/png');
          
          if (!sigResult.success) {
            console.error('[POD UPLOAD] Signature upload failed:', sigResult.error);
            return { 
              success: false, 
              photos: uploadedPhotoUrls, 
              error: `Signature upload failed: ${sigResult.error}` 
            };
          }
          
          signatureUrl = sigResult.url;
          console.log('[POD UPLOAD] Signature uploaded:', signatureUrl);
        }
      }

      // All uploads successful - return the URLs (job update handled by caller)
      console.log('[POD UPLOAD] ========== POD Upload Complete ==========');
      console.log('[POD UPLOAD] Photos uploaded:', uploadedPhotoUrls.length);
      console.log('[POD UPLOAD] Signature uploaded:', !!signatureUrl);
      
      return { success: true, photos: uploadedPhotoUrls, signature: signatureUrl };

    } catch (error: any) {
      console.error('[POD UPLOAD] Unexpected error:', error);
      console.error('[POD UPLOAD] Error details:', JSON.stringify(error));
      return { 
        success: false, 
        photos: uploadedPhotoUrls, 
        signature: signatureUrl,
        error: error.message || 'Unexpected error during upload' 
      };
    }
  };

  const openBarcodeScanner = async (type: 'pickup' | 'delivery') => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Barcode scanning requires the mobile app. Please use Expo Go to scan barcodes.');
      return;
    }
    
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          'Camera Access Needed',
          'Camera access is required to scan barcodes. Please grant camera permission when prompted.'
        );
        return;
      }
    }
    
    setScanType(type);
    setScanned(false);
    setCameraReady(false);
    lastScanTime.current = 0;
    lastScannedCode.current = '';
    setScanSessionId(Date.now());
    setShowBarcodeScanner(true);
  };

  const closeBarcodeScanner = useCallback(() => {
    setShowBarcodeScanner(false);
    setScanned(false);
    setCameraReady(false);
    lastScannedCode.current = '';
    lastScanTime.current = 0;
  }, []);

  const handleCameraReady = useCallback(() => {
    console.log('[BARCODE] Camera ready for barcode scanning');
    console.log('[BARCODE] Platform:', Platform.OS);
    console.log('[BARCODE] Camera permission granted:', cameraPermission?.granted);
    setCameraReady(true);
  }, [cameraPermission?.granted]);

  const handleBarcodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    console.log('[BARCODE] onBarcodeScanned triggered');
    console.log('[BARCODE] Result:', JSON.stringify(result));
    
    if (scanned) {
      console.log('[BARCODE] Already scanned, ignoring');
      return;
    }
    
    const barcodeData = result.data;
    console.log('[BARCODE] Barcode data:', barcodeData, 'type:', result.type);
    
    if (!barcodeData || barcodeData.length < 3) {
      console.log('[BARCODE] Barcode too short, ignoring');
      return;
    }
    
    if (barcodeData === lastScannedCode.current) {
      console.log('[BARCODE] Duplicate scan, ignoring');
      return;
    }
    
    console.log('[BARCODE] Valid barcode detected:', result.type, barcodeData);
    lastScannedCode.current = barcodeData;
    setScanned(true);
    
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log('[BARCODE] Haptics failed:', e);
    }

    // Save / verify the barcode using the dedicated API endpoint.
    // This is the CUSTOMER'S parcel barcode — NOT the Run Courier tracking number.
    // Pickup: stores the barcode found on the parcel.
    // Delivery: verifies that the scanned barcode matches the one saved at pickup.
    if (!activeJob) {
      setShowBarcodeScanner(false);
      setCameraReady(false);
      return;
    }

    const currentScanType = scanType;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No session token');
      }

      console.log(`[BARCODE] Sending ${currentScanType} barcode to backend: "${barcodeData}"`);
      const response = await fetch(
        `/api/mobile/v1/driver/jobs/${activeJob.id}/barcode`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ type: currentScanType, barcode: barcodeData }),
        }
      );

      const responseData = await response.json();
      console.log('[BARCODE] Backend response:', response.status, JSON.stringify(responseData));

      setShowBarcodeScanner(false);
      setCameraReady(false);

      if (!response.ok) {
        if (response.status === 422 && responseData.code === 'BARCODE_MISMATCH') {
          // Delivery scan doesn't match pickup barcode
          Alert.alert(
            'Wrong Parcel',
            'This barcode does not match the one scanned at pickup. Please ensure you have the correct parcel.'
          );
        } else if (response.status === 400 && responseData.code === 'NO_PICKUP_BARCODE') {
          Alert.alert(
            'Scan at Pickup First',
            'No barcode was recorded at pickup. Please scan the barcode when you collect the parcel.'
          );
        } else {
          Alert.alert('Barcode Error', responseData.error || 'Failed to process barcode. Please try again.');
        }
        return;
      }

      // Success — update local state so UI reflects the scan immediately
      if (currentScanType === 'pickup') {
        setPickupBarcode(barcodeData);
        Alert.alert(
          'Pickup Barcode Saved',
          `Barcode recorded: ${barcodeData}\n\nScan the same barcode at delivery to verify the correct parcel.`
        );
      } else {
        setDeliveryBarcode(barcodeData);
        Alert.alert(
          'Delivery Barcode Verified',
          `Barcode matched. You have the correct parcel.`
        );
      }

    } catch (error: any) {
      console.error('[BARCODE] Error:', error.message);
      setShowBarcodeScanner(false);
      setCameraReady(false);
      Alert.alert('Network Error', 'Unable to process barcode. Please check your connection and try again.');
    }
  }, [scanned, scanType, activeJob]);

  const formatWaitingTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const submitWaitingTime = async () => {
    if (!activeJob) return;
    const minutes = parseInt(waitingMinutesInput, 10);
    if (isNaN(minutes) || minutes < 10 || minutes > 50) {
      Alert.alert('Invalid Time', 'Please enter a waiting time between 10 and 50 minutes.');
      return;
    }
    setSubmittingWaitingTime(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/mobile/v1/driver/jobs/${activeJob.id}/waiting-time`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ minutes }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to log waiting time');
      const chargeableMinutes = Math.max(0, minutes - 10);
      const charge = chargeableMinutes * 0.20;
      setShowWaitingTimeModal(false);
      setWaitingTimeLogged(true);
      Alert.alert(
        'Waiting Time Saved',
        charge > 0
          ? `${minutes} minutes recorded.\n£${charge.toFixed(2)} added to your earnings.`
          : `${minutes} minutes recorded.\nNo charge (within free period).`
      );
      fetchActiveJob();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to log waiting time. Please try again.');
    } finally {
      setSubmittingWaitingTime(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!activeJob) return;
    const status = activeJob.status as JobStatus;
    
    switch (status) {
      case 'accepted':
        handleNavigate('pickup');
        updateJobStatus('arrived_pickup');
        break;
      case 'arrived_pickup':
        updateJobStatus('picked_up');
        break;
      case 'picked_up':
        handleNavigate('delivery');
        updateJobStatus('on_the_way');
        break;
      case 'on_the_way':
        // For multi-drop jobs the server may have already auto-completed this job
        // when the last stop was saved. Check the real DB status before opening the
        // POD modal — if it's already 'delivered' just refresh the UI.
        try {
          const { data: dbJob } = await supabase
            .from('driver_jobs_view')
            .select('status')
            .eq('id', activeJob.id)
            .single();
          if (dbJob?.status === 'delivered') {
            // Job was auto-completed server-side — clear stale state and show done UI
            await fetchActiveJob();
            return;
          }
        } catch {
          // Network error — fall through and open the modal anyway
        }
        setShowPODModal(true);
        break;
    }
  };

  const handleCompletePOD = async () => {
    if (podPhotos.length === 0) {
      Alert.alert('Photo Required', 'Please take at least one photo as proof of delivery.');
      return;
    }
    
    Alert.alert(
      'Complete Delivery',
      'Are you sure you want to mark this delivery as complete?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Complete', 
          onPress: () => updateJobStatus('delivered'),
        },
      ]
    );
  };

  const handleFailedDelivery = async () => {
    if (!failureReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for the failed delivery.');
      return;
    }

    if (!activeJob) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          failure_reason: failureReason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeJob.id);

      if (error) throw error;

      stopLocationTracking();
      setShowFailedModal(false);
      setFailureReason('');
      setActiveJob(null);
      Alert.alert('Delivery Failed', 'The delivery has been marked as failed.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update delivery status');
    } finally {
      setUpdating(false);
    }
  };

  const handleQuickFailedDelivery = useCallback(async (reason: string) => {
    if (!activeJob) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          failure_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeJob.id);

      if (error) throw error;
      stopLocationTracking();
      setActiveJob(null);
      Alert.alert('Delivery Failed', 'The delivery has been marked as failed.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update delivery status');
    } finally {
      setUpdating(false);
    }
  }, [activeJob, stopLocationTracking]);

  const showFailedDeliveryOptions = () => {
    console.log('Failed Delivery button pressed, job status:', activeJob?.status);
    
    const reasons = [
      'Customer not available',
      'Wrong address',
      'Customer refused delivery',
      'Access denied to building',
      'Package damaged',
      'Other reason',
    ];

    Alert.alert(
      'Failed Delivery',
      'Select a reason:',
      [
        ...reasons.map(reason => ({
          text: reason,
          style: 'destructive' as const,
          onPress: () => {
            if (reason === 'Other reason') {
              setTimeout(() => setShowFailedModal(true), 100);
            } else {
              handleQuickFailedDelivery(reason);
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const getButtonText = () => {
    if (!activeJob) return 'Continue';
    const status = activeJob.status as JobStatus;
    
    switch (status) {
      case 'accepted':
        return 'Navigate to Pickup';
      case 'arrived_pickup':
        return 'Confirm Picked Up';
      case 'picked_up':
        return 'Navigate to Delivery';
      case 'on_the_way':
        return 'Complete Delivery';
      default:
        return 'Continue';
    }
  };

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'accepted':
        return theme.warning;
      case 'arrived_pickup':
      case 'picked_up':
        return theme.primary;
      case 'on_the_way':
      case 'delivered':
        return theme.success;
      default:
        return theme.warning;
    }
  };

  const getCurrentStepIndex = () => {
    if (!activeJob) return 0;
    return STATUS_STEPS.indexOf(activeJob.status as JobStatus);
  };

  // FREEZE PREVENTION: Safety timeout to force loading=false after 5 seconds
  // This ensures the UI never stays stuck on the loading spinner
  useEffect(() => {
    if (loading) {
      const safetyTimer = setTimeout(() => {
        console.warn('[ActiveJob] Safety timeout triggered - forcing loading=false');
        setLoading(false);
      }, 5000);
      return () => clearTimeout(safetyTimer);
    }
  }, [loading]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText style={[styles.emptyText, { color: theme.secondaryText, marginTop: Spacing.md }]}>
            Loading...
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!activeJob) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.emptyState}>
          <Feather name="truck" size={48} color={theme.secondaryText} />
          <ThemedText style={[styles.emptyText, { color: theme.secondaryText }]}>
            No active job
          </ThemedText>
          <ThemedText style={[styles.emptySubtext, { color: theme.secondaryText }]}>
            Accept a job from the Jobs tab to start delivering
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // Compute contact info for phone section
  const isPickupPhase = ['accepted', 'arrived_pickup'].includes(activeJob.status);
  const contactPhoneNumber = isPickupPhase 
    ? (activeJob.sender_phone || activeJob.customer_phone) 
    : (activeJob.recipient_phone || activeJob.customer_phone);
  const contactLabel = isPickupPhase ? 'Sender' : 'Recipient';
  const contactName = isPickupPhase 
    ? (activeJob.sender_name || activeJob.customer_name) 
    : (activeJob.recipient_name || activeJob.customer_name);

  const handleCallContact = () => {
    if (!contactPhoneNumber) return;
    Alert.alert(
      'Call ' + contactLabel,
      `Do you want to call ${contactPhoneNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Call', 
          onPress: async () => {
            try {
              await Linking.openURL(`tel:${contactPhoneNumber}`);
            } catch (error) {
              console.error('Error opening phone:', error);
            }
          }
        },
      ]
    );
  };

  return (
    <>
      <ScreenScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} hasTabBar={true}>
        <View style={styles.content}>
          <View style={styles.progressContainer}>
            {STATUS_STEPS.slice(0, -1).map((step, index) => {
              const isCompleted = index < getCurrentStepIndex();
              const isCurrent = index === getCurrentStepIndex();
              return (
                <View key={step} style={styles.progressStep}>
                  <View 
                    style={[
                      styles.progressDot,
                      { 
                        backgroundColor: isCompleted || isCurrent ? getStatusColor(step) : theme.backgroundSecondary,
                        borderColor: isCompleted || isCurrent ? getStatusColor(step) : theme.secondaryText,
                      }
                    ]}
                  >
                    {isCompleted ? (
                      <Feather name="check" size={12} color="#fff" />
                    ) : null}
                  </View>
                  <ThemedText 
                    style={[
                      styles.progressLabel, 
                      { 
                        color: isCompleted || isCurrent ? theme.text : theme.secondaryText,
                        fontWeight: isCurrent ? '600' : '400',
                      }
                    ]}
                  >
                    {STATUS_LABELS[step]}
                  </ThemedText>
                  {index < STATUS_STEPS.length - 2 ? (
                    <View 
                      style={[
                        styles.progressLine,
                        { backgroundColor: isCompleted ? theme.success : theme.backgroundSecondary }
                      ]} 
                    />
                  ) : null}
                </View>
              );
            })}
          </View>

          {isTrackingEnabled && currentLocation ? (
            <View style={[styles.locationBanner, { backgroundColor: theme.primary + '20' }]}>
              <Feather name="navigation" size={16} color={theme.primary} />
              <ThemedText style={[styles.locationText, { color: theme.primary }]}>
                GPS tracking active
              </ThemedText>
            </View>
          ) : !isTrackingEnabled ? (
            <Pressable 
              style={[styles.locationBanner, { backgroundColor: locationPermissionDenied ? theme.warning + '20' : theme.backgroundSecondary }]}
              onPress={startLocationTracking}
            >
              <Feather 
                name={locationPermissionDenied ? "alert-circle" : "navigation"} 
                size={16} 
                color={locationPermissionDenied ? theme.warning : theme.secondaryText} 
              />
              <ThemedText style={[styles.locationText, { color: locationPermissionDenied ? theme.warning : theme.secondaryText }]}>
                {locationPermissionDenied 
                  ? "Location access improves accuracy. You can enable it in Settings."
                  : "Tap to enable GPS tracking"}
              </ThemedText>
              {locationPermissionDenied && Platform.OS !== 'web' ? (
                <Pressable 
                  onPress={async () => {
                    try {
                      await Linking.openSettings();
                    } catch (e) {}
                  }}
                  style={[styles.settingsButton, { backgroundColor: theme.warning + '30' }]}
                >
                  <ThemedText style={[styles.settingsButtonText, { color: theme.warning }]}>Settings</ThemedText>
                </Pressable>
              ) : null}
            </Pressable>
          ) : null}

          <DriverJobMap
            pickupAddress={activeJob.pickup_address || activeJob.pickup_postcode || ''}
            deliveryAddress={activeJob.dropoff_address || activeJob.delivery_address || activeJob.delivery_postcode || ''}
            pickupLat={(activeJob as any).pickup_latitude ?? activeJob.pickup_lat}
            pickupLng={(activeJob as any).pickup_longitude ?? activeJob.pickup_lng}
            dropoffLat={(activeJob as any).delivery_latitude ?? activeJob.dropoff_lat}
            dropoffLng={(activeJob as any).delivery_longitude ?? activeJob.dropoff_lng}
            driverLat={currentLocation?.coords.latitude}
            driverLng={currentLocation?.coords.longitude}
            trackingNumber={activeJob.tracking_number || ''}
            distanceMiles={activeJob.distance}
            onNavigatePress={handleNavigate}
            currentPhase={['accepted', 'arrived_pickup'].includes(activeJob.status) ? 'pickup' : 'delivery'}
          />

          <ThemedView style={styles.jobCard}>
            <View style={styles.header}>
              <ThemedText style={styles.jobId}>Job #{activeJob.job_number || activeJob.tracking_number || String(activeJob.id).slice(0, 8).toUpperCase()}</ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(activeJob.status as JobStatus) }]}>
                <ThemedText style={styles.statusText}>
                  {STATUS_LABELS[activeJob.status as JobStatus] || activeJob.status}
                </ThemedText>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.phoneSection}>
              <View style={styles.phoneLabelRow}>
                <Feather name="phone" size={16} color={theme.primary} />
                <ThemedText style={[styles.phoneLabel, { color: theme.secondaryText }]}>
                  Contact {contactLabel}
                </ThemedText>
              </View>
              {contactName ? (
                <ThemedText style={styles.phoneName}>{contactName}</ThemedText>
              ) : null}
              {contactPhoneNumber ? (
                <Pressable 
                  style={[styles.phoneNumberRow, { backgroundColor: theme.success + '15' }]}
                  onPress={handleCallContact}
                >
                  <ThemedText style={[styles.phoneNumber, { color: theme.text }]}>
                    {contactPhoneNumber}
                  </ThemedText>
                  <View style={[styles.callButton, { backgroundColor: theme.success }]}>
                    <Feather name="phone" size={18} color="#fff" />
                    <Text style={styles.callButtonText}>Call</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={[styles.phoneNumberRow, { backgroundColor: theme.backgroundSecondary }]}>
                  <ThemedText style={[styles.phoneNumber, { color: theme.secondaryText }]}>
                    No phone number available
                  </ThemedText>
                </View>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.routeInfo}>
              <Pressable 
                style={styles.locationRow}
                onPress={() => handleNavigate('pickup')}
              >
                <View style={[styles.locationIcon, { backgroundColor: theme.primary }]}>
                  <Feather name="map-pin" size={16} color="#fff" />
                </View>
                <View style={styles.locationDetails}>
                  <ThemedText style={[styles.locationLabel, { color: theme.secondaryText }]}>
                    Pickup
                  </ThemedText>
                  <ThemedText style={styles.locationValue}>{activeJob.pickup_address || activeJob.pickup_postcode || 'N/A'}</ThemedText>
                  {activeJob.pickup_address ? (
                    <ThemedText style={[styles.addressText, { color: theme.secondaryText }]}>
                      {activeJob.pickup_address}
                    </ThemedText>
                  ) : null}
                </View>
                <Feather name="navigation" size={20} color={theme.primary} />
              </Pressable>

              <Pressable 
                style={styles.locationRow}
                onPress={() => handleNavigate('delivery')}
              >
                <View style={[styles.locationIcon, { backgroundColor: theme.success }]}>
                  <Feather name="map-pin" size={16} color="#fff" />
                </View>
                <View style={styles.locationDetails}>
                  <ThemedText style={[styles.locationLabel, { color: theme.secondaryText }]}>
                    Delivery
                  </ThemedText>
                  <ThemedText style={styles.locationValue}>{activeJob.dropoff_address || activeJob.delivery_address || activeJob.delivery_postcode || 'N/A'}</ThemedText>
                  {activeJob.dropoff_address || activeJob.delivery_address ? (
                    <ThemedText style={[styles.addressText, { color: theme.secondaryText }]}>
                      {activeJob.dropoff_address || activeJob.delivery_address}
                    </ThemedText>
                  ) : null}
                </View>
                <Feather name="navigation" size={20} color={theme.success} />
              </Pressable>
            </View>

            <View style={styles.divider} />

            <View style={styles.barcodeSection}>
              <ThemedText style={styles.sectionTitle}>Parcel Barcodes</ThemedText>
              <View style={styles.barcodeRow}>
                <View style={styles.barcodeItem}>
                  <ThemedText style={[styles.barcodeLabel, { color: theme.secondaryText }]}>
                    Pickup
                  </ThemedText>
                  {pickupBarcode || (activeJob as any).pickup_barcode ? (
                    <View style={{ gap: 4 }}>
                      <View style={[styles.barcodeValue, { backgroundColor: theme.success + '20' }]}>
                        <Feather name="check-circle" size={14} color={theme.success} />
                        <ThemedText style={[styles.barcodeText, { color: theme.success }]} numberOfLines={1}>
                          {pickupBarcode || (activeJob as any).pickup_barcode}
                        </ThemedText>
                      </View>
                      <Pressable
                        style={[styles.scanButton, { backgroundColor: theme.secondaryText + '30' }]}
                        onPress={() => openBarcodeScanner('pickup')}
                      >
                        <Feather name="refresh-cw" size={12} color={theme.secondaryText} />
                        <Text style={[styles.scanButtonText, { color: theme.secondaryText }]}>Rescan</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.scanButton, { backgroundColor: theme.primary }]}
                      onPress={() => openBarcodeScanner('pickup')}
                    >
                      <Feather name="camera" size={16} color="#fff" />
                      <Text style={styles.scanButtonText}>Scan</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.barcodeItem}>
                  <ThemedText style={[styles.barcodeLabel, { color: theme.secondaryText }]}>
                    Delivery
                  </ThemedText>
                  {deliveryBarcode || (activeJob as any).delivery_barcode ? (
                    <View style={[styles.barcodeValue, { backgroundColor: theme.success + '20' }]}>
                      <Feather name="check-circle" size={14} color={theme.success} />
                      <ThemedText style={[styles.barcodeText, { color: theme.success }]} numberOfLines={1}>
                        {deliveryBarcode || (activeJob as any).delivery_barcode}
                      </ThemedText>
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.scanButton, { backgroundColor: theme.primary }]}
                      onPress={() => openBarcodeScanner('delivery')}
                    >
                      <Feather name="camera" size={16} color="#fff" />
                      <Text style={styles.scanButtonText}>Scan</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>
                  Distance
                </ThemedText>
                <ThemedText style={styles.detailValue}>{activeJob.distance} miles</ThemedText>
              </View>
              <View style={styles.detailItem}>
                <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>
                  Earnings
                </ThemedText>
                <ThemedText style={[styles.price, { color: theme.success }]}>
                  £{(activeJob.driver_price ?? 0).toFixed(2)}
                </ThemedText>
              </View>
            </View>

            {activeJob.customer_name || activeJob.customer_phone ? (
              <>
                <View style={styles.divider} />
                <View style={styles.customerInfo}>
                  <ThemedText style={styles.sectionTitle}>Customer</ThemedText>
                  {activeJob.customer_name ? (
                    <ThemedText style={styles.customerName}>{activeJob.customer_name}</ThemedText>
                  ) : null}
                  {activeJob.customer_phone ? (
                    <View style={styles.contactButtonsRow}>
                      <Pressable 
                        style={[styles.contactButton, { backgroundColor: theme.success }]}
                        onPress={async () => {
                          try {
                            await Linking.openURL(`tel:${activeJob.customer_phone}`);
                          } catch (error) {
                            console.error('Error opening phone:', error);
                          }
                        }}
                      >
                        <Feather name="phone" size={18} color="#fff" />
                        <Text style={styles.contactButtonText}>Call</Text>
                      </Pressable>
                      <Pressable 
                        style={[styles.contactButton, { backgroundColor: theme.primary }]}
                        onPress={async () => {
                          try {
                            const whatsappUrl = `whatsapp://send?phone=${activeJob.customer_phone?.replace(/[^0-9+]/g, '')}`;
                            const canOpenWhatsApp = await Linking.canOpenURL(whatsappUrl);
                            if (canOpenWhatsApp) {
                              await Linking.openURL(whatsappUrl);
                            } else {
                              await Linking.openURL(`sms:${activeJob.customer_phone}`);
                            }
                          } catch (error) {
                            console.error('Error opening messaging:', error);
                          }
                        }}
                      >
                        <Feather name="message-circle" size={18} color="#fff" />
                        <Text style={styles.contactButtonText}>Text</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            {activeJob.notes ? (
              <>
                <View style={styles.divider} />
                <View style={styles.notesSection}>
                  <ThemedText style={styles.sectionTitle}>Notes</ThemedText>
                  <ThemedText style={{ color: theme.secondaryText }}>{activeJob.notes}</ThemedText>
                </View>
              </>
            ) : null}
          </ThemedView>

          {/* Waiting Time Card — shown only when driver is at pickup */}
          {activeJob.status === 'arrived_pickup' ? (
            <ThemedView style={[styles.card, { marginTop: Spacing.sm, borderWidth: 1, borderColor: '#F59E0B' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs }}>
                <ThemedText style={[styles.sectionTitle, { color: '#F59E0B' }]}>Waiting Timer</ThemedText>
                {waitingTimeLogged ? (
                  <View style={{ backgroundColor: '#16A34A', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Logged</Text>
                  </View>
                ) : null}
              </View>

              {/* Big timer display */}
              <View style={{ alignItems: 'center', paddingVertical: Spacing.sm }}>
                <Text style={{ fontSize: 42, fontWeight: '700', color: waitingTimerSeconds >= 600 ? '#F59E0B' : theme.text, letterSpacing: 2 }}>
                  {formatWaitingTimer(waitingTimerSeconds)}
                </Text>
                <Text style={{ fontSize: 12, color: theme.secondaryText, marginTop: 4 }}>
                  {waitingTimerSeconds < 600
                    ? `Free period — ${formatWaitingTimer(600 - waitingTimerSeconds)} remaining`
                    : `Chargeable: ${Math.floor((waitingTimerSeconds - 600) / 60)} min × £0.20/min`}
                </Text>
              </View>

              <View style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 8, padding: Spacing.xs, marginBottom: Spacing.sm }}>
                <Text style={{ fontSize: 12, color: theme.secondaryText, textAlign: 'center' }}>
                  First 10 min free · £0.20/min after · Max 50 min
                </Text>
              </View>

              <Button
                title={waitingTimeLogged ? 'Update Waiting Time' : 'Log Waiting Time'}
                onPress={() => {
                  setWaitingMinutesInput('');
                  setShowWaitingTimeModal(true);
                }}
                variant="secondary"
                disabled={waitingTimerSeconds < 600}
                style={{ opacity: waitingTimerSeconds < 600 ? 0.5 : 1 }}
              />
              {waitingTimerSeconds < 600 ? (
                <Text style={{ fontSize: 11, color: theme.secondaryText, textAlign: 'center', marginTop: 6 }}>
                  Available after 10-minute free period
                </Text>
              ) : null}
            </ThemedView>
          ) : null}

          <View style={styles.actionButtonsRow}>
            <Button 
              title={updating ? 'Updating...' : getButtonText()}
              onPress={handleStatusUpdate}
              disabled={updating}
              style={styles.actionButtonMain}
            />
          </View>
          
          {activeJob.status !== 'accepted' && activeJob.status !== 'arrived_pickup' ? (
            <Pressable 
              onPress={showFailedDeliveryOptions}
              disabled={updating}
              style={[styles.failedDeliveryButton, { borderColor: theme.error }]}
            >
              <Feather name="x-circle" size={16} color={theme.error} />
              <Text style={[styles.failedDeliveryText, { color: theme.error }]}>
                Failed Delivery
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScreenScrollView>

      <Modal
        visible={showPODModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPODModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.backgroundDefault }}>
          <ThemedView style={styles.podModalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Proof of Delivery</ThemedText>
              <Pressable 
                onPress={() => {
                  setShowPODModal(false);
                  setTimeout(() => {
                    setPodNotes('');
                    setPodPhotos([]);
                    setRecipientName('');
                    setHasSignature(false);
                    if (signatureRef.current) {
                      signatureRef.current.clear();
                    }
                  }, 300);
                }}
                style={styles.closeButton}
              >
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            
            {Platform.OS === 'web' ? (
            <ScrollView 
              style={styles.podScrollContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.podScrollContentContainer}
            >
              <View style={styles.podSection}>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionLabel}>
                    Photos <Text style={{ color: theme.error }}>*</Text>
                  </ThemedText>
                  <ThemedText style={[styles.photoCount, { color: podPhotos.length >= MAX_POD_PHOTOS ? theme.error : theme.secondaryText }]}>
                    {podPhotos.length}/{MAX_POD_PHOTOS} photos
                  </ThemedText>
                </View>
                
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.photosScroll}
                  contentContainerStyle={styles.photosScrollContent}
                >
                  <Pressable
                    onPress={showPhotoOptions}
                    style={[styles.addPhotoButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.primary }]}
                  >
                    <Feather name="plus" size={32} color={theme.primary} />
                    <ThemedText style={[styles.addPhotoText, { color: theme.primary }]}>
                      Add Photo
                    </ThemedText>
                  </Pressable>
                  
                  {podPhotos.map((photo, index) => (
                    <View key={index} style={styles.photoWrapper}>
                      <Image 
                        source={{ uri: photo }} 
                        style={styles.podThumbnail}
                        contentFit="cover"
                      />
                      <Pressable
                        onPress={() => removePhoto(index)}
                        style={[styles.removePhotoButton, { backgroundColor: theme.error }]}
                      >
                        <Feather name="x" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.podSection}>
                <ThemedText style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                  Recipient Name (Optional)
                </ThemedText>
                <TextInput
                  style={[styles.textInput, { 
                    backgroundColor: theme.backgroundDefault,
                    borderColor: theme.backgroundSecondary,
                    color: theme.text
                  }]}
                  value={recipientName}
                  onChangeText={setRecipientName}
                  placeholder="Enter recipient's name"
                  placeholderTextColor={theme.secondaryText}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.podSection}>
                <ThemedText style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                  Signature (Optional)
                </ThemedText>
                <SignaturePad 
                  ref={signatureRef}
                  onSignatureChange={setHasSignature}
                  height={250}
                />
              </View>

              <View style={styles.podSection}>
                <ThemedText style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                  Notes (Optional)
                </ThemedText>
                <TextInput
                  style={[styles.notesInput, { 
                    backgroundColor: theme.backgroundDefault,
                    borderColor: theme.backgroundSecondary,
                    color: theme.text
                  }]}
                  value={podNotes}
                  onChangeText={setPodNotes}
                  placeholder="e.g., Left with neighbor, placed in safe location..."
                  placeholderTextColor={theme.secondaryText}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>
            ) : (
            <KeyboardAwareScrollView 
              style={styles.podScrollContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.podScrollContentContainer}
              bottomOffset={100}
            >
              <View style={styles.podSection}>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionLabel}>
                    Photos <Text style={{ color: theme.error }}>*</Text>
                  </ThemedText>
                  <ThemedText style={[styles.photoCount, { color: podPhotos.length >= MAX_POD_PHOTOS ? theme.error : theme.secondaryText }]}>
                    {podPhotos.length}/{MAX_POD_PHOTOS} photos
                  </ThemedText>
                </View>
                
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.photosScroll}
                  contentContainerStyle={styles.photosScrollContent}
                >
                  <Pressable
                    onPress={showPhotoOptions}
                    style={[styles.addPhotoButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.primary }]}
                  >
                    <Feather name="plus" size={32} color={theme.primary} />
                    <ThemedText style={[styles.addPhotoText, { color: theme.primary }]}>
                      Add Photo
                    </ThemedText>
                  </Pressable>
                  
                  {podPhotos.map((photo, index) => (
                    <View key={index} style={styles.photoWrapper}>
                      <Image 
                        source={{ uri: photo }} 
                        style={styles.podThumbnail}
                        contentFit="cover"
                      />
                      <Pressable
                        onPress={() => removePhoto(index)}
                        style={[styles.removePhotoButton, { backgroundColor: theme.error }]}
                      >
                        <Feather name="x" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.podSection}>
                <ThemedText style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                  Recipient Name (Optional)
                </ThemedText>
                <TextInput
                  style={[styles.textInput, { 
                    backgroundColor: theme.backgroundDefault,
                    borderColor: theme.backgroundSecondary,
                    color: theme.text
                  }]}
                  value={recipientName}
                  onChangeText={setRecipientName}
                  placeholder="Enter recipient's name"
                  placeholderTextColor={theme.secondaryText}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.podSection}>
                <ThemedText style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                  Signature (Optional)
                </ThemedText>
                <SignaturePad 
                  ref={signatureRef}
                  onSignatureChange={setHasSignature}
                  height={250}
                />
              </View>

              <View style={styles.podSection}>
                <ThemedText style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                  Notes (Optional)
                </ThemedText>
                <TextInput
                  style={[styles.notesInput, { 
                    backgroundColor: theme.backgroundDefault,
                    borderColor: theme.backgroundSecondary,
                    color: theme.text
                  }]}
                  value={podNotes}
                  onChangeText={setPodNotes}
                  placeholder="e.g., Left with neighbor, placed in safe location..."
                  placeholderTextColor={theme.secondaryText}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </KeyboardAwareScrollView>
            )}

            <View style={styles.modalActions}>
              <Button 
                title={updating || uploadingPhotos ? 'Completing...' : 'Complete Delivery'}
                onPress={handleCompletePOD}
                disabled={updating || uploadingPhotos || podPhotos.length === 0}
                style={{ flex: 1 }}
              />
            </View>
            
            {(updating || uploadingPhotos) ? (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color={theme.primary} />
                <ThemedText style={[styles.uploadingText, { color: theme.text }]}>
                  Uploading {podPhotos.length} photo{podPhotos.length !== 1 ? 's' : ''}...
                </ThemedText>
              </View>
            ) : null}
          </ThemedView>
        </SafeAreaView>
      </Modal>

      {showBarcodeScanner ? (
        <Modal
          visible={true}
          transparent={false}
          animationType="slide"
          onRequestClose={closeBarcodeScanner}
        >
          <SafeAreaView style={styles.scannerContainer}>
            <View style={styles.scannerHeader}>
              <ThemedText style={styles.scannerTitle}>
                Scan {scanType === 'pickup' ? 'Pickup' : 'Delivery'} Barcode
              </ThemedText>
              <Pressable
                onPress={closeBarcodeScanner}
                style={styles.scannerCloseButton}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                accessibilityLabel="Close scanner"
                accessibilityRole="button"
              >
                <Feather name="x" size={28} color="#fff" />
              </Pressable>
            </View>
            
            {Platform.OS !== 'web' ? (
              <CameraView
                key={scanSessionId}
                style={styles.camera}
                facing="back"
                autofocus="on"
                active={showBarcodeScanner && cameraPermission?.granted}
                onCameraReady={handleCameraReady}
                onBarcodeScanned={cameraReady && !scanned ? handleBarcodeScanned : undefined}
                barcodeScannerSettings={{
                  barcodeTypes: [
                    'code128',
                    'code39',
                    'ean13',
                    'ean8',
                    'upc_a',
                    'upc_e',
                    'codabar',
                    'itf14',
                  ],
                }}
              />
            ) : (
              <View style={[styles.camera, { justifyContent: 'center', alignItems: 'center' }]}>
                <ThemedText style={{ color: '#fff', textAlign: 'center', padding: 20 }}>
                  Barcode scanning is only available on mobile devices. Please use the Expo Go app to scan barcodes.
                </ThemedText>
              </View>
            )}
            
            <View style={[styles.scannerOverlay, { pointerEvents: 'box-none' }]}>
              <View style={styles.scannerFrame}>
                <View style={[styles.scannerCorner, styles.topLeft]} />
                <View style={[styles.scannerCorner, styles.topRight]} />
                <View style={[styles.scannerCorner, styles.bottomLeft]} />
                <View style={[styles.scannerCorner, styles.bottomRight]} />
              </View>
              {!cameraReady ? (
                <View style={styles.scannerLoadingContainer}>
                  <ActivityIndicator size="large" color="#fff" />
                  <ThemedText style={styles.scannerHint}>
                    Initializing camera...
                  </ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.scannerHint}>
                  Position the barcode within the frame
                </ThemedText>
              )}
            </View>
            
            <View style={styles.scannerBottomControls}>
              {scanned ? (
                <Pressable
                  style={[styles.scanAgainButton, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    setScanned(false);
                    lastScannedCode.current = '';
                    lastScanTime.current = 0;
                    setScanSessionId(Date.now());
                  }}
                >
                  <Feather name="refresh-cw" size={20} color="#fff" />
                  <Text style={styles.scanAgainText}>Scan Again</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.scannerCancelButton}
                onPress={closeBarcodeScanner}
              >
                <Text style={styles.scannerCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}

      <Modal
        visible={showFailedModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowFailedModal(false);
          setFailureReason('');
        }}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable 
            style={styles.modalDismissArea}
            onPress={() => {
              setShowFailedModal(false);
              setFailureReason('');
            }}
          />
          <ThemedView style={styles.failedModalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Failed Delivery</ThemedText>
              <Pressable 
                onPress={() => {
                  setShowFailedModal(false);
                  setFailureReason('');
                }}
                style={styles.closeButton}
              >
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            
            <ScrollView 
              style={styles.failedModalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <ThemedText style={styles.sectionLabel}>
                Reason for Failed Delivery <Text style={{ color: theme.error }}>*</Text>
              </ThemedText>
              <TextInput
                style={[styles.failedReasonInput, { 
                  backgroundColor: theme.backgroundDefault,
                  borderColor: theme.backgroundSecondary,
                  color: theme.text
                }]}
                value={failureReason}
                onChangeText={setFailureReason}
                placeholder="Enter the reason for failed delivery..."
                placeholderTextColor={theme.secondaryText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable 
                onPress={() => {
                  setShowFailedModal(false);
                  setFailureReason('');
                }}
                style={[styles.cancelButton, { borderColor: theme.border }]}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleFailedDelivery}
                disabled={updating || !failureReason.trim()}
                style={[
                  styles.confirmFailedButton, 
                  { backgroundColor: theme.error },
                  (!failureReason.trim() || updating) && { opacity: 0.5 }
                ]}
              >
                <Text style={styles.confirmFailedText}>
                  {updating ? 'Submitting...' : 'Confirm Failed'}
                </Text>
              </Pressable>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Waiting Time Modal */}
      <Modal
        visible={showWaitingTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWaitingTimeModal(false)}
      >
        <View style={styles.navModalOverlay}>
          <Pressable style={styles.navModalDismiss} onPress={() => setShowWaitingTimeModal(false)} />
          <View style={[styles.navModalContent, { backgroundColor: theme.backgroundDefault }]}>
            <View style={[styles.navModalHeader, { borderBottomColor: theme.border }]}>
              <ThemedText style={styles.navModalTitle}>Log Waiting Time</ThemedText>
              <Pressable onPress={() => setShowWaitingTimeModal(false)} style={styles.closeButton}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <View style={{ padding: Spacing.md }}>
              {/* Timer reference */}
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, padding: Spacing.sm, marginBottom: Spacing.md }}>
                <Text style={{ color: '#92400E', fontSize: 13, textAlign: 'center' }}>
                  Current wait time: {formatWaitingTimer(waitingTimerSeconds)}
                </Text>
              </View>

              <ThemedText style={{ fontSize: 14, color: theme.secondaryText, marginBottom: Spacing.xs }}>
                Total minutes waited at pickup (10–50):
              </ThemedText>
              <TextInput
                value={waitingMinutesInput}
                onChangeText={setWaitingMinutesInput}
                keyboardType="numeric"
                maxLength={2}
                placeholder="e.g. 20"
                placeholderTextColor={theme.secondaryText}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 8,
                  padding: Spacing.sm,
                  fontSize: 24,
                  color: theme.text,
                  textAlign: 'center',
                  backgroundColor: theme.backgroundSecondary,
                  marginBottom: Spacing.sm,
                }}
              />

              {/* Charge preview */}
              {waitingMinutesInput ? (() => {
                const mins = parseInt(waitingMinutesInput, 10);
                if (!isNaN(mins) && mins >= 10 && mins <= 50) {
                  const chargeable = Math.max(0, mins - 10);
                  const charge = chargeable * 0.20;
                  return (
                    <View style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 8, padding: Spacing.sm, marginBottom: Spacing.md }}>
                      <Text style={{ color: theme.secondaryText, fontSize: 13, marginBottom: 4 }}>
                        {chargeable} chargeable min × £0.20
                      </Text>
                      <Text style={{ color: charge > 0 ? '#16A34A' : theme.secondaryText, fontSize: 18, fontWeight: '700' }}>
                        {charge > 0 ? `+£${charge.toFixed(2)} added to earnings` : 'No charge (within free period)'}
                      </Text>
                    </View>
                  );
                }
                return null;
              })() : null}

              <Button
                title={submittingWaitingTime ? 'Saving...' : 'Confirm Waiting Time'}
                onPress={submitWaitingTime}
                disabled={submittingWaitingTime || !waitingMinutesInput}
                style={{ marginBottom: Spacing.sm }}
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setShowWaitingTimeModal(false)}
                disabled={submittingWaitingTime}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showNavModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNavModal(false)}
      >
        <View style={styles.navModalOverlay}>
          <Pressable 
            style={styles.navModalDismiss} 
            onPress={() => setShowNavModal(false)}
          />
          <View style={[styles.navModalContent, { backgroundColor: theme.backgroundDefault }]}>
            <View style={[styles.navModalHeader, { borderBottomColor: theme.border }]}>
              <ThemedText style={styles.navModalTitle}>Choose Navigation App</ThemedText>
              <Pressable onPress={() => setShowNavModal(false)} style={styles.closeButton}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            
            <View style={styles.navModalBody}>
              <Pressable
                style={[styles.navOption, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => openExternalNavigation('google')}
              >
                <View style={[styles.navIconContainer, { backgroundColor: '#4285F4' }]}>
                  <Feather name="map" size={24} color="#fff" />
                </View>
                <View style={styles.navOptionText}>
                  <ThemedText style={styles.navOptionTitle}>Google Maps</ThemedText>
                  <ThemedText style={[styles.navOptionSubtitle, { color: theme.secondaryText }]}>
                    Recommended
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={20} color={theme.secondaryText} />
              </Pressable>

              <Pressable
                style={[styles.navOption, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => openExternalNavigation('waze')}
              >
                <View style={[styles.navIconContainer, { backgroundColor: '#33CCFF' }]}>
                  <Feather name="navigation" size={24} color="#fff" />
                </View>
                <View style={styles.navOptionText}>
                  <ThemedText style={styles.navOptionTitle}>Waze</ThemedText>
                  <ThemedText style={[styles.navOptionSubtitle, { color: theme.secondaryText }]}>
                    Traffic alerts
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={20} color={theme.secondaryText} />
              </Pressable>

              <Pressable
                style={[styles.navOption, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => openExternalNavigation('apple')}
              >
                <View style={[styles.navIconContainer, { backgroundColor: '#000' }]}>
                  <Feather name="compass" size={24} color="#fff" />
                </View>
                <View style={styles.navOptionText}>
                  <ThemedText style={styles.navOptionTitle}>Apple Maps</ThemedText>
                  <ThemedText style={[styles.navOptionSubtitle, { color: theme.secondaryText }]}>
                    Built-in
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={20} color={theme.secondaryText} />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    fontSize: 17,
    textAlign: 'center',
  },
  progressLine: {
    position: 'absolute',
    top: 12,
    left: '60%',
    right: '-40%',
    height: 2,
    zIndex: -1,
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  locationText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  settingsButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  settingsButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  jobCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  jobId: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: Spacing.lg,
  },
  phoneSection: {
    marginBottom: Spacing.sm,
  },
  phoneLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  phoneLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  phoneName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  phoneNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  callButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  routeInfo: {
    gap: Spacing.lg,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  locationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationDetails: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 15,
    marginBottom: Spacing.xs,
  },
  locationValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  addressText: {
    fontSize: 15,
    marginTop: Spacing.xs,
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 15,
    marginBottom: Spacing.xs,
  },
  detailValue: {
    fontSize: 17,
    fontWeight: '600',
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
  },
  customerInfo: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  phoneLink: {
    fontSize: 17,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  contactButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    flex: 1,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  notesSection: {
    gap: Spacing.xs,
  },
  actionButton: {
    marginTop: Spacing.lg,
  },
  actionButtonsRow: {
    marginTop: Spacing.lg,
  },
  actionButtonMain: {
    flex: 1,
  },
  failedDeliveryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  failedDeliveryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalDismissArea: {
    flex: 1,
  },
  failedModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    alignSelf: 'center',
  },
  failedModalBody: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  failedReasonInput: {
    fontSize: 17,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    minHeight: 120,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  confirmFailedButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  confirmFailedText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 17,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  podModalContent: {
    flex: 1,
    padding: Spacing['2xl'],
    paddingBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    padding: Spacing.xs,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  podScrollContent: {
    flex: 1,
  },
  podScrollContentContainer: {
    paddingBottom: Spacing.lg,
  },
  podSection: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  photoCount: {
    fontSize: 17,
  },
  photosScroll: {
    marginHorizontal: -Spacing['2xl'],
    paddingHorizontal: Spacing['2xl'],
  },
  photosScrollContent: {
    gap: Spacing.md,
    paddingRight: Spacing['2xl'],
  },
  addPhotoButton: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  addPhotoText: {
    fontSize: 15,
    fontWeight: '600',
  },
  photoWrapper: {
    position: 'relative',
  },
  podThumbnail: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.md,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    height: 48,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  uploadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  barcodeSection: {
    gap: Spacing.sm,
  },
  barcodeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  barcodeItem: {
    flex: 1,
    gap: Spacing.xs,
  },
  barcodeLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  barcodeValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  barcodeText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    backgroundColor: '#000',
    position: 'relative',
    zIndex: 100,
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scannerCloseButton: {
    position: 'absolute',
    right: Spacing.md,
    top: Spacing.lg,
    padding: Spacing.md,
    zIndex: 101,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 24,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    top: 100,
    zIndex: 50,
  },
  scannerFrame: {
    width: 280,
    height: 180,
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#fff',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  scannerHint: {
    color: '#fff',
    fontSize: 17,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  scannerLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  scanAgainContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: BorderRadius.md,
  },
  scanAgainText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scannerBottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
    paddingTop: Spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scannerCancelButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.md,
    minWidth: 120,
    alignItems: 'center',
  },
  scannerCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  navModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  navModalDismiss: {
    flex: 1,
  },
  navModalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 40,
  },
  navModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  navModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  navModalBody: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  navOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  navIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  navOptionText: {
    flex: 1,
  },
  navOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  navOptionSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  navDivider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
});
