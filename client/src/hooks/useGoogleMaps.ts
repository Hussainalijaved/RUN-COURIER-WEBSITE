import { useState, useEffect, useCallback } from 'react';
import { isGoogleMapsConfigured } from '@/lib/env-validation';

export type GoogleMapsStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unconfigured';

interface UseGoogleMapsResult {
  status: GoogleMapsStatus;
  error: string | null;
  isReady: boolean;
  retry: () => void;
}

let googleMapsPromise: Promise<void> | null = null;
let loadAttempts = 0;
const MAX_LOAD_ATTEMPTS = 3;

function resetLoader(): void {
  googleMapsPromise = null;
  loadAttempts = 0;
  if (typeof document !== 'undefined') {
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.remove();
    }
  }
}

async function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Google Maps can only be loaded in browser environment');
  }

  if (typeof google !== 'undefined' && google.maps) {
    return;
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]') as HTMLScriptElement | null;
    if (existingScript) {
      if (typeof google !== 'undefined' && google.maps) {
        resolve();
        return;
      }
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => {
        existingScript.remove();
        googleMapsPromise = null;
        reject(new Error('Failed to load Google Maps'));
      });
      return;
    }

    loadAttempts++;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      loadAttempts = 0;
      resolve();
    };

    script.onerror = () => {
      script.remove();
      googleMapsPromise = null;
      if (loadAttempts < MAX_LOAD_ATTEMPTS) {
        reject(new Error('Failed to load Google Maps. Retry available.'));
      } else {
        reject(new Error(`Failed to load Google Maps after ${MAX_LOAD_ATTEMPTS} attempts.`));
      }
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export function useGoogleMaps(): UseGoogleMapsResult {
  const [status, setStatus] = useState<GoogleMapsStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isGoogleMapsConfigured()) {
      setStatus('unconfigured');
      setError('Google Maps API key is not configured');
      return;
    }

    if (typeof google !== 'undefined' && google.maps) {
      setStatus('ready');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      await loadGoogleMaps();
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load Google Maps');
    }
  }, []);

  const retry = useCallback(() => {
    resetLoader();
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    status,
    error,
    isReady: status === 'ready',
    retry,
  };
}

export { resetLoader as resetGoogleMapsLoader };
