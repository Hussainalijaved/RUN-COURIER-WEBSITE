import { Platform } from 'react-native';

let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export async function playNotificationSound(): Promise<void> {
  if (!soundEnabled) return;
  
  try {
    if (Platform.OS === 'web') {
      const audio = new window.Audio('/assets/sounds/notification.mp3');
      audio.volume = 1.0;
      await audio.play();
    }
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
}

export async function testSound(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      const audio = new window.Audio('/assets/sounds/notification.mp3');
      audio.volume = 1.0;
      await audio.play();
    }
  } catch (error) {
    console.error('Error playing test sound:', error);
  }
}
