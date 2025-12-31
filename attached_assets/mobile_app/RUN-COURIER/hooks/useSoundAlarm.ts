import { Platform } from 'react-native';
import { useCallback, useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';

let globalSoundEnabled = true;
let globalRepeatIntervalId: NodeJS.Timeout | null = null;

export function setSoundEnabled(enabled: boolean) {
  globalSoundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return globalSoundEnabled;
}

export function stopGlobalRepeatingAlarm() {
  if (globalRepeatIntervalId) {
    clearInterval(globalRepeatIntervalId);
    globalRepeatIntervalId = null;
  }
}

let webAudioContext: AudioContext | null = null;

function getWebAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web') return null;
  
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    
    if (!webAudioContext || webAudioContext.state === 'closed') {
      webAudioContext = new AudioContextClass();
    }
    
    if (webAudioContext && webAudioContext.state === 'suspended') {
      webAudioContext.resume();
    }
    
    return webAudioContext;
  } catch (error) {
    console.log('Failed to get AudioContext:', error);
    return null;
  }
}

const notificationSound = Platform.OS !== 'web' 
  ? require('../assets/sounds/notification.mp3')
  : null;

export function useSoundAlarm() {
  const nativePlayer = useAudioPlayer(notificationSound);
  const webOscillatorRef = useRef<OscillatorNode | null>(null);
  const repeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (repeatIntervalRef.current) {
        clearInterval(repeatIntervalRef.current);
        repeatIntervalRef.current = null;
      }
    };
  }, []);

  const playWebBeep = useCallback(() => {
    if (Platform.OS !== 'web') return;
    
    const audioContext = getWebAudioContext();
    if (!audioContext) {
      console.log('Web Audio API not supported');
      return;
    }
    
    try {
      if (webOscillatorRef.current) {
        try {
          webOscillatorRef.current.stop();
          webOscillatorRef.current.disconnect();
        } catch (e) {}
        webOscillatorRef.current = null;
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      
      webOscillatorRef.current = oscillator;
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
      
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
        webOscillatorRef.current = null;
      };
      
      setTimeout(() => {
        const ctx = getWebAudioContext();
        if (!ctx) return;
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.5, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.4);
        
        osc2.onended = () => {
          osc2.disconnect();
          gain2.disconnect();
        };
      }, 200);
    } catch (error) {
      console.log('Web beep failed:', error);
    }
  }, []);

  const playNativeSound = useCallback(async () => {
    if (Platform.OS === 'web') return;
    
    try {
      if (nativePlayer) {
        nativePlayer.seekTo(0);
        nativePlayer.play();
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.log('Native sound failed, using haptics only:', error);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {
        console.log('Haptics also failed');
      }
    }
  }, [nativePlayer]);

  const playAlarm = useCallback(async () => {
    if (!globalSoundEnabled) return;
    
    try {
      if (Platform.OS === 'web') {
        playWebBeep();
      } else {
        await playNativeSound();
      }
    } catch (error) {
      console.error('Error playing alarm:', error);
    }
  }, [playWebBeep, playNativeSound]);

  const startRepeatingAlarm = useCallback((intervalMs: number = 3000) => {
    if (!globalSoundEnabled) return;
    
    stopGlobalRepeatingAlarm();
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
    }
    
    playAlarm();
    
    const intervalId = setInterval(() => {
      if (globalSoundEnabled) {
        playAlarm();
      }
    }, intervalMs);
    
    repeatIntervalRef.current = intervalId;
    globalRepeatIntervalId = intervalId;
  }, [playAlarm]);

  const stopRepeatingAlarm = useCallback(() => {
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
    stopGlobalRepeatingAlarm();
  }, []);

  const testAlarm = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        playWebBeep();
      } else {
        await playNativeSound();
      }
    } catch (error) {
      console.error('Error playing test alarm:', error);
    }
  }, [playWebBeep, playNativeSound]);

  return {
    playAlarm,
    startRepeatingAlarm,
    stopRepeatingAlarm,
    testAlarm,
    setSoundEnabled,
    isSoundEnabled,
  };
}
