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

  // Update markers when postcodes change
  useEffect(() => {
    if (!map) return;

    // Collect all postcodes
    const postcodes: string[] = [];
    if (pickupPostcode && pickupPostcode.length >= 3) {
      postcodes.push(pickupPostcode);
    }
    
    if (isMultiDrop && drops.length > 0) {
      const validDrops = drops.filter(d => d.postcode && d.postcode.length >= 3);
      validDrops.forEach(d => postcodes.push(d.postcode));
    } else if (deliveryPostcode && deliveryPostcode.length >= 3) {
      postcodes.push(deliveryPostcode);
    }

    if (postcodes.length < 2) {
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
    const geocodePromises = postcodes.map(postcode => 
      new Promise<google.maps.LatLng | null>((resolve) => {
        geocoder.geocode({ address: postcode + ', UK' }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            resolve(results[0].geometry.location);
          } else {
            resolve(null);
          }
        });
      })
    );

    Promise.all(geocodePromises).then(locations => {
      // Clear old markers
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }

      const validLocations = locations.filter((loc): loc is google.maps.LatLng => loc !== null);
      
      if (validLocations.length < 2) {
        setError('Could not find all locations');
        setIsLoading(false);
        return;
      }

      // Create bounds
      const bounds = new google.maps.LatLngBounds();

      // Add markers in order (A = pickup, B, C, D... = stops in sequence)
      validLocations.forEach((location, index) => {
        const isPickup = index === 0;
        const isLastDrop = index === validLocations.length - 1;
        
        // Label: A for pickup, then B, C, D... for delivery stops
        const label = String.fromCharCode(65 + index);
        let iconColor = '#3b82f6'; // Blue for middle stops
        
        if (isPickup) {
          iconColor = '#22c55e'; // Green for pickup (A)
        } else if (isLastDrop && validLocations.length === 2) {
          iconColor = '#ef4444'; // Red for single delivery (B)
        } else if (isLastDrop) {
          iconColor = '#ef4444'; // Red for final stop
        }

        const marker = new google.maps.Marker({
          position: location,
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
          title: `Stop ${label}: ${postcodes[index]}`,
          zIndex: 100 + index // Ensure later markers are on top
        });

        markersRef.current.push(marker);
        bounds.extend(location);
      });

      // Draw polyline connecting points with arrows
      polylineRef.current = new google.maps.Polyline({
        path: validLocations,
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
    }).catch(err => {
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
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full rounded-lg" data-testid="route-map-canvas" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
