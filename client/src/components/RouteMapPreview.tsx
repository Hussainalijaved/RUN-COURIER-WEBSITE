import { useEffect, useRef, useState } from 'react';

interface RouteMapPreviewProps {
  pickupPostcode: string;
  deliveryPostcode?: string;
  drops?: { postcode: string }[];
  isMultiDrop?: boolean;
}

declare global {
  interface Window {
    google: typeof google;
  }
}

export function RouteMapPreview({ 
  pickupPostcode, 
  deliveryPostcode, 
  drops = [], 
  isMultiDrop = false 
}: RouteMapPreviewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [optimizedStops, setOptimizedStops] = useState<string[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const initializedRef = useRef(false);

  // Initialize map
  useEffect(() => {
    if (initializedRef.current) return;
    
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !mapRef.current) return;

    const initMap = async () => {
      try {
        // Wait for Google Maps to be available
        if (!window.google?.maps) {
          // Check if script already loading
          const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
          if (!existingScript) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
          }
          
          // Wait for script to load
          await new Promise<void>((resolve) => {
            const checkLoaded = setInterval(() => {
              if (window.google?.maps) {
                clearInterval(checkLoaded);
                resolve();
              }
            }, 100);
          });
        }
        
        if (!mapRef.current) return;
        
        const newMap = new google.maps.Map(mapRef.current, {
          center: { lat: 51.5074, lng: -0.1278 },
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setMap(newMap);
        initializedRef.current = true;
      } catch (err) {
        console.error('Failed to load Google Maps:', err);
        setError('Failed to load map');
      }
    };

    initMap();
  }, []);

  // Helper function to calculate distance between two LatLng points
  const calculateDistance = (a: google.maps.LatLng, b: google.maps.LatLng): number => {
    return google.maps.geometry.spherical.computeDistanceBetween(a, b);
  };

  // Optimize route order using nearest neighbor algorithm (starting from pickup)
  const optimizeRoute = (
    pickupLocation: google.maps.LatLng,
    deliveryLocations: { postcode: string; location: google.maps.LatLng }[]
  ): { postcode: string; location: google.maps.LatLng }[] => {
    if (deliveryLocations.length <= 1) return deliveryLocations;

    const optimized: { postcode: string; location: google.maps.LatLng }[] = [];
    const remaining = [...deliveryLocations];
    let currentLocation = pickupLocation;

    while (remaining.length > 0) {
      // Find nearest unvisited location
      let nearestIdx = 0;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = calculateDistance(currentLocation, remaining[i].location);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      // Add nearest to optimized route and remove from remaining
      const nearest = remaining.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      currentLocation = nearest.location;
    }

    return optimized;
  };

  // Update markers when postcodes change
  useEffect(() => {
    if (!map) return;

    // Collect all postcodes
    const allPostcodes: { postcode: string; isPickup: boolean }[] = [];
    if (pickupPostcode && pickupPostcode.length >= 3) {
      allPostcodes.push({ postcode: pickupPostcode, isPickup: true });
    }
    
    if (isMultiDrop && drops.length > 0) {
      const validDrops = drops.filter(d => d.postcode && d.postcode.length >= 3);
      validDrops.forEach(d => allPostcodes.push({ postcode: d.postcode, isPickup: false }));
    } else if (deliveryPostcode && deliveryPostcode.length >= 3) {
      allPostcodes.push({ postcode: deliveryPostcode, isPickup: false });
    }

    if (allPostcodes.length < 2) {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    // Geocode all postcodes
    const geocoder = new google.maps.Geocoder();
    const geocodePromises = allPostcodes.map(item => 
      new Promise<{ postcode: string; location: google.maps.LatLng; isPickup: boolean } | null>((resolve) => {
        geocoder.geocode({ address: item.postcode + ', UK' }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            resolve({ 
              postcode: item.postcode, 
              location: results[0].geometry.location,
              isPickup: item.isPickup
            });
          } else {
            resolve(null);
          }
        });
      })
    );

    Promise.all(geocodePromises).then(geocodedResults => {
      // Clear old markers
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }

      // Filter valid results
      const validResults = geocodedResults.filter((r): r is { postcode: string; location: google.maps.LatLng; isPickup: boolean } => r !== null);
      
      if (validResults.length < 2) {
        setError('Could not find all locations');
        setIsLoading(false);
        return;
      }

      // Separate pickup from delivery locations
      const pickup = validResults.find(r => r.isPickup);
      const deliveries = validResults.filter(r => !r.isPickup);

      if (!pickup) {
        setError('Pickup location not found');
        setIsLoading(false);
        return;
      }

      // Optimize route order for deliveries (starting from pickup)
      const optimizedDeliveries = optimizeRoute(pickup.location, deliveries);

      // Build final ordered route: pickup first, then optimized deliveries
      const orderedRoute = [
        { postcode: pickup.postcode, location: pickup.location },
        ...optimizedDeliveries
      ];

      // Save optimized stop order for display
      setOptimizedStops(orderedRoute.map(s => s.postcode));

      // Create bounds
      const bounds = new google.maps.LatLngBounds();

      // Add markers in optimized order (A = pickup, B, C, D... = stops in sequence)
      orderedRoute.forEach((stop, index) => {
        const isPickup = index === 0;
        const isLastDrop = index === orderedRoute.length - 1;
        
        // Label: A for pickup, then B, C, D... for delivery stops
        const label = String.fromCharCode(65 + index);
        let iconColor = '#3b82f6'; // Blue for middle stops
        
        if (isPickup) {
          iconColor = '#22c55e'; // Green for pickup (A)
        } else if (isLastDrop) {
          iconColor = '#ef4444'; // Red for final stop
        }

        const marker = new google.maps.Marker({
          position: stop.location,
          map,
          label: {
            text: label,
            color: '#fff',
            fontSize: '12px',
            fontWeight: 'bold'
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: iconColor,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 3,
          },
          title: `Stop ${label}: ${stop.postcode}`,
          zIndex: 100 + index
        });

        markersRef.current.push(marker);
        bounds.extend(stop.location);
      });

      // Draw polyline connecting points with arrows in optimized order
      const path = orderedRoute.map(stop => stop.location);
      polylineRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        icons: [{
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 3,
            strokeColor: '#1d4ed8',
            strokeWeight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 1
          },
          offset: '50%',
          repeat: '100px'
        }],
        map
      });

      // Fit map to bounds
      map.fitBounds(bounds, 50);

      setIsLoading(false);
    }).catch((err: Error) => {
      console.error('Geocoding failed:', err);
      setError('Failed to locate addresses');
      setIsLoading(false);
    });
  }, [map, pickupPostcode, deliveryPostcode, drops, isMultiDrop]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0">
        <div ref={mapRef} className="w-full h-full rounded-lg" data-testid="route-map-canvas" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </div>
      {/* Optimized Route Legend */}
      {optimizedStops.length >= 2 && (
        <div className="mt-3 space-y-1.5 text-sm max-h-[100px] overflow-y-auto">
          {optimizedStops.map((postcode, index) => {
            const isPickup = index === 0;
            const isLast = index === optimizedStops.length - 1;
            const label = String.fromCharCode(65 + index);
            let bgColor = 'bg-blue-500';
            if (isPickup) bgColor = 'bg-green-500';
            else if (isLast) bgColor = 'bg-red-500';
            
            return (
              <div key={index} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full ${bgColor} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                  {label}
                </div>
                <span className="text-muted-foreground flex-shrink-0">
                  {isPickup ? 'Pickup:' : `Stop ${index}:`}
                </span>
                <span className="font-medium truncate">{postcode}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
