import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Always show and play sound for ALL incoming notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export type NotificationData = {
  jobId?: string | number;
  action?: 'job_offer' | 'job_update' | 'general';
  title?: string;
  body?: string;
};

const PRODUCTION_API_URL = 'https://runcourier.co.uk';
const EAS_PROJECT_ID = 'b47c7fde-4d57-42be-bfdf-4d6d73e12f46';

const getApiUrl = (): string => {
  return (
    Constants.expoConfig?.extra?.apiUrl ||
    (Constants as any).manifest?.extra?.apiUrl ||
    process.env.EXPO_PUBLIC_API_URL ||
    PRODUCTION_API_URL
  );
};

const getEasProjectId = (): string => {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    (Constants as any).easConfig?.projectId ||
    (Constants as any).manifest2?.extra?.eas?.projectId ||
    EAS_PROJECT_ID
  );
};

class NotificationService {
  private expoPushToken: string | null = null;
  private notificationListener: Notifications.EventSubscription | null = null;
  private responseListener: Notifications.EventSubscription | null = null;

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Full initialization — call this after driver login/session restore
  // ─────────────────────────────────────────────────────────────────────────
  async initialize(): Promise<string | null> {
    console.log('[Push] ══════════════════════════════════════');
    console.log('[Push] STEP 1: Starting push notification init');
    console.log('[Push] Is physical device:', Device.isDevice);
    console.log('[Push] Platform:', Platform.OS);

    if (!Device.isDevice) {
      console.log('[Push] ⚠️  Simulator/emulator detected — push tokens not available');
      return null;
    }

    try {
      await this.setupNotificationChannel();
      const token = await this.requestPermissionAndGetToken();
      this.expoPushToken = token;
      console.log('[Push] STEP 1 RESULT:', token ? '✅ Token ready' : '❌ No token obtained');
      return token;
    } catch (error: any) {
      console.error('[Push] ❌ STEP 1 FAILED:', error?.message || error);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: Set up Android notification channels
  // ─────────────────────────────────────────────────────────────────────────
  private async setupNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    console.log('[Push] STEP 1a: Setting up Android notification channels');
    await Notifications.setNotificationChannelAsync('job-alerts', {
      name: 'Job Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lightColor: '#FF6B35',
      sound: 'notification.mp3',
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true,
    });

    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });

    console.log('[Push] ✅ Android channels created (job-alerts + default)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: Request permission, then get Expo push token
  // ─────────────────────────────────────────────────────────────────────────
  private async requestPermissionAndGetToken(): Promise<string | null> {
    // Check existing permission status
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[Push] STEP 2: Current permission status:', existingStatus);

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      console.log('[Push] STEP 2a: Requesting notification permission...');
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
      console.log('[Push] STEP 2a RESULT: Permission status after request:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] ❌ STEP 2 FAILED: Permission denied — cannot get push token');
      return null;
    }

    // Resolve EAS project ID
    const projectId = getEasProjectId();
    console.log('[Push] STEP 3: Getting Expo push token...');
    console.log('[Push] EAS Project ID:', projectId);

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;
      console.log('[Push] ✅ STEP 3 COMPLETE: Push token obtained');
      console.log('[Push] Token (first 50 chars):', token.substring(0, 50) + '...');
      return token;
    } catch (error: any) {
      console.error('[Push] ❌ STEP 3 FAILED: Could not get push token:', error?.message || error);
      console.error('[Push] This usually means FCM/APNs is not configured for this build');
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Save token to Supabase (direct upsert, no REST dependency)
  // File: services/notificationService.ts
  // Table: driver_devices
  // ─────────────────────────────────────────────────────────────────────────
  async saveTokenToDatabase(driverId: string, retryCount = 0): Promise<boolean> {
    console.log('[Push] ──────────────────────────────────────');
    console.log('[Push] STEP 4: Saving token to driver_devices table');
    console.log('[Push] Driver ID provided:', driverId);

    if (!this.expoPushToken) {
      console.log('[Push] ❌ STEP 4 SKIPPED: No push token in memory (initialize() not called or failed)');
      return false;
    }

    // ── Step 4a: Verify we have a valid Supabase session ──
    console.log('[Push] STEP 4a: Checking Supabase auth session...');
    let session: any = null;

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[Push] ❌ Session fetch error:', error.message);
      }
      session = data?.session;
    } catch (err: any) {
      console.error('[Push] ❌ Exception getting session:', err?.message || err);
    }

    if (!session?.user) {
      if (retryCount < 4) {
        const delay = (retryCount + 1) * 2000; // 2s, 4s, 6s, 8s
        console.log(`[Push] ⏳ No session yet — retry ${retryCount + 1}/4 in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return this.saveTokenToDatabase(driverId, retryCount + 1);
      }
      console.error('[Push] ❌ STEP 4a FAILED: No auth session after 4 retries — token NOT saved');
      return false;
    }

    const authUserId = session.user.id;
    console.log('[Push] ✅ STEP 4a: Session valid');
    console.log('[Push] Auth user ID (auth.uid):', authUserId);
    console.log('[Push] Driver ID (for driver_id column):', driverId);

    if (authUserId !== driverId) {
      console.warn('[Push] ⚠️  Auth user ID and driver ID differ — using auth user ID for RLS compliance');
    }

    // Use auth user ID to comply with RLS: driver_id = auth.uid()
    const deviceDriverId = authUserId;

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const appVersion = Constants.expoConfig?.version || undefined;

    console.log('[Push] STEP 4b: Upserting into driver_devices...');
    console.log('[Push] driver_id:', deviceDriverId);
    console.log('[Push] push_token (first 50):', this.expoPushToken.substring(0, 50) + '...');
    console.log('[Push] platform:', platform, '| app_version:', appVersion);

    // ── Step 4b: Direct Supabase upsert (PRIMARY PATH) ──
    try {
      const { data: upsertData, error: upsertError } = await supabase
        .from('driver_devices')
        .upsert(
          {
            driver_id: deviceDriverId,
            push_token: this.expoPushToken,
            platform,
            app_version: appVersion,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'driver_id,push_token' }
        )
        .select('id')
        .maybeSingle();

      if (upsertError) {
        console.error('[Push] ❌ Supabase upsert error:');
        console.error('[Push]    code:', upsertError.code);
        console.error('[Push]    message:', upsertError.message);
        console.error('[Push]    details:', upsertError.details);
        console.error('[Push]    hint:', upsertError.hint);
        console.log('[Push] ⚡ Falling back to REST API...');
        return this.saveTokenViaRestApi(driverId, session.access_token, retryCount);
      }

      const deviceId = upsertData?.id || 'existing record updated';
      console.log('[Push] ✅ STEP 4 COMPLETE: Token saved via Supabase upsert');
      console.log('[Push] Device record ID:', deviceId);
      console.log('[Push] ══════════════════════════════════════');
      return true;
    } catch (err: any) {
      console.error('[Push] ❌ Supabase upsert exception:', err?.message || err);
      console.log('[Push] ⚡ Falling back to REST API...');
      return this.saveTokenViaRestApi(driverId, session?.access_token, retryCount);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE FALLBACK: Save via REST API if direct Supabase fails
  // ─────────────────────────────────────────────────────────────────────────
  private async saveTokenViaRestApi(
    driverId: string,
    accessToken: string,
    retryCount: number
  ): Promise<boolean> {
    const apiUrl = getApiUrl();
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const appVersion = Constants.expoConfig?.version || undefined;

    console.log('[Push] REST FALLBACK: Calling', `${apiUrl}/api/mobile/v1/driver/push-token`);

    try {
      const response = await fetch(`${apiUrl}/api/mobile/v1/driver/push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          pushToken: this.expoPushToken,
          platform,
          appVersion,
        }),
      });

      const body = await response.text();

      if (!response.ok) {
        console.error('[Push] ❌ REST API failed:', response.status, body);
        if (retryCount < 2) {
          console.log('[Push] Retrying REST API in 5s...');
          await new Promise(r => setTimeout(r, 5000));
          return this.saveTokenViaRestApi(driverId, accessToken, retryCount + 1);
        }
        return false;
      }

      const result = JSON.parse(body);
      console.log('[Push] ✅ REST FALLBACK succeeded — deviceId:', result.deviceId);
      console.log('[Push] ══════════════════════════════════════');
      return true;
    } catch (err: any) {
      console.error('[Push] ❌ REST API exception:', err?.message || err);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Remove token on logout
  // ─────────────────────────────────────────────────────────────────────────
  async removeTokenFromDatabase(_driverId: string): Promise<void> {
    if (!this.expoPushToken) return;

    console.log('[Push] Removing push token on logout...');

    try {
      // Primary: direct Supabase delete
      const { error } = await supabase
        .from('driver_devices')
        .delete()
        .eq('push_token', this.expoPushToken);

      if (error) {
        console.warn('[Push] Supabase delete failed, trying REST:', error.message);
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const apiUrl = getApiUrl();
          await fetch(`${apiUrl}/api/mobile/v1/driver/push-token`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ pushToken: this.expoPushToken }),
          });
        }
      }

      this.expoPushToken = null;
      console.log('[Push] ✅ Push token removed');
    } catch (error: any) {
      console.error('[Push] Error removing push token:', error?.message || error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Set up foreground/tap notification listeners
  // ─────────────────────────────────────────────────────────────────────────
  setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationResponse?: (response: Notifications.NotificationResponse) => void
  ): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }

    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Push] 🔔 Notification received (foreground):', notification.request.content.title);
        onNotificationReceived?.(notification);
      }
    );

    if (onNotificationResponse) {
      this.responseListener = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          console.log('[Push] 👆 Notification tapped:', response.notification.request.content.data);
          onNotificationResponse(response);
        }
      );
    }
  }

  removeListeners(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }

  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: NotificationData,
    seconds: number = 1
  ): Promise<string | null> {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: 'notification.mp3',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: seconds > 0 ? { seconds, channelId: 'job-alerts' } : null,
      });
      return notificationId;
    } catch (error) {
      console.error('[Push] Failed to schedule local notification:', error);
      return null;
    }
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  getToken(): string | null {
    return this.expoPushToken;
  }
}

export const notificationService = new NotificationService();
