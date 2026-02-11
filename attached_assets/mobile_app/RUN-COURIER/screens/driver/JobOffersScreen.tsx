import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { View, StyleSheet, Pressable, Modal, RefreshControl, Alert, Text, Platform, ActivityIndicator, TouchableOpacity, Switch, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { supabase, Job } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePendingJobs } from '@/context/PendingJobsContext';
import { useSoundAlarm } from '@/hooks/useSoundAlarm';
import { sendJobRejectionEmail } from '@/services/emailService';
import { JobOfferMapPreview } from '@/components/JobOfferMapPreview';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || '';
const DRIVER_ONLINE_STATUS_KEY = '@driver_online_status';

// FREEZE PREVENTION: Timeout wrapper for all async operations
// ALWAYS resolves - never rejects - to prevent UI freezes
const API_TIMEOUT_MS = 10000;
const LOCATION_TIMEOUT_MS = 5000;

// Safe timeout wrapper that ALWAYS resolves (never throws)
// Returns { success: true, result } or { success: false, error }
const safeTimeout = async <T,>(
  promise: Promise<T>, 
  timeoutMs: number = API_TIMEOUT_MS,
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

export function JobOffersScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { user, driver } = useAuth();
  const { refreshPendingJobs } = usePendingJobs();
  const { startRepeatingAlarm, stopRepeatingAlarm } = useSoundAlarm();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [acceptingJobId, setAcceptingJobId] = useState<string | number | null>(null);
  const [rejectingJob, setRejectingJob] = useState(false);
  const previousJobCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const alarmVerifyIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Online/Offline status
  const [isOnline, setIsOnline] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);

  const rejectReasons = ['Too far', 'Busy right now', 'Unacceptable rate', 'Have another job'];
  
  // CRITICAL: Use both driver.id AND user.id to catch jobs assigned with either ID
  // This handles mismatch between website-created drivers and mobile auth users
  const driverRecordId = driver?.id;
  const authUserId = user?.id;
  const driverId = driverRecordId || authUserId;
  const driverName = driver?.full_name || driver?.name || 'Driver';
  
  // Get all unique IDs to search for jobs
  const allDriverIds = [...new Set([driverRecordId, authUserId].filter(Boolean))] as string[];

  // Get auth token for API calls
  const getAuthToken = async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  };

  // Geocode jobs that are missing coordinates but have addresses
  // This is a fire-and-forget background operation that updates state when done
  const geocodeJobsWithMissingCoords = useCallback(async (jobsList: Job[]) => {
    const token = await getAuthToken();
    if (!token || !API_URL) return;
    
    const jobsNeedingGeocode = jobsList.filter(job => {
      const hasPickupCoords = (job.pickup_latitude || job.pickup_lat) && (job.pickup_longitude || job.pickup_lng);
      const hasDeliveryCoords = (job.delivery_latitude || job.dropoff_lat) && (job.delivery_longitude || job.dropoff_lng);
      const hasPickupAddr = job.pickup_address || job.pickup_postcode;
      const hasDeliveryAddr = job.dropoff_address || (job as any).delivery_address || (job as any).delivery_postcode;
      return (!hasPickupCoords && hasPickupAddr) || (!hasDeliveryCoords && hasDeliveryAddr);
    });
    
    if (jobsNeedingGeocode.length === 0) return;
    console.log(`[JobOffers] Geocoding ${jobsNeedingGeocode.length} jobs with missing coordinates`);
    
    let updated = false;
    const updatedJobs = [...jobsList];
    
    for (const job of jobsNeedingGeocode) {
      const idx = updatedJobs.findIndex(j => j.id === job.id);
      if (idx === -1) continue;
      
      try {
        const hasPickupCoords = (job.pickup_latitude || job.pickup_lat) && (job.pickup_longitude || job.pickup_lng);
        if (!hasPickupCoords) {
          const addr = job.pickup_address || job.pickup_postcode || '';
          if (addr) {
            const resp = await fetch(`${API_URL}/api/mobile/v1/geocode?address=${encodeURIComponent(addr)}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const geo = await resp.json();
            if (geo.lat && geo.lng) {
              updatedJobs[idx] = { ...updatedJobs[idx], pickup_latitude: geo.lat, pickup_longitude: geo.lng };
              updated = true;
              console.log(`[JobOffers] Geocoded pickup for job ${job.id}: ${geo.lat}, ${geo.lng}`);
            }
          }
        }
        
        const hasDeliveryCoords = (job.delivery_latitude || job.dropoff_lat) && (job.delivery_longitude || job.dropoff_lng);
        if (!hasDeliveryCoords) {
          const addr = job.dropoff_address || (job as any).delivery_address || (job as any).delivery_postcode || '';
          if (addr) {
            const resp = await fetch(`${API_URL}/api/mobile/v1/geocode?address=${encodeURIComponent(addr)}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const geo = await resp.json();
            if (geo.lat && geo.lng) {
              updatedJobs[idx] = { ...updatedJobs[idx], delivery_latitude: geo.lat, delivery_longitude: geo.lng };
              updated = true;
              console.log(`[JobOffers] Geocoded delivery for job ${job.id}: ${geo.lat}, ${geo.lng}`);
            }
          }
        }
      } catch (err) {
        console.log(`[JobOffers] Geocoding failed for job ${job.id}:`, err);
      }
    }
    
    if (updated && isMountedRef.current) {
      console.log('[JobOffers] Updating jobs with geocoded coordinates');
      setJobs(updatedJobs);
    }
  }, []);

  // FREEZE PREVENTION: Mounted ref to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Update driver status on backend (fire-and-forget with timeout)
  const updateDriverStatus = async (online: boolean, location?: Location.LocationObject) => {
    if (!driverId || !API_URL) return;
    
    try {
      const token = await getAuthToken();
      if (!token) {
        console.log('[STATUS] No auth token available');
        return;
      }

      const body: any = {
        driverId,
        isOnline: online,
      };
      
      if (location) {
        body.latitude = location.coords.latitude;
        body.longitude = location.coords.longitude;
        body.heading = location.coords.heading;
        body.speed = location.coords.speed;
      }
      
      // FREEZE PREVENTION: Wrap fetch in timeout (fire-and-forget)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      
      try {
        await fetch(`${API_URL}/api/driver/status`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // FREEZE PREVENTION: Silent fail - status update is non-critical
      console.log('[STATUS] Failed to update (non-blocking):', error);
    }
  };

  // FREEZE PREVENTION: Location tracking with timeout protection
  // Location is COMPLETELY OPTIONAL - never blocks UI
  // This complies with Apple App Store Guidelines 5.1.5
  const startLocationTracking = async () => {
    // FREEZE PREVENTION: Race permission request against timeout
    // If permission takes too long (iOS dialog active), we still go online without location
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
      console.log('[LOCATION] Permission check failed:', err);
    }

    try {
      
      if (permissionStatus !== 'granted' || permissionTimedOut) {
        // Location not available - still allow driver to go online without location
        // Non-blocking per Apple Guidelines 5.1.5
        updateDriverStatus(true).catch(() => {}); // Fire and forget
        return true; // Still return true - location is optional
      }

      // FREEZE PREVENTION: Get location with timeout (always resolves)
      const location = await safeTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATION_TIMEOUT_MS,
        null as any
      );
      if (location) {
        updateDriverStatus(true, location).catch(() => {}); // Non-blocking
      } else {
        console.log('[LOCATION] Could not get current position, continuing without');
        updateDriverStatus(true).catch(() => {}); // Fire and forget
      }

      // Start watching location - this is non-blocking by design
      try {
        locationWatcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 50,
          },
          (newLocation) => {
            if (isMountedRef.current) {
              updateDriverStatus(true, newLocation).catch(() => {}); // Non-blocking
            }
          }
        );
      } catch (watchErr) {
        console.log('[LOCATION] Could not start watcher, continuing without');
      }

      return true;
    } catch (error) {
      console.warn('[LOCATION] Error starting tracking (recovered):', error);
      // FREEZE PREVENTION: Still allow going online without location
      updateDriverStatus(true).catch(() => {}); // Fire and forget
      return true;
    }
  };

  // Stop location tracking when offline
  const stopLocationTracking = async () => {
    if (locationWatcherRef.current) {
      try {
        locationWatcherRef.current.remove();
      } catch (e) {
        // Ignore removal errors on web - removeSubscription not available
      }
      locationWatcherRef.current = null;
    }
    await updateDriverStatus(false);
  };

  // Toggle online/offline status
  // FREEZE PREVENTION: Safety timeout ensures statusLoading resolves in max 8 seconds
  const toggleOnlineStatus = async () => {
    setStatusLoading(true);
    const safetyTimer = setTimeout(() => {
      console.warn('[STATUS] Safety timeout - forcing statusLoading=false');
      if (isMountedRef.current) setStatusLoading(false);
    }, 8000);
    
    try {
      if (!isOnline) {
        const success = await startLocationTracking();
        if (success && isMountedRef.current) {
          setIsOnline(true);
          AsyncStorage.setItem(DRIVER_ONLINE_STATUS_KEY, 'true').catch(() => {});
        }
      } else {
        await stopLocationTracking();
        if (isMountedRef.current) {
          setIsOnline(false);
          AsyncStorage.setItem(DRIVER_ONLINE_STATUS_KEY, 'false').catch(() => {});
        }
      }
    } catch (error) {
      console.warn('[STATUS] Toggle error (recovered):', error);
    } finally {
      clearTimeout(safetyTimer);
      if (isMountedRef.current) setStatusLoading(false);
    }
  };

  // Load saved status from local storage and restore on mount
  useEffect(() => {
    const loadSavedStatus = async () => {
      if (!driverId) return;
      try {
        const savedStatus = await AsyncStorage.getItem(DRIVER_ONLINE_STATUS_KEY);
        console.log('[STATUS] Loaded saved status:', savedStatus);
        
        if (savedStatus === 'true') {
          setIsOnline(true);
          // Silently try to start location tracking - don't prompt if permission wasn't granted
          Location.getForegroundPermissionsAsync().then(({ status }) => {
            if (status === 'granted') {
              startLocationTracking();
            } else {
              // Go online without location - non-blocking
              updateDriverStatus(true);
            }
          });
        } else {
          setIsOnline(false);
        }
      } catch (error) {
        console.log('[STATUS] Failed to load saved status:', error);
      }
    };
    
    loadSavedStatus();
    
    return () => {
      if (locationWatcherRef.current) {
        try {
          locationWatcherRef.current.remove();
        } catch (e) {
          // Ignore removal errors on web
        }
      }
    };
  }, [driverId]);

  // FREEZE PREVENTION: Fetch request counter to ignore late-arriving results
  const fetchRequestIdRef = useRef(0);

  // FREEZE PREVENTION: Fetch jobs with timeout protection
  // Always resolves loading state - never leaves UI hanging
  // Strategy: Try backend API first (returns geocoded coords), fall back to direct Supabase query
  const fetchAssignedJobs = useCallback(async (playSound: boolean = false) => {
    console.log('[JobOffers] Fetching jobs for driver IDs:', allDriverIds);
    
    if (!driverId || allDriverIds.length === 0) {
      console.log('[JobOffers] No driverId available, skipping fetch');
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    const thisRequestId = ++fetchRequestIdRef.current;

    try {
      let newJobs: Job[] = [];
      let usedApi = false;

      // FIRST: Try fetching from backend API (server geocodes missing coordinates)
      if (API_URL) {
        try {
          const token = await getAuthToken();
          if (token) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
            try {
              const resp = await fetch(`${API_URL}/api/mobile/v1/driver/job-offers`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (resp.ok) {
                const body = await resp.json();
                if (body.success && Array.isArray(body.jobs)) {
                  newJobs = body.jobs;
                  usedApi = true;
                  console.log(`[JobOffers] API returned ${newJobs.length} geocoded jobs`);
                }
              } else {
                console.warn('[JobOffers] API returned status', resp.status);
              }
            } catch (fetchErr) {
              clearTimeout(timeoutId);
              console.warn('[JobOffers] API fetch failed, falling back to Supabase:', fetchErr);
            }
          }
        } catch (tokenErr) {
          console.warn('[JobOffers] Could not get auth token for API call');
        }
      }

      // FALLBACK: Direct Supabase query if API call failed
      if (!usedApi) {
        let timedOut = false;
        const queryPromise = supabase
          .from('driver_jobs_view')
          .select('*')
          .in('driver_id', allDriverIds)
          .in('status', ['assigned', 'offered'])
          .order('created_at', { ascending: false });

        const timeoutPromise = new Promise<null>((resolve) => 
          setTimeout(() => { timedOut = true; resolve(null); }, API_TIMEOUT_MS)
        );

        const result = await Promise.race([queryPromise, timeoutPromise]);

        if (fetchRequestIdRef.current !== thisRequestId) {
          console.log('[JobOffers] Ignoring stale fetch result');
          return;
        }

        if (timedOut || !result) {
          console.warn('[JobOffers] Supabase query timed out, using empty fallback');
          if (isMountedRef.current) {
            setJobs([]);
            setLoading(false);
            setRefreshing(false);
          }
          return;
        }

        const { data, error } = result;
        if (error) {
          console.warn('[JobOffers] Supabase query error (non-blocking):', error);
        }
        newJobs = Array.isArray(data) ? data : [];
        console.log('[JobOffers] Supabase fallback returned', newJobs.length, 'jobs');

        if (API_URL && newJobs.length > 0) {
          geocodeJobsWithMissingCoords(newJobs);
        }
      }

      if (fetchRequestIdRef.current !== thisRequestId) return;

      if (playSound && !isInitialLoadRef.current && newJobs.length > previousJobCountRef.current) {
        startRepeatingAlarm(4000);
        
        if (alarmVerifyIntervalRef.current) clearInterval(alarmVerifyIntervalRef.current);
        alarmVerifyIntervalRef.current = setInterval(() => {
          console.log('[JobOffers] Alarm verify poll - re-checking jobs');
          fetchAssignedJobsSilent();
        }, 5000);
      } else if (newJobs.length < previousJobCountRef.current || newJobs.length === 0) {
        stopRepeatingAlarm();
        if (alarmVerifyIntervalRef.current) {
          clearInterval(alarmVerifyIntervalRef.current);
          alarmVerifyIntervalRef.current = null;
        }
      }
      
      previousJobCountRef.current = newJobs.length;
      isInitialLoadRef.current = false;
      if (isMountedRef.current) setJobs(newJobs);
    } catch (error) {
      console.warn('[JobOffers] Error fetching jobs (recovered):', error);
      if (isMountedRef.current) setJobs(prev => prev || []);
    } finally {
      if (isMountedRef.current && fetchRequestIdRef.current === thisRequestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [driverId, allDriverIds.join(','), startRepeatingAlarm]);

  const fetchAssignedJobsSilent = useCallback(async () => {
    if (!driverId || allDriverIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('driver_jobs_view')
        .select('*')
        .in('driver_id', allDriverIds)
        .in('status', ['assigned', 'offered'])
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[JobOffers] Silent fetch error:', error);
        return;
      }

      const newJobs = Array.isArray(data) ? data : [];
      console.log('[JobOffers] Silent verify: found', newJobs.length, 'jobs, prev:', previousJobCountRef.current);
      
      if (newJobs.length < previousJobCountRef.current || newJobs.length === 0) {
        console.log('[JobOffers] Jobs withdrawn/removed - STOPPING ALARM');
        stopRepeatingAlarm();
        if (alarmVerifyIntervalRef.current) {
          clearInterval(alarmVerifyIntervalRef.current);
          alarmVerifyIntervalRef.current = null;
        }
      }
      
      previousJobCountRef.current = newJobs.length;
      if (isMountedRef.current) setJobs(newJobs);
    } catch (err) {
      console.warn('[JobOffers] Silent fetch failed:', err);
    }
  }, [driverId, allDriverIds.join(','), stopRepeatingAlarm]);

  useEffect(() => {
    fetchAssignedJobs(false);
    
    // Subscribe to changes for ALL possible driver IDs (handles website vs mobile ID mismatch)
    const channels: any[] = [];
    allDriverIds.forEach((id, index) => {
      const channel = supabase
        .channel(`assigned-jobs-channel-${index}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `driver_id=eq.${id}` }, () => {
          fetchAssignedJobs(true);
        })
        .subscribe();
      channels.push(channel);
    });

    return () => { 
      channels.forEach(ch => supabase.removeChannel(ch));
      stopRepeatingAlarm();
      if (alarmVerifyIntervalRef.current) {
        clearInterval(alarmVerifyIntervalRef.current);
        alarmVerifyIntervalRef.current = null;
      }
    };
  }, [fetchAssignedJobs, allDriverIds.join(',')]);

  // Handle push notifications for job_withdrawn
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (data?.type === 'job_withdrawn') {
        console.log('[JobOffers] Received job_withdrawn push notification');
        stopAlarmAndVerification();
        fetchAssignedJobs(false);
      }
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'job_withdrawn') {
        console.log('[JobOffers] User tapped job_withdrawn notification');
        stopAlarmAndVerification();
        fetchAssignedJobs(false);
      }
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, [fetchAssignedJobs, stopAlarmAndVerification]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAssignedJobs(false);
  }, [fetchAssignedJobs]);

  // IMPORTANT: tracking_number should ALWAYS come from the database (set by website/admin)
  // Format: RC2024001ABC - must match website exactly
  // The mobile app should NEVER generate its own tracking numbers

  // Sync job status to customer_bookings for website compatibility
  const syncBookingStatus = async (jobId: string | number, bookingStatus: string) => {
    try {
      const { data: booking } = await supabase
        .from('customer_bookings')
        .select('id')
        .eq('driver_job_id', String(jobId))
        .single();

      if (booking) {
        await supabase
          .from('customer_bookings')
          .update({ 
            status: bookingStatus, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', booking.id);
        console.log('Synced booking status:', booking.id, '→', bookingStatus);
      }
    } catch (error) {
      console.log('No linked booking for job:', jobId);
    }
  };

  const stopAlarmAndVerification = useCallback(() => {
    stopRepeatingAlarm();
    if (alarmVerifyIntervalRef.current) {
      clearInterval(alarmVerifyIntervalRef.current);
      alarmVerifyIntervalRef.current = null;
    }
  }, [stopRepeatingAlarm]);

  const handleAcceptJob = async (job: Job) => {
    if (!driverId || acceptingJobId !== null) return;
    stopAlarmAndVerification();
    setAcceptingJobId(job.id);

    try {
      // tracking_number should already be set by website/admin (format: RC2024001ABC)
      // We do NOT generate our own - just update the status
      const { error } = await supabase
        .from('jobs')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('driver_id', driverId);

      if (error) throw error;
      
      // Sync status to customer booking for website compatibility
      await syncBookingStatus(job.id, 'assigned');
      
      setJobs(prevJobs => prevJobs.filter(j => j.id !== job.id));
      refreshPendingJobs();
      navigation.dispatch(CommonActions.navigate({ name: 'ActiveJobTab' }));
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to accept job');
    } finally {
      setAcceptingJobId(null);
    }
  };

  const handleRejectJob = async () => {
    if (!selectedJob || !selectedReason || !driverId || rejectingJob) return;
    stopAlarmAndVerification();
    setRejectingJob(true);

    // Remove job from list immediately for better UX
    setJobs(prevJobs => prevJobs.filter(job => job.id !== selectedJob.id));
    setShowRejectModal(false);

    try {
      // Return job to admin by clearing driver_id and setting status to awaiting_assignment
      // This removes the job from the driver's list and makes it available for admin to reassign
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          status: 'awaiting_assignment',
          driver_id: null,
          rejection_reason: selectedReason,
          rejected_by_driver_id: driverId,
          rejected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedJob.id);

      if (updateError) {
        // If the new columns don't exist, try with minimal update
        if (updateError.message?.includes('rejected_by_driver_id') || 
            updateError.message?.includes('rejected_at') ||
            updateError.message?.includes('rejection_reason')) {
          const { error: fallbackError } = await supabase
            .from('jobs')
            .update({
              status: 'awaiting_assignment',
              driver_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', selectedJob.id);
          
          if (fallbackError) throw fallbackError;
        } else {
          throw updateError;
        }
      }

      try {
        await sendJobRejectionEmail({
          jobId: String(selectedJob.id),
          pickupAddress: selectedJob.pickup_address || selectedJob.pickup_postcode || 'N/A',
          deliveryAddress: selectedJob.dropoff_address || selectedJob.delivery_address || selectedJob.delivery_postcode || 'N/A',
          driverName,
          rejectionReason: selectedReason,
          price: selectedJob.driver_price ?? 0,  // SECURITY: Use driver_price only
          scheduledPickupTime: selectedJob.scheduled_pickup_time,
        });
      } catch (emailError) {
        // Email is non-critical, don't block rejection
      }

      setSelectedJob(null);
      setSelectedReason('');
      Alert.alert('Job Declined', 'The job has been returned to admin.');
      refreshPendingJobs();
    } catch (error: any) {
      console.error('Reject job error:', error);
      // Re-fetch jobs if update failed
      fetchAssignedJobs(false);
      Alert.alert('Error', error.message || 'Failed to decline job. Please try again.');
    } finally {
      setRejectingJob(false);
    }
  };

  // FREEZE PREVENTION: Safety timeout to force loading=false after 5 seconds
  // This ensures the UI never stays stuck on the loading spinner
  useEffect(() => {
    if (loading) {
      const safetyTimer = setTimeout(() => {
        console.warn('[JobOffers] Safety timeout triggered - forcing loading=false');
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
          <ThemedText type="body" color="secondary" style={{ marginTop: Spacing.md }}>
            Loading job offers...
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <ScreenScrollView 
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        hasTabBar
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View style={styles.content}>
          {/* Online/Offline Status Toggle - Compact */}
          <Pressable 
            onPress={toggleOnlineStatus}
            disabled={statusLoading}
            style={[
              styles.statusToggle,
              { 
                backgroundColor: isOnline ? theme.success + '12' : theme.backgroundSecondary,
                borderColor: isOnline ? theme.success : theme.border,
              }
            ]}
          >
            <View style={styles.statusLeft}>
              <View style={[
                styles.statusIndicator,
                { backgroundColor: isOnline ? theme.success : theme.secondaryText }
              ]} />
              <ThemedText type="caption" style={{ color: isOnline ? theme.success : theme.text }}>
                {isOnline ? 'Online' : 'Offline'}
              </ThemedText>
            </View>
            {statusLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Switch
                value={isOnline}
                onValueChange={toggleOnlineStatus}
                trackColor={{ false: theme.border, true: theme.success + '50' }}
                thumbColor={isOnline ? theme.success : theme.secondaryText}
                disabled={statusLoading}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            )}
          </Pressable>
          {jobs.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.primary + '12' }]}>
                <Feather name="inbox" size={32} color={theme.primary} />
              </View>
              <ThemedText type="h3" style={styles.emptyTitle}>No Job Offers</ThemedText>
              <ThemedText type="subhead" color="secondary" style={styles.emptySubtext}>
                You'll be notified when admin assigns a job to you
              </ThemedText>
            </View>
          ) : (
            <View style={styles.jobsList}>
              {jobs.map((job) => {
                // SECURITY: Use driver_price ONLY - never show customer pricing
                const jobPrice = job.driver_price ?? 0;
                const pickupLocation = job.pickup_address || 'Pickup location';
                const dropoffLocation = job.dropoff_address || job.delivery_address || 'Delivery location';
                  
                const jobNumber = job.tracking_number || (job.id ? String(job.id).slice(0, 8).toUpperCase() : 'N/A');
                
                return (
                  <Card key={job.id} variant="glass" style={styles.jobCard}>
                    <View style={styles.cardHeader}>
                      <View>
                        <ThemedText type="h4">New Job Offer</ThemedText>
                        <ThemedText type="caption" color="secondary">
                          #{jobNumber}
                        </ThemedText>
                      </View>
                      <View style={[styles.priceTag, { backgroundColor: theme.success + '15' }]}>
                        <ThemedText type="h2" style={{ color: theme.success }}>
                          £{typeof jobPrice === 'number' ? jobPrice.toFixed(2) : '0.00'}
                        </ThemedText>
                      </View>
                    </View>

                    <JobOfferMapPreview
                      pickupLat={job.pickup_latitude ?? job.pickup_lat}
                      pickupLng={job.pickup_longitude ?? job.pickup_lng}
                      dropoffLat={job.delivery_latitude ?? job.dropoff_lat}
                      dropoffLng={job.delivery_longitude ?? job.dropoff_lng}
                      staticMapUrl={(job as any).static_map_url || (job as any).staticMapUrl || null}
                    />

                    <View style={styles.locationRow}>
                      <View style={[styles.pinIcon, { backgroundColor: theme.primary }]}>
                        <Feather name="map-pin" size={14} color="#fff" />
                      </View>
                      <View style={styles.locationInfo}>
                        <ThemedText type="caption" color="secondary">PICKUP</ThemedText>
                        <ThemedText type="body" numberOfLines={2}>{pickupLocation}</ThemedText>
                      </View>
                    </View>

                    <View style={[styles.routeLine, { borderLeftColor: theme.border }]} />

                    <View style={styles.locationRow}>
                      <View style={[styles.pinIcon, { backgroundColor: theme.error }]}>
                        <Feather name="map-pin" size={14} color="#fff" />
                      </View>
                      <View style={styles.locationInfo}>
                        <ThemedText type="caption" color="secondary">DELIVERY</ThemedText>
                        <ThemedText type="body" numberOfLines={2}>{dropoffLocation}</ThemedText>
                      </View>
                    </View>

                    {job.distance ? (
                      <View style={[styles.infoRow, { borderTopColor: theme.border }]}>
                        <Feather name="navigation" size={14} color={theme.secondaryText} />
                        <ThemedText type="small" color="secondary">
                          Distance: <ThemedText type="bodyMedium">{job.distance} miles</ThemedText>
                        </ThemedText>
                      </View>
                    ) : null}

                    {job.notes ? (
                      <View style={[styles.notesContainer, { backgroundColor: theme.backgroundSecondary }]}>
                        <ThemedText type="caption" color="secondary">Notes:</ThemedText>
                        <ThemedText type="small">{job.notes}</ThemedText>
                      </View>
                    ) : null}

                    <View style={styles.actions}>
                      <Button
                        title="Accept"
                        icon="check"
                        onPress={() => handleAcceptJob(job)}
                        loading={acceptingJobId === job.id}
                        disabled={acceptingJobId !== null}
                        style={styles.acceptBtn}
                      />
                      <Button
                        title="Reject"
                        icon="x"
                        variant="outline"
                        onPress={() => {
                          setSelectedJob(job);
                          setShowRejectModal(true);
                        }}
                        disabled={acceptingJobId !== null}
                        style={styles.rejectBtn}
                      />
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </View>
      </ScreenScrollView>

      <Modal
        visible={showRejectModal}
        transparent
        animationType="slide"
        onRequestClose={() => !rejectingJob && setShowRejectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={styles.modalBackdrop}
            onPress={() => !rejectingJob && setShowRejectModal(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText type="h3" style={styles.modalTitle}>Decline Job</ThemedText>
            <ThemedText type="subhead" color="secondary" style={styles.modalSubtitle}>
              Please select a reason
            </ThemedText>
            
            <View style={styles.reasonsList}>
              {rejectReasons.map((reason) => (
                <Pressable
                  key={reason}
                  style={[
                    styles.reasonItem,
                    { borderColor: selectedReason === reason ? theme.primary : theme.border },
                    selectedReason === reason && { backgroundColor: theme.primary + '08' }
                  ]}
                  onPress={() => setSelectedReason(reason)}
                >
                  <View style={[
                    styles.radio, 
                    { borderColor: selectedReason === reason ? theme.primary : theme.border },
                    selectedReason === reason && { backgroundColor: theme.primary }
                  ]}>
                    {selectedReason === reason ? <View style={styles.radioInner} /> : null}
                  </View>
                  <ThemedText type="body">{reason}</ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => {
                  setShowRejectModal(false);
                  setSelectedReason('');
                }}
                disabled={rejectingJob}
                style={styles.modalBtn}
              />
              <Button
                title="Confirm"
                variant="destructive"
                onPress={handleRejectJob}
                loading={rejectingJob}
                disabled={!selectedReason || rejectingJob}
                style={styles.modalBtn}
              />
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
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["3xl"],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptySubtext: {
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  jobsList: {
    gap: Spacing.lg,
  },
  jobCard: {
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  priceTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  pinIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  locationInfo: {
    flex: 1,
  },
  routeLine: {
    marginLeft: 14,
    height: 16,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  notesContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  acceptBtn: {
    flex: 1,
  },
  rejectBtn: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing["3xl"],
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  reasonsList: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: Spacing.md,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalBtn: {
    flex: 1,
  },
});
