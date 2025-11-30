import { Loader } from '@googlemaps/js-api-loader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

let loader: Loader | null = null;
let google: typeof window.google | null = null;

export async function initGoogleMaps(): Promise<typeof window.google> {
  if (google) return google;
  
  if (!loader) {
    loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places', 'geometry'],
    });
  }
  
  google = await loader.load();
  return google;
}

export async function geocodePostcode(postcode: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
} | null> {
  try {
    const g = await initGoogleMaps();
    const geocoder = new g.maps.Geocoder();
    
    return new Promise((resolve) => {
      geocoder.geocode(
        { address: `${postcode}, UK` },
        (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const location = results[0].geometry.location;
            resolve({
              lat: location.lat(),
              lng: location.lng(),
              formattedAddress: results[0].formatted_address,
            });
          } else {
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
    const g = await initGoogleMaps();
    const service = new g.maps.DistanceMatrixService();
    
    return new Promise((resolve) => {
      service.getDistanceMatrix(
        {
          origins: [new g.maps.LatLng(origin.lat, origin.lng)],
          destinations: [new g.maps.LatLng(destination.lat, destination.lng)],
          travelMode: g.maps.TravelMode.DRIVING,
          unitSystem: g.maps.UnitSystem.IMPERIAL,
        },
        (response, status) => {
          if (status === 'OK' && response?.rows[0]?.elements[0]?.status === 'OK') {
            const element = response.rows[0].elements[0];
            const distanceInMiles = element.distance.value / 1609.34;
            const durationInMinutes = element.duration.value / 60;
            resolve({
              distance: Math.round(distanceInMiles * 10) / 10,
              duration: Math.round(durationInMinutes),
            });
          } else {
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
    const g = await initGoogleMaps();
    const service = new g.maps.places.AutocompleteService();
    
    return new Promise((resolve) => {
      service.getPlacePredictions(
        {
          input,
          componentRestrictions: { country: 'uk' },
          types: ['postal_code', 'geocode'],
        },
        (predictions, status) => {
          if (status === 'OK' && predictions) {
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
