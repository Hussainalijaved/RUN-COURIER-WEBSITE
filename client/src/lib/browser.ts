export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export const isGoogleMapsLoaded = (): boolean => {
  return isBrowser && typeof google !== 'undefined' && google.maps !== undefined;
};

export function safeWindow(): Window | null {
  return isBrowser ? window : null;
}

export function safeDocument(): Document | null {
  return isBrowser ? document : null;
}
