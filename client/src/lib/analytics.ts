declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    trackConversion?: (label: string) => void;
  }
}

export function trackConversion(label: string): void {
  if (typeof window !== 'undefined' && window.trackConversion) {
    window.trackConversion(label);
  }
}

export function trackPageView(pagePath: string): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', 'AW-4080602084', {
      page_path: pagePath
    });
  }
}

export function trackEvent(eventName: string, params?: Record<string, any>): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}
