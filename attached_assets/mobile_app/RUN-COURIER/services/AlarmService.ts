import { Platform } from 'react-native';

let soundInstance: any = null;
let currentJobId: string | null = null;
let repeatIntervalId: NodeJS.Timeout | null = null;
let safetyTimeoutId: NodeJS.Timeout | null = null;

const SAFETY_TIMEOUT_MS = 90000;

async function loadSound(): Promise<any> {
  if (Platform.OS === 'web') return null;
  try {
    const { Audio } = require('expo-av');
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/sounds/notification.mp3'),
      { shouldPlay: false, isLooping: false }
    );
    return sound;
  } catch (e) {
    console.log('[AlarmService] Failed to load sound:', e);
    return null;
  }
}

let webAudioContext: AudioContext | null = null;

function playWebBeep() {
  if (Platform.OS !== 'web') return;
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!webAudioContext || webAudioContext.state === 'closed') {
      webAudioContext = new AudioContextClass();
    }
    if (webAudioContext && webAudioContext.state === 'suspended') {
      webAudioContext.resume();
    }
    if (!webAudioContext) return;

    const oscillator = webAudioContext.createOscillator();
    const gainNode = webAudioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(webAudioContext.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.5, webAudioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, webAudioContext.currentTime + 0.4);
    oscillator.start(webAudioContext.currentTime);
    oscillator.stop(webAudioContext.currentTime + 0.4);
    oscillator.onended = () => { oscillator.disconnect(); gainNode.disconnect(); };

    setTimeout(() => {
      if (!webAudioContext) return;
      const osc2 = webAudioContext.createOscillator();
      const gain2 = webAudioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(webAudioContext.destination);
      osc2.frequency.value = 1100;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.5, webAudioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, webAudioContext.currentTime + 0.4);
      osc2.start(webAudioContext.currentTime);
      osc2.stop(webAudioContext.currentTime + 0.4);
      osc2.onended = () => { osc2.disconnect(); gain2.disconnect(); };
    }, 200);
  } catch (e) {
    console.log('[AlarmService] Web beep failed:', e);
  }
}

async function playOnce() {
  if (Platform.OS === 'web') {
    playWebBeep();
    return;
  }
  try {
    if (!soundInstance) {
      soundInstance = await loadSound();
    }
    if (soundInstance) {
      await soundInstance.setPositionAsync(0);
      await soundInstance.playAsync();
    }
    const Haptics = require('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    console.log('[AlarmService] playOnce error:', e);
  }
}

const AlarmService = {
  get currentJobId() {
    return currentJobId;
  },

  start(jobId: string) {
    if (currentJobId === jobId && repeatIntervalId) {
      console.log(`[AlarmService] Already ringing for job ${jobId}, skipping`);
      return;
    }

    AlarmService.stop('replacing with new job');
    currentJobId = jobId;
    console.log(`[AlarmService] ALARM START - jobId: ${jobId}`);

    playOnce();
    repeatIntervalId = setInterval(() => {
      if (currentJobId === jobId) {
        playOnce();
      } else {
        AlarmService.stop('jobId mismatch in interval');
      }
    }, 4000);

    safetyTimeoutId = setTimeout(() => {
      console.log(`[AlarmService] Safety timeout reached (${SAFETY_TIMEOUT_MS}ms) - auto-stopping`);
      AlarmService.stop('safety timeout');
    }, SAFETY_TIMEOUT_MS);
  },

  stop(reason: string = 'unknown') {
    console.log(`[AlarmService] ALARM STOP - jobId: ${currentJobId}, reason: ${reason}`);

    if (repeatIntervalId) {
      clearInterval(repeatIntervalId);
      repeatIntervalId = null;
    }
    if (safetyTimeoutId) {
      clearTimeout(safetyTimeoutId);
      safetyTimeoutId = null;
    }
    currentJobId = null;

    if (soundInstance) {
      try {
        soundInstance.stopAsync().catch(() => {});
      } catch (_) {}
    }
  },

  isRinging(): boolean {
    return currentJobId !== null && repeatIntervalId !== null;
  },

  stopIfJob(jobId: string, reason: string) {
    if (currentJobId === jobId) {
      AlarmService.stop(reason);
    }
  },
};

export default AlarmService;
