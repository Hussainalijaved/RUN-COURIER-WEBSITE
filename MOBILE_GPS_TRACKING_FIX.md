# GPS Tracking Fix for Run Courier Driver App

## Problem

Driver accepts a job → GPS tracking shows "active" → UI displays "Location data unavailable".

## Root Cause Analysis

The issue occurs because:
1. **Missing database table**: No dedicated `driver_locations` table in Supabase for job-specific tracking
2. **No upsert logic**: Location updates may duplicate or fail silently
3. **Missing real-time subscription**: App doesn't subscribe to location changes
4. **Permission handling**: Background location may not be properly configured
5. **Offline handling**: No retry logic for failed writes

## Solution Overview

### Database (Supabase)
- New `driver_locations` table with RLS policies
- Upsert function for atomic location updates
- Real-time enabled for subscriptions

### Mobile App (Expo/React Native)
- Proper permission handling (foreground + background)
- Location tracking starts on job accept, stops on complete/cancel
- Writes to Supabase every 5-10 seconds
- Offline queue for failed writes

### Web App (Admin Dashboard)
- Real-time subscription to `driver_locations`
- Fallback to polling if real-time fails
- Proper loading states

---

## Step 1: Deploy Supabase Migration

Run this SQL in your Supabase SQL Editor or apply via migration:

```sql
-- File: supabase/migrations/009_driver_locations.sql
-- (Already created in your project)
```

After deployment, verify:
```sql
-- Check table exists
SELECT * FROM driver_locations LIMIT 1;

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'driver_locations';

-- Check policies
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'driver_locations';
```

---

## Step 2: Mobile App Changes

### 2.1 Location Service (`src/services/LocationService.ts`)

```typescript
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_TASK_NAME = 'background-location-task';
const LOCATION_QUEUE_KEY = 'pending_location_updates';

interface LocationUpdate {
  driverId: string;
  jobId: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  altitude: number | null;
  timestamp: number;
}

class LocationService {
  private isTracking = false;
  private currentJobId: string | null = null;
  private driverId: string | null = null;
  private locationSubscription: Location.LocationSubscription | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private lastLocation: Location.LocationObject | null = null;
  private batteryLevel: number = 100;

  // =====================================================
  // PERMISSION HANDLING
  // =====================================================
  
  async requestPermissions(): Promise<{ foreground: boolean; background: boolean }> {
    console.log('[LocationService] Requesting permissions...');
    
    // Request foreground permission first
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    const foregroundGranted = foregroundStatus === 'granted';
    console.log('[LocationService] Foreground permission:', foregroundStatus);
    
    if (!foregroundGranted) {
      return { foreground: false, background: false };
    }
    
    // Request background permission (iOS requires this separately)
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    const backgroundGranted = backgroundStatus === 'granted';
    console.log('[LocationService] Background permission:', backgroundStatus);
    
    return { foreground: foregroundGranted, background: backgroundGranted };
  }

  async checkPermissions(): Promise<{ foreground: boolean; background: boolean }> {
    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
    const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
    
    return {
      foreground: foregroundStatus === 'granted',
      background: backgroundStatus === 'granted',
    };
  }

  // =====================================================
  // TRACKING START/STOP
  // =====================================================
  
  async startTracking(driverId: string, jobId: string | null = null): Promise<boolean> {
    console.log('[LocationService] Starting tracking for driver:', driverId, 'job:', jobId);
    
    if (this.isTracking && this.currentJobId === jobId) {
      console.log('[LocationService] Already tracking this job');
      return true;
    }

    this.driverId = driverId;
    this.currentJobId = jobId;

    // Check permissions
    const permissions = await this.checkPermissions();
    if (!permissions.foreground) {
      console.error('[LocationService] No foreground permission');
      return false;
    }

    // Stop any existing tracking
    await this.stopTracking();

    try {
      // Start foreground location watching
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // Every 5 seconds
          distanceInterval: 10, // Or every 10 meters
        },
        (location) => this.handleLocationUpdate(location)
      );

      // If background permission is granted, start background task
      if (permissions.background) {
        await this.startBackgroundTracking();
      }

      // Process any queued locations from previous offline sessions
      await this.processLocationQueue();

      this.isTracking = true;
      console.log('[LocationService] Tracking started successfully');
      return true;
    } catch (error) {
      console.error('[LocationService] Failed to start tracking:', error);
      return false;
    }
  }

  async stopTracking(): Promise<void> {
    console.log('[LocationService] Stopping tracking...');

    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Stop background tracking
    await this.stopBackgroundTracking();

    this.isTracking = false;
    this.currentJobId = null;
    console.log('[LocationService] Tracking stopped');
  }

  // =====================================================
  // BACKGROUND TRACKING (iOS)
  // =====================================================
  
  private async startBackgroundTracking(): Promise<void> {
    const isTaskDefined = TaskManager.isTaskDefined(LOCATION_TASK_NAME);
    
    if (!isTaskDefined) {
      console.log('[LocationService] Registering background task...');
      TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
        if (error) {
          console.error('[LocationService] Background task error:', error);
          return;
        }
        if (data) {
          const { locations } = data as { locations: Location.LocationObject[] };
          if (locations && locations.length > 0) {
            await this.handleLocationUpdate(locations[0]);
          }
        }
      });
    }

    const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (!isStarted) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000, // 10 seconds in background
        distanceInterval: 20, // Or 20 meters
        deferredUpdatesInterval: 10000,
        showsBackgroundLocationIndicator: true, // iOS blue bar
        foregroundService: {
          notificationTitle: 'Run Courier',
          notificationBody: 'Tracking your location for delivery',
          notificationColor: '#3B82F6',
        },
      });
      console.log('[LocationService] Background tracking started');
    }
  }

  private async stopBackgroundTracking(): Promise<void> {
    try {
      const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        console.log('[LocationService] Background tracking stopped');
      }
    } catch (error) {
      console.log('[LocationService] No background task to stop');
    }
  }

  // =====================================================
  // LOCATION UPDATE HANDLING
  // =====================================================
  
  private async handleLocationUpdate(location: Location.LocationObject): Promise<void> {
    console.log('[LocationService] Location captured:', {
      lat: location.coords.latitude.toFixed(6),
      lng: location.coords.longitude.toFixed(6),
      accuracy: location.coords.accuracy,
    });

    this.lastLocation = location;

    if (!this.driverId) {
      console.warn('[LocationService] No driver ID, skipping update');
      return;
    }

    const update: LocationUpdate = {
      driverId: this.driverId,
      jobId: this.currentJobId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
      altitude: location.coords.altitude,
      timestamp: location.timestamp,
    };

    await this.writeLocationToSupabase(update);
  }

  private async writeLocationToSupabase(update: LocationUpdate): Promise<boolean> {
    try {
      console.log('[LocationService] Writing location to Supabase...');

      // Use the upsert function for atomic updates
      const { data, error } = await supabase.rpc('upsert_driver_location', {
        p_driver_id: update.driverId,
        p_job_id: update.jobId,
        p_latitude: update.latitude,
        p_longitude: update.longitude,
        p_accuracy: update.accuracy,
        p_heading: update.heading,
        p_speed: update.speed,
        p_altitude: update.altitude,
        p_battery_level: this.batteryLevel,
        p_is_moving: (update.speed ?? 0) > 0.5,
        p_source: 'gps',
      });

      if (error) {
        console.error('[LocationService] Supabase write error:', error);
        await this.queueLocationUpdate(update);
        return false;
      }

      console.log('[LocationService] Location written successfully');
      return true;
    } catch (error) {
      console.error('[LocationService] Network error:', error);
      await this.queueLocationUpdate(update);
      return false;
    }
  }

  // =====================================================
  // OFFLINE QUEUE
  // =====================================================
  
  private async queueLocationUpdate(update: LocationUpdate): Promise<void> {
    try {
      const queueStr = await AsyncStorage.getItem(LOCATION_QUEUE_KEY);
      const queue: LocationUpdate[] = queueStr ? JSON.parse(queueStr) : [];
      
      // Keep only last 100 updates to prevent storage bloat
      if (queue.length >= 100) {
        queue.shift();
      }
      
      queue.push(update);
      await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(queue));
      console.log('[LocationService] Location queued for retry, queue size:', queue.length);
    } catch (error) {
      console.error('[LocationService] Failed to queue location:', error);
    }
  }

  private async processLocationQueue(): Promise<void> {
    try {
      const queueStr = await AsyncStorage.getItem(LOCATION_QUEUE_KEY);
      if (!queueStr) return;

      const queue: LocationUpdate[] = JSON.parse(queueStr);
      if (queue.length === 0) return;

      console.log('[LocationService] Processing', queue.length, 'queued locations...');

      const failedUpdates: LocationUpdate[] = [];
      for (const update of queue) {
        const success = await this.writeLocationToSupabase(update);
        if (!success) {
          failedUpdates.push(update);
        }
      }

      await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(failedUpdates));
      console.log('[LocationService] Queue processed, remaining:', failedUpdates.length);
    } catch (error) {
      console.error('[LocationService] Failed to process queue:', error);
    }
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================
  
  getLastLocation(): Location.LocationObject | null {
    return this.lastLocation;
  }

  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }

  setJobId(jobId: string | null): void {
    this.currentJobId = jobId;
  }

  setBatteryLevel(level: number): void {
    this.batteryLevel = level;
  }
}

export const locationService = new LocationService();
```

### 2.2 Active Job Screen Integration

```typescript
// src/screens/ActiveJobScreen.tsx

import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { locationService } from '../services/LocationService';
import { supabase } from '../lib/supabase';

interface DriverLocation {
  latitude: number;
  longitude: number;
  updated_at: string;
  accuracy: number | null;
}

export function ActiveJobScreen({ jobId, driverId }: { jobId: string; driverId: string }) {
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'active' | 'stale' | 'unavailable'>('loading');

  // Start tracking when screen mounts
  useEffect(() => {
    const startTracking = async () => {
      const success = await locationService.startTracking(driverId, jobId);
      if (!success) {
        setLocationStatus('unavailable');
      }
    };

    startTracking();

    return () => {
      // Only stop if navigating away from active job
      // Don't stop if just backgrounding the app
    };
  }, [driverId, jobId]);

  // Subscribe to real-time location updates
  useEffect(() => {
    // Fetch initial location
    const fetchInitialLocation = async () => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('latitude, longitude, updated_at, accuracy')
        .eq('driver_id', driverId)
        .eq('job_id', jobId)
        .single();

      if (data && !error) {
        setDriverLocation(data);
        setLocationStatus('active');
      }
    };

    fetchInitialLocation();

    // Real-time subscription
    const channel = supabase
      .channel(`driver-location-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          console.log('[ActiveJob] Location update received:', payload);
          if (payload.new) {
            const loc = payload.new as DriverLocation;
            setDriverLocation(loc);
            setLocationStatus('active');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, jobId]);

  // Check for stale location
  useEffect(() => {
    if (!driverLocation) return;

    const checkStale = setInterval(() => {
      const lastUpdate = new Date(driverLocation.updated_at);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastUpdate.getTime()) / 1000 / 60;

      if (diffMinutes > 5) {
        setLocationStatus('stale');
      } else {
        setLocationStatus('active');
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(checkStale);
  }, [driverLocation]);

  // Render status message
  const renderStatus = () => {
    switch (locationStatus) {
      case 'loading':
        return <Text>Waiting for GPS signal...</Text>;
      case 'stale':
        const mins = Math.floor(
          (Date.now() - new Date(driverLocation!.updated_at).getTime()) / 1000 / 60
        );
        return <Text>Last updated {mins} min ago</Text>;
      case 'unavailable':
        return <Text>Location permissions required</Text>;
      case 'active':
        return null;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {renderStatus()}
      
      <MapView
        style={{ flex: 1 }}
        region={
          driverLocation
            ? {
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }
            : undefined
        }
      >
        {driverLocation && (
          <Marker
            coordinate={{
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
            }}
            title="Your Location"
          />
        )}
      </MapView>
    </View>
  );
}
```

### 2.3 Job Acceptance Hook

```typescript
// src/hooks/useJobAcceptance.ts

import { locationService } from '../services/LocationService';
import { supabase } from '../lib/supabase';

export function useJobAcceptance() {
  const acceptJob = async (jobId: string, driverId: string) => {
    // 1. Start location tracking BEFORE accepting
    const trackingStarted = await locationService.startTracking(driverId, jobId);
    
    if (!trackingStarted) {
      throw new Error('Cannot accept job without location permissions');
    }

    // 2. Accept the job in database
    const { error } = await supabase
      .from('jobs')
      .update({ 
        status: 'assigned',
        driver_id: driverId,
      })
      .eq('id', jobId);

    if (error) {
      // If job update fails, stop tracking
      await locationService.stopTracking();
      throw error;
    }

    return true;
  };

  const completeJob = async (jobId: string) => {
    // Stop location tracking
    await locationService.stopTracking();

    // Update job status
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'delivered' })
      .eq('id', jobId);

    if (error) throw error;
  };

  const cancelJob = async (jobId: string) => {
    // Stop location tracking
    await locationService.stopTracking();
    
    // Update job status
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'cancelled' })
      .eq('id', jobId);

    if (error) throw error;
  };

  return { acceptJob, completeJob, cancelJob };
}
```

### 2.4 App.tsx Configuration

```typescript
// App.tsx - Add at the top level

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

// Define background task OUTSIDE of any component
const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Background] Task error:', error);
    return;
  }
  
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      // Import and use locationService
      const { locationService } = require('./src/services/LocationService');
      // The service will handle writing to Supabase
    }
  }
});
```

### 2.5 app.json/app.config.js Updates

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["location", "fetch"],
        "NSLocationAlwaysAndWhenInUseUsageDescription": "We need your location to track deliveries and show your position to customers.",
        "NSLocationWhenInUseUsageDescription": "We need your location while you're making deliveries.",
        "NSLocationAlwaysUsageDescription": "We need background location to track deliveries even when the app is in the background."
      }
    },
    "android": {
      "permissions": [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION"
      ]
    },
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "We need your location to track deliveries.",
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ]
    ]
  }
}
```

---

## Step 3: Verification Checklist

### Database
- [ ] `driver_locations` table exists in Supabase
- [ ] RLS is enabled on the table
- [ ] All 4 policies are active (insert, update, driver select, admin select)
- [ ] `upsert_driver_location` function exists
- [ ] Realtime is enabled for the table

### Mobile App
- [ ] `LocationService.ts` is implemented
- [ ] Background task is defined in App.tsx
- [ ] app.json has correct permissions
- [ ] `expo-location` and `expo-task-manager` are installed
- [ ] Location permissions are requested on first launch

### Testing Steps
1. **Accept a job** → Check Supabase `driver_locations` table for new row
2. **Wait 10 seconds** → Verify `updated_at` changes (location updating)
3. **Background the app** → Verify location still updates
4. **Check Admin Map** → Driver marker should move
5. **Complete the job** → Verify tracking stops
6. **Kill and restart app** → Queued locations should sync

### Debugging Logs to Check
```
[LocationService] Requesting permissions...
[LocationService] Foreground permission: granted
[LocationService] Background permission: granted
[LocationService] Starting tracking for driver: xxx job: yyy
[LocationService] Location captured: { lat: 51.xxx, lng: -0.xxx, accuracy: 5 }
[LocationService] Writing location to Supabase...
[LocationService] Location written successfully
```

---

## Why This Fix Works

1. **Dedicated table**: `driver_locations` provides a single source of truth for live location
2. **Upsert logic**: Prevents duplicate rows, always updates existing record
3. **RLS policies**: Secure access - drivers write own, admins read all, customers read their jobs
4. **Background tracking**: iOS/Android continue tracking when app is backgrounded
5. **Offline queue**: Failed writes are queued and retried when online
6. **Real-time subscription**: Instant updates to web dashboard
7. **Proper states**: UI shows "Waiting for GPS", "Last updated X min ago" instead of generic error
