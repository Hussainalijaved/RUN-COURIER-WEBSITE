const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

interface GeocodingResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('[Geocoding] No Google Maps API key configured');
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address + ', UK');
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results[0]) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: data.results[0].formatted_address,
      };
    } else {
      console.error('[Geocoding] Failed:', data.status, address);
      return null;
    }
  } catch (error) {
    console.error('[Geocoding] Error:', error);
    return null;
  }
}

export async function geocodePostcode(postcode: string): Promise<GeocodingResult | null> {
  return geocodeAddress(postcode);
}
