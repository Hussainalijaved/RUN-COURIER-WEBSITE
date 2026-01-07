/// <reference types="@types/google.maps" />
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<boolean> {
  if (isInitialized) return true;
  
  if (!apiKey) {
    console.error('Google Maps API key is not configured');
    return false;
  }
  
  if (initPromise) {
    await initPromise;
    return isInitialized;
  }
  
  initPromise = (async () => {
    try {
      setOptions({
        key: apiKey,
        v: 'weekly',
      });
      
      await importLibrary('maps');
      await importLibrary('places');
      await importLibrary('geometry');
      isInitialized = true;
    } catch (error) {
      console.error('Failed to load Google Maps:', error);
      isInitialized = false;
    }
  })();
  
  await initPromise;
  return isInitialized;
}

export async function initGoogleMaps(): Promise<void> {
  await ensureLoaded();
}

export async function geocodePostcode(postcode: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
} | null> {
  try {
    const loaded = await ensureLoaded();
    if (!loaded) return null;
    
    const geocoder = new google.maps.Geocoder();
    
    return new Promise((resolve) => {
      geocoder.geocode(
        { address: `${postcode}, UK` },
        (
          results: google.maps.GeocoderResult[] | null,
          status: google.maps.GeocoderStatus
        ) => {
          if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
            const location = results[0].geometry.location;
            resolve({
              lat: location.lat(),
              lng: location.lng(),
              formattedAddress: results[0].formatted_address,
            });
          } else {
            console.error('Geocoding failed:', status);
            resolve(null);
          }
        }
      );
    });
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
    const loaded = await ensureLoaded();
    if (!loaded) return null;
    
    const service = new google.maps.DistanceMatrixService();
    
    return new Promise((resolve) => {
      service.getDistanceMatrix(
        {
          origins: [new google.maps.LatLng(origin.lat, origin.lng)],
          destinations: [new google.maps.LatLng(destination.lat, destination.lng)],
          travelMode: google.maps.TravelMode.DRIVING,
          unitSystem: google.maps.UnitSystem.IMPERIAL,
        },
        (
          response: google.maps.DistanceMatrixResponse | null,
          status: google.maps.DistanceMatrixStatus
        ) => {
          if (
            status === google.maps.DistanceMatrixStatus.OK &&
            response?.rows[0]?.elements[0]?.status === 'OK'
          ) {
            const element = response.rows[0].elements[0];
            const distanceInMiles = element.distance.value / 1609.34;
            const durationInMinutes = element.duration.value / 60;
            resolve({
              distance: Math.round(distanceInMiles * 10) / 10,
              duration: Math.round(durationInMinutes),
            });
          } else {
            console.error('Distance calculation failed:', status);
            resolve(null);
          }
        }
      );
    });
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
    const loaded = await ensureLoaded();
    if (!loaded) return [];
    
    const service = new google.maps.places.AutocompleteService();
    
    return new Promise((resolve) => {
      service.getPlacePredictions(
        {
          input,
          componentRestrictions: { country: 'gb' },
          types: ['geocode'],
        },
        (
          predictions: google.maps.places.AutocompletePrediction[] | null,
          status: google.maps.places.PlacesServiceStatus
        ) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            resolve(
              predictions.map((p) => ({
                description: p.description,
                placeId: p.place_id,
              }))
            );
          } else {
            resolve([]);
          }
        }
      );
    });
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

export interface RouteLeg {
  from: string;
  to: string;
  fromPostcode: string;
  toPostcode: string;
  distance: number;
  duration: number;
}

export interface RouteResult {
  legs: RouteLeg[];
  totalDistance: number;
  totalDuration: number;
}

export async function calculateRouteWithWaypoints(
  pickupPostcode: string,
  dropPostcodes: string[]
): Promise<RouteResult | null> {
  try {
    const loaded = await ensureLoaded();
    if (!loaded) return null;

    // First geocode all postcodes
    const pickupGeo = await geocodePostcode(pickupPostcode);
    if (!pickupGeo) return null;

    const dropGeos: Array<{ lat: number; lng: number; formattedAddress: string; postcode: string }> = [];
    for (const postcode of dropPostcodes) {
      const geo = await geocodePostcode(postcode);
      if (!geo) return null;
      dropGeos.push({ ...geo, postcode });
    }

    // Build route by calculating distance between each consecutive point
    const legs: RouteLeg[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    // All points in order: pickup -> drop1 -> drop2 -> ... -> dropN
    const allPoints = [
      { ...pickupGeo, postcode: pickupPostcode },
      ...dropGeos,
    ];

    for (let i = 0; i < allPoints.length - 1; i++) {
      const from = allPoints[i];
      const to = allPoints[i + 1];

      const distResult = await calculateDistance(
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng }
      );

      if (!distResult) {
        console.error('Could not calculate distance between points');
        return null;
      }

      legs.push({
        from: from.formattedAddress,
        to: to.formattedAddress,
        fromPostcode: from.postcode,
        toPostcode: to.postcode,
        distance: distResult.distance,
        duration: distResult.duration,
      });

      totalDistance += distResult.distance;
      totalDuration += distResult.duration;
    }

    return { legs, totalDistance, totalDuration };
  } catch (error) {
    console.error('Route calculation error:', error);
    return null;
  }
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
