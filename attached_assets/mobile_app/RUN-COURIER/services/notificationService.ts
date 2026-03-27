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

const getApiUrl = (): string => {
  const url =
    Constants.expoConfig?.extra?.apiUrl ||
    (Constants as any).manifest?.extra?.apiUrl ||
    process.env.EXPO_PUBLIC_API_URL ||
    PRODUCTION_API_URL;
  console.log('[Push] Resolved API URL:', url);
  return url;
};

class NotificationService {
  private expoPushToken: string | null = null;
  private notificationListener: Notifications.EventSubscription | null = null;
  private responseListener: Notifications.EventSubscription | null = null;

  async initialize(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    try {
      await this.setupNotificationChannel();
      const token = await this.registerForPushNotifications();
      this.expoPushToken = token;
      return token;
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
      return null;
    }
  }

  private async setupNotificationChannel(): Promise<void> {
    if (Platform.OS === 'android') {
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
    }
  }

  private async registerForPushNotifications(): Promise<string | null> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission denied — cannot get push token');
      return null;
    }

    // Try multiple paths for the project ID across expo-constants versions
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      (Constants as any).easConfig?.projectId ||
      (Constants as any).manifest2?.extra?.eas?.projectId ||
      'b47c7fde-4d57-42be-bfdf-4d6d73e12f46'; // hardcoded fallback

    console.log('[Push] Using EAS project ID:', projectId);

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      console.log('[Push] Token obtained successfully:', tokenData.data.substring(0, 40) + '...');
      return tokenData.data;
    } catch (error) {
      console.error('[Push] Failed to get push token:', error);
      return null;
    }
  }

  async saveTokenToDatabase(_driverId: string, retryCount = 0): Promise<boolean> {
    if (!this.expoPushToken) {
      console.log('[Push] No push token available to save');
      return false;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.log('[Push] No auth session — retrying in 3s (attempt', retryCount + 1, ')');
        if (retryCount < 3) {
          await new Promise(r => setTimeout(r, 3000));
          return this.saveTokenToDatabase(_driverId, retryCount + 1);
        }
        console.error('[Push] No auth session after retries — token NOT registered');
        return false;
      }

      const apiUrl = getApiUrl();
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const appVersion = Constants.expoConfig?.version || undefined;

      console.log('[Push] Registering token:', this.expoPushToken.substring(0, 30) + '...');
      console.log('[Push] Platform:', platform, '| Version:', appVersion);
      console.log('[Push] Endpoint:', `${apiUrl}/api/mobile/v1/driver/push-token`);

      const response = await fetch(`${apiUrl}/api/mobile/v1/driver/push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pushToken: this.expoPushToken,
          platform,
          appVersion,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown error');
        console.error('[Push] Failed to register push token:', response.status, errorBody);
        if (retryCount < 2) {
          console.log('[Push] Retrying registration in 5s...');
          await new Promise(r => setTimeout(r, 5000));
          return this.saveTokenToDatabase(_driverId, retryCount + 1);
        }
        return false;
      }

      const result = await response.json();
      console.log('[Push] Token registered successfully — deviceId:', result.deviceId);
      return true;
    } catch (error) {
      console.error('[Push] Error saving push token:', error);
      if (retryCount < 2) {
        console.log('[Push] Retrying in 5s after error...');
        await new Promise(r => setTimeout(r, 5000));
        return this.saveTokenToDatabase(_driverId, retryCount + 1);
      }
      return false;
    }
  }

  async removeTokenFromDatabase(_driverId: string): Promise<void> {
    if (!this.expoPushToken) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return;
      }

      const apiUrl = getApiUrl();
      if (!apiUrl) {
        return;
      }

      await fetch(`${apiUrl}/api/mobile/v1/driver/push-token`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pushToken: this.expoPushToken,
        }),
      });

      console.log('Push token unregistered');
    } catch (error) {
      console.error('Error removing push token:', error);
    }
  }

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
        console.log('[Push] Notification received:', notification.request.content.title);
        onNotificationReceived?.(notification);
      }
    );

    if (onNotificationResponse) {
      this.responseListener = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          console.log('[Push] Notification tapped:', response.notification.request.content.data);
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
      console.error('Failed to schedule notification:', error);
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
