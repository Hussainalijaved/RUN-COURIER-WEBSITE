/// <reference types="@types/google.maps" />

let googleMapsPromise: Promise<void> | null = null;
let loadAttempts = 0;
const MAX_LOAD_ATTEMPTS = 3;

export async function initGoogleMaps(): Promise<void> {
  // If already loaded, return immediately
  if (typeof google !== 'undefined' && google.maps) {
    return;
  }
  
  // If already loading, wait for it
  if (googleMapsPromise) {
    return googleMapsPromise;
  }
  
  // Load Google Maps script
  googleMapsPromise = new Promise((resolve, reject) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.error('VITE_GOOGLE_MAPS_API_KEY is not configured');
      googleMapsPromise = null; // Reset to allow retry
      reject(new Error('Google Maps API key not configured'));
      return;
    }
    
    // Check if script already exists
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]') as HTMLScriptElement | null;
    if (existingScript) {
      // Wait for existing script to load
      if (typeof google !== 'undefined' && google.maps) {
        resolve();
        return;
      }
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => {
        // Remove failed script and reset for retry
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
      console.log('Google Maps loaded successfully');
      loadAttempts = 0; // Reset on success
      resolve();
    };
    
    script.onerror = () => {
      console.error('Failed to load Google Maps script (attempt ' + loadAttempts + '/' + MAX_LOAD_ATTEMPTS + ')');
      // Remove failed script and reset promise to allow retry
      script.remove();
      googleMapsPromise = null;
      
      if (loadAttempts < MAX_LOAD_ATTEMPTS) {
        reject(new Error('Failed to load Google Maps. Retry available.'));
      } else {
        reject(new Error('Failed to load Google Maps after ' + MAX_LOAD_ATTEMPTS + ' attempts. Please refresh the page.'));
      }
    };
    
    document.head.appendChild(script);
  });
  
  return googleMapsPromise;
}

// Helper to reset map loader for manual retry
export function resetGoogleMapsLoader(): void {
  googleMapsPromise = null;
  loadAttempts = 0;
  const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
  if (existingScript) {
    existingScript.remove();
  }
}

export async function geocodePostcode(postcode: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
} | null> {
  try {
    const response = await fetch(`/api/maps/geocode?address=${encodeURIComponent(postcode + ', UK')}`);
    
    if (!response.ok) {
      console.error('Geocoding failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results[0]) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: data.results[0].formatted_address,
      };
    } else {
      console.error('Geocoding failed:', data.status);
      return null;
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function calculateDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ distance: number; duration: number } | null> {
  try {
    const origins = `${origin.lat},${origin.lng}`;
    const destinations = `${destination.lat},${destination.lng}`;
    
    const response = await fetch(`/api/maps/distance?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}`);
    
    if (!response.ok) {
      console.error('Distance calculation failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
      const element = data.rows[0].elements[0];
      const distanceInMiles = element.distance.value / 1609.34;
      const durationInMinutes = element.duration.value / 60;
      return {
        distance: Math.round(distanceInMiles * 10) / 10,
        duration: Math.round(durationInMinutes),
      };
    } else {
      console.error('Distance calculation failed:', data.status);
      return null;
    }
  } catch (error) {
    console.error('Distance calculation error:', error);
    return null;
  }
}

export async function getPlacePredictions(
  input: string
): Promise<Array<{ description: string; placeId: string }>> {
  if (!input || input.length < 2) return [];
  
  try {
    const response = await fetch(`/api/maps/autocomplete?input=${encodeURIComponent(input)}`);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    
    if (data.predictions && data.predictions.length > 0) {
      return data.predictions.map((p: any) => ({
        description: p.description,
        placeId: p.place_id,
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Autocomplete error:', error);
    return [];
  }
}

export function getMapCenter(): { lat: number; lng: number } {
  return { lat: 51.5074, lng: -0.1278 };
}

export interface DriverMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicleType: string;
  isAvailable: boolean;
}

export function calculateETA(durationMinutes: number): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + durationMinutes);
  return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export async function calculateDistanceFromPostcodes(
  pickupPostcode: string,
  deliveryPostcode: string
): Promise<{ distance: number; duration: number; pickupAddress: string; deliveryAddress: string } | null> {
  try {
    const pickup = await geocodePostcode(pickupPostcode);
    const delivery = await geocodePostcode(deliveryPostcode);
    
    if (!pickup || !delivery) {
      console.error('Could not geocode postcodes');
      return null;
    }
    
    const result = await calculateDistance(
      { lat: pickup.lat, lng: pickup.lng },
      { lat: delivery.lat, lng: delivery.lng }
    );
    
    if (!result) {
      return null;
    }
    
    return {
      distance: result.distance,
      duration: result.duration,
      pickupAddress: pickup.formattedAddress,
      deliveryAddress: delivery.formattedAddress,
    };
  } catch (error) {
    console.error('Error calculating distance from postcodes:', error);
    return null;
  }
}
