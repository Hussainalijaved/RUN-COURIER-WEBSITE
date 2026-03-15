import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

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

const getApiUrl = (): string => {
  return (
    Constants.expoConfig?.extra?.apiUrl ||
    (Constants as any).manifest?.extra?.apiUrl ||
    process.env.EXPO_PUBLIC_API_URL ||
    ''
  );
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
      console.log('Push notification permission denied');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log('No EAS project ID found');
      return null;
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      return tokenData.data;
    } catch (error) {
      console.error('Failed to get push token:', error);
      return null;
    }
  }

  async saveTokenToDatabase(_driverId: string): Promise<boolean> {
    if (!this.expoPushToken) {
      console.log('No push token available');
      return false;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.log('No auth session available for push token registration');
        return false;
      }

      const apiUrl = getApiUrl();
      if (!apiUrl) {
        console.log('No API URL configured for push token registration');
        return false;
      }

      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const appVersion = Constants.expoConfig?.version || undefined;

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
        console.error('Failed to register push token via API:', response.status, errorBody);
        return false;
      }

      const result = await response.json();
      console.log('Push token registered successfully via API:', result.deviceId);
      return true;
    } catch (error) {
      console.error('Error saving push token:', error);
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
