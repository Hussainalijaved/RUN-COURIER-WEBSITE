import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BACKGROUND_LOCATION_TASK = 'bg-driver-location';

const BG_TOKEN_KEY = '@bg_auth_token';
const BG_DRIVER_ID_KEY = '@bg_driver_id';
const BG_JOB_ID_KEY = '@bg_job_id';
const BG_IS_ONLINE_KEY = '@bg_is_online';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

// ─── MUST be defined at module-level so it is registered before any component mounts ───
TaskManager.defineTask(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error) {
      console.error('[BGLocation] Task error:', error.message);
      return;
    }
    if (!data) return;

    const { locations } = data;
    if (!locations || locations.length === 0) return;

    const location = locations[locations.length - 1];

    try {
      const [token, driverId, jobId, isOnlineStr] = await Promise.all([
        AsyncStorage.getItem(BG_TOKEN_KEY),
        AsyncStorage.getItem(BG_DRIVER_ID_KEY),
        AsyncStorage.getItem(BG_JOB_ID_KEY),
        AsyncStorage.getItem(BG_IS_ONLINE_KEY),
      ]);

      if (!token || !driverId) return;

      const payload: Record<string, any> = {
        driverId,
        isOnline: isOnlineStr !== 'false',
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        heading: location.coords.heading,
        speed: location.coords.speed,
      };
      if (jobId) payload.jobId = jobId;

      await fetch(`${API_URL}/api/driver/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Silent — background tasks must never throw
    }
  },
);

// ─── Persist driver context so the background task can read it ───────────────
export async function saveDriverContextForBg(
  token: string,
  driverId: string,
  jobId?: string | null,
  isOnline = true,
): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(BG_TOKEN_KEY, token),
    AsyncStorage.setItem(BG_DRIVER_ID_KEY, driverId),
    AsyncStorage.setItem(BG_IS_ONLINE_KEY, isOnline ? 'true' : 'false'),
    jobId
      ? AsyncStorage.setItem(BG_JOB_ID_KEY, String(jobId))
      : AsyncStorage.removeItem(BG_JOB_ID_KEY),
  ]);
}

export async function clearDriverContextForBg(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(BG_TOKEN_KEY),
    AsyncStorage.removeItem(BG_DRIVER_ID_KEY),
    AsyncStorage.removeItem(BG_JOB_ID_KEY),
    AsyncStorage.setItem(BG_IS_ONLINE_KEY, 'false'),
  ]);
}

// ─── Request background permission (call AFTER foreground is already granted) ─
export async function requestBackgroundPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ─── Start background location updates ───────────────────────────────────────
export async function startBackgroundLocationTracking(): Promise<boolean> {
  try {
    const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (already) return true;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,       // every 30 seconds
      distanceInterval: 50,      // or every 50 metres
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true, // iOS: shows blue status bar
      foregroundService: {        // Android: keeps the process alive
        notificationTitle: 'Run Courier',
        notificationBody: 'Tracking your location for active deliveries',
        notificationColor: '#FF6B35',
      },
    });

    console.log('[BGLocation] Background tracking started');
    return true;
  } catch (err) {
    console.error('[BGLocation] Failed to start:', err);
    return false;
  }
}

// ─── Stop background location updates ────────────────────────────────────────
export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (running) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('[BGLocation] Background tracking stopped');
    }
  } catch (err) {
    console.error('[BGLocation] Failed to stop:', err);
  }
}
