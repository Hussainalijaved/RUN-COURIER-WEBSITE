/// <reference types="@types/google.maps" />

export async function initGoogleMaps(): Promise<void> {
  // No longer needed - using server-side API
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
