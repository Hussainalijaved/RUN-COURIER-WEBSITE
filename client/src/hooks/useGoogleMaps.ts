import { useState, useEffect, useCallback, useRef } from 'react';
import { isGoogleMapsConfigured } from '@/lib/env-validation';
import { isBrowser, isGoogleMapsLoaded } from '@/lib/browser';

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
let authFailureDetected = false;
let authFailureCallbacks: ((error: string) => void)[] = [];

// Google Maps calls this global function when there's an authentication error
if (typeof window !== 'undefined') {
  (window as any).gm_authFailure = () => {
    authFailureDetected = true;
    const errorMsg = 'Google Maps API key is blocked for this domain. Please add this domain to your API key settings in Google Cloud Console.';
    console.error('[Google Maps] Auth failure detected:', errorMsg);
    authFailureCallbacks.forEach(cb => cb(errorMsg));
  };
}

function resetLoader(): void {
  googleMapsPromise = null;
  loadAttempts = 0;
  authFailureDetected = false;
  if (isBrowser) {
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.remove();
    }
  }
}

async function loadGoogleMaps(): Promise<void> {
  if (!isBrowser) {
    throw new Error('Google Maps can only be loaded in browser environment');
  }

  if (isGoogleMapsLoaded()) {
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
      if (isGoogleMapsLoaded()) {
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
  const mountedRef = useRef(true);

  const handleAuthFailure = useCallback((errorMsg: string) => {
    if (mountedRef.current) {
      setStatus('error');
      setError(errorMsg);
    }
  }, []);

  const load = useCallback(async () => {
    if (!isBrowser) {
      return;
    }

    // Check if auth failure was already detected
    if (authFailureDetected) {
      setStatus('error');
      setError('Google Maps API key is blocked for this domain. Please add this domain to your API key settings in Google Cloud Console.');
      return;
    }

    if (!isGoogleMapsConfigured()) {
      setStatus('unconfigured');
      setError('Google Maps API key is not configured');
      return;
    }

    if (isGoogleMapsLoaded()) {
      setStatus('ready');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      await loadGoogleMaps();
      // Check again after loading in case auth failure was triggered
      if (authFailureDetected) {
        setStatus('error');
        setError('Google Maps API key is blocked for this domain. Please add this domain to your API key settings in Google Cloud Console.');
      } else {
        setStatus('ready');
      }
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
    mountedRef.current = true;
    
    // Register for auth failure callbacks
    authFailureCallbacks.push(handleAuthFailure);
    
    load();
    
    return () => {
      mountedRef.current = false;
      const index = authFailureCallbacks.indexOf(handleAuthFailure);
      if (index > -1) {
        authFailureCallbacks.splice(index, 1);
      }
    };
  }, [load, handleAuthFailure]);

  return {
    status,
    error,
    isReady: status === 'ready' && !authFailureDetected,
    retry,
  };
}

export { resetLoader as resetGoogleMapsLoader };
