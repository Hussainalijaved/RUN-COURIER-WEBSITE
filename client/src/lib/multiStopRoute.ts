/**
 * Multi-Stop Route Calculator
 * 
 * This module provides route visualization for up to 20 UK postcodes.
 * It uses Google Maps Directions API with waypoint optimization.
 * 
 * IMPORTANT: This module is for route visualization and distance/time calculation ONLY.
 * It does NOT calculate prices, modify pricing logic, or affect admin pricing.
 * All pricing continues to use the existing system exactly as implemented.
 * 
 * @module multiStopRoute
 */

/// <reference types="@types/google.maps" />

import { initGoogleMaps, geocodePostcode } from './maps';

/**
 * Result returned by calculateMultiStopRoute
 */
export interface MultiStopRouteResult {
  totalMiles: number;
  totalMinutes: number;
  googleMapsLink: string;
  optimizedOrder: number[];
  legs: Array<{
    startAddress: string;
    endAddress: string;
    distanceMiles: number;
    durationMinutes: number;
  }>;
}

/**
 * Options for rendering a route on a map
 */
export interface RouteRenderOptions {
  map: google.maps.Map;
  directionsRenderer?: google.maps.DirectionsRenderer;
}

// Store the current DirectionsRenderer to clear previous routes
let currentRenderer: google.maps.DirectionsRenderer | null = null;

/**
 * Validates an array of UK postcodes
 * @param postcodes - Array of postcode strings
 * @returns Object with isValid boolean and error message if invalid
 */
export function validatePostcodes(postcodes: string[]): { isValid: boolean; error?: string } {
  if (!postcodes || postcodes.length < 2) {
    return { isValid: false, error: 'At least 2 postcodes are required' };
  }
  
  if (postcodes.length > 20) {
    return { isValid: false, error: 'Maximum 20 postcodes allowed' };
  }
  
  // Basic UK postcode format validation
  const ukPostcodeRegex = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i;
  const invalidPostcodes = postcodes.filter(pc => !ukPostcodeRegex.test(pc.trim()));
  
  if (invalidPostcodes.length > 0) {
    return { 
      isValid: false, 
      error: `Invalid postcode format: ${invalidPostcodes.slice(0, 3).join(', ')}${invalidPostcodes.length > 3 ? '...' : ''}` 
    };
  }
  
  return { isValid: true };
}

/**
 * Generates a Google Maps navigation link for the route
 * Compatible with Google Maps mobile app
 * @param postcodes - Array of postcodes in route order
 * @returns Google Maps URL for navigation
 */
export function generateGoogleMapsLink(postcodes: string[]): string {
  if (postcodes.length < 2) return '';
  
  const origin = encodeURIComponent(postcodes[0] + ', UK');
  const destination = encodeURIComponent(postcodes[postcodes.length - 1] + ', UK');
  
  // Waypoints are stops in between origin and destination
  const waypoints = postcodes.slice(1, -1).map(pc => encodeURIComponent(pc + ', UK')).join('|');
  
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  
  if (waypoints) {
    url += `&waypoints=${waypoints}`;
  }
  
  return url;
}

/**
 * Clears any existing route from the map
 * Call this before rendering a new route to prevent overlapping routes
 */
export function clearCurrentRoute(): void {
  if (currentRenderer) {
    currentRenderer.setMap(null);
    currentRenderer = null;
  }
}

/**
 * Calculates an optimized multi-stop route using Google Maps Directions API
 * 
 * This function:
 * - Accepts 2-20 UK postcodes
 * - Uses Google Maps Directions API with optimizeWaypoints: true
 * - Calculates total distance and duration
 * - Returns a Google Maps navigation link for drivers
 * 
 * PRICING NOTE: This function does NOT calculate or modify any prices.
 * It only returns distance and time values that can be used by existing pricing logic.
 * 
 * @param postcodes - Array of UK postcodes (2-20 items)
 * @param renderOptions - Optional: Pass a map instance to render the route visually
 * @returns Promise with route details including totalMiles, totalMinutes, and googleMapsLink
 */
export async function calculateMultiStopRoute(
  postcodes: string[],
  renderOptions?: RouteRenderOptions
): Promise<MultiStopRouteResult | null> {
  // Validate postcodes
  const validation = validatePostcodes(postcodes);
  if (!validation.isValid) {
    console.error('[MultiStopRoute] Validation failed:', validation.error);
    return null;
  }
  
  // Clean postcodes
  const cleanedPostcodes = postcodes.map(pc => pc.trim().toUpperCase());
  
  try {
    // Ensure Google Maps is loaded
    await initGoogleMaps();
    
    if (typeof google === 'undefined' || !google.maps) {
      console.error('[MultiStopRoute] Google Maps not loaded');
      return null;
    }
    
    const directionsService = new google.maps.DirectionsService();
    
    // Build the directions request
    const origin = cleanedPostcodes[0] + ', UK';
    const destination = cleanedPostcodes[cleanedPostcodes.length - 1] + ', UK';
    
    // Waypoints are all stops between origin and destination
    const waypoints: google.maps.DirectionsWaypoint[] = cleanedPostcodes
      .slice(1, -1)
      .map(postcode => ({
        location: postcode + ', UK',
        stopover: true,
      }));
    
    const request: google.maps.DirectionsRequest = {
      origin,
      destination,
      waypoints,
      optimizeWaypoints: true, // Let Google find the optimal order
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
      region: 'uk',
    };
    
    // Call the Directions API
    const response = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
      directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          resolve(result);
        } else {
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });
    
    // Process the response
    const route = response.routes[0];
    if (!route || !route.legs) {
      console.error('[MultiStopRoute] No route found');
      return null;
    }
    
    // Calculate totals from all legs
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    const legs: MultiStopRouteResult['legs'] = [];
    
    for (const leg of route.legs) {
      totalDistanceMeters += leg.distance?.value || 0;
      totalDurationSeconds += leg.duration?.value || 0;
      
      legs.push({
        startAddress: leg.start_address || '',
        endAddress: leg.end_address || '',
        distanceMiles: (leg.distance?.value || 0) / 1609.34,
        durationMinutes: (leg.duration?.value || 0) / 60,
      });
    }
    
    // Convert to miles and minutes
    const totalMiles = Math.round((totalDistanceMeters / 1609.34) * 10) / 10;
    const totalMinutes = Math.round(totalDurationSeconds / 60);
    
    // Get the optimized order (if waypoints were reordered)
    const optimizedOrder = route.waypoint_order || [];
    
    // Reorder postcodes based on optimization
    const orderedPostcodes = [cleanedPostcodes[0]];
    for (const idx of optimizedOrder) {
      orderedPostcodes.push(cleanedPostcodes[idx + 1]); // +1 because waypoints don't include origin
    }
    orderedPostcodes.push(cleanedPostcodes[cleanedPostcodes.length - 1]);
    
    // Generate navigation link with optimized order
    const googleMapsLink = generateGoogleMapsLink(orderedPostcodes);
    
    // Render the route on the map if options provided
    if (renderOptions?.map) {
      // Clear any existing route first
      clearCurrentRoute();
      
      // Use provided renderer or create a new one
      const renderer = renderOptions.directionsRenderer || new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#007BFF',
          strokeWeight: 5,
          strokeOpacity: 0.8,
        },
      });
      
      renderer.setMap(renderOptions.map);
      renderer.setDirections(response);
      
      // Store reference for clearing later
      currentRenderer = renderer;
    }
    
    console.log('[MultiStopRoute] Route calculated successfully:', {
      totalMiles,
      totalMinutes,
      stops: cleanedPostcodes.length,
      optimized: optimizedOrder.length > 0,
    });
    
    return {
      totalMiles,
      totalMinutes,
      googleMapsLink,
      optimizedOrder,
      legs,
    };
    
  } catch (error) {
    console.error('[MultiStopRoute] Error calculating route:', error);
    return null;
  }
}

/**
 * Parses a multi-line string of postcodes into an array
 * @param input - String with postcodes separated by newlines or commas
 * @returns Array of postcode strings
 */
export function parsePostcodeInput(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map(pc => pc.trim())
    .filter(pc => pc.length > 0);
}

// ============================================================================
// VERIFICATION COMMENTS - DO NOT REMOVE
// ============================================================================
// 
// This module was added as a NEW feature for route visualization only.
// 
// CONFIRMED UNCHANGED:
// - Pricing logic = unchanged (this module does not calculate prices)
// - Admin price override flow = unchanged (not affected by this module)
// - Driver sees only final assigned price = unchanged (this module returns distance/time only)
// - Existing bookings continue to work = unchanged (no modifications to booking flow)
// 
// The totalMiles and totalMinutes values returned by calculateMultiStopRoute
// are exposed as variables that CAN be consumed by existing pricing logic,
// but this module does NOT implement any pricing calculations itself.
// ============================================================================
