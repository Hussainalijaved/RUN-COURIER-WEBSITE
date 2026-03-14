import { useEffect, useRef, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { MapFallback } from '@/components/ui/map-fallback';
import { getMapCenter, geocodePostcode } from '@/lib/maps';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { Truck, MapPin, Clock, Phone, RefreshCw, AlertCircle, Loader2, Wifi, WifiOff, Package, Navigation, Send, User, Maximize2, Search, X } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useDriverLocations } from '@/hooks/useDriverLocations';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Driver, Job } from '@shared/schema';

interface MultiDropStop {
  id: string;
  jobId: string;
  stopOrder: number;
  address: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  recipientName?: string;
  status?: string;
}

interface JobLocation {
  jobId: string;
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  pickupPostcode: string;
  deliveryPostcode: string;
  // For multi-drop jobs, store all stops in order
  multiDropStops?: { lat: number; lng: number; postcode: string; stopOrder: number }[];
}

export default function AdminMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const driverMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  // For multi-drop jobs, we store an array of stop markers + the connecting polyline
  const jobMarkersRef = useRef<Map<string, { 
    pickup: google.maps.Marker; 
    delivery: google.maps.Marker; 
    polyline: google.maps.Polyline;
    stopMarkers?: google.maps.Marker[];
    multiDropPolyline?: google.maps.Polyline;
  }>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [jobLocations, setJobLocations] = useState<Map<string, JobLocation>>(new Map());
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [selectedDriverForAssign, setSelectedDriverForAssign] = useState<string>('');
  const [driverPriceForAssign, setDriverPriceForAssign] = useState<string>('');
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const { toast } = useToast();

  const { 
    locations: realtimeLocations, 
    isConnected: wsConnected, 
    isConnecting: wsConnecting,
    reconnect 
  } = useDriverLocations({
    enabled: true,
    onConnect: () => console.log('Real-time tracking connected'),
    onDisconnect: () => console.log('Real-time tracking disconnected'),
  });

  const { data: drivers, isLoading: driversLoading, refetch: refetchDrivers } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
    refetchInterval: 15000,
  });

  const { data: jobs, refetch: refetchJobs } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 30000,
  });

  const assignJobMutation = useMutation({
    mutationFn: async ({ jobId, driverId, driverPrice }: { jobId: string; driverId: string; driverPrice: string }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/assign`, { driverId, driverPrice });
    },
    onSuccess: () => {
      toast({ title: 'Job assigned successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      setShowAssignDialog(false);
      setAssigningJobId(null);
      setSelectedDriverForAssign('');
      setDriverPriceForAssign('');
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to assign job', description: error.message, variant: 'destructive' });
    },
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async ({ driverId, isAvailable }: { driverId: string; isAvailable: boolean }) => {
      return apiRequest('PATCH', `/api/admin/drivers/${driverId}/availability`, { isAvailable });
    },
    onSuccess: (_, { isAvailable }) => {
      toast({ title: isAvailable ? 'Driver set to Online' : 'Driver set to Offline' });
      queryClient.invalidateQueries({ queryKey: ['/api/drivers'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update availability', description: error.message, variant: 'destructive' });
    },
  });

  const activeDrivers = (drivers || []).filter(d => {
    if (!d.isActive) return false;
    if (realtimeLocations.has(d.id)) return true;
    if (d.currentLatitude && d.currentLongitude) return true;
    const da = d as any;
    if (da.postcodeLatitude && da.postcodeLongitude) return true;
    if (d.postcode) return true;
    return false;
  }).sort((a, b) => {
    const hasRealGps = (d: Driver) => {
      if (realtimeLocations.has(d.id)) return true;
      if (d.currentLatitude && d.currentLongitude) {
        const lat = parseFloat(d.currentLatitude);
        const lng = parseFloat(d.currentLongitude);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
      }
      return false;
    };
    const aHasGps = hasRealGps(a);
    const bHasGps = hasRealGps(b);
    if (aHasGps && !bHasGps) return -1;
    if (!aHasGps && bHasGps) return 1;
    const aOnline = a.isAvailable;
    const bOnline = b.isAvailable;
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return (a.driverCode || '').localeCompare(b.driverCode || '');
  });

  const liveGpsCount = activeDrivers.filter(d => {
    if (realtimeLocations.has(d.id)) return true;
    if (d.currentLatitude && d.currentLongitude) {
      const lat = parseFloat(d.currentLatitude);
      const lng = parseFloat(d.currentLongitude);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    }
    return false;
  }).length;
  const postcodeOnlyCount = activeDrivers.length - liveGpsCount;
  
  const availableDrivers = activeDrivers.filter(d => {
    const realtimeLoc = realtimeLocations.get(d.id);
    return realtimeLoc?.isAvailable ?? d.isAvailable;
  });
  
  // Show only jobs that are actively in progress on the map (not completed/cancelled/failed)
  const completedStatuses = ['delivered', 'cancelled', 'failed'];
  const pendingJobs = jobs?.filter(j => j.status === 'pending') || [];
  const activeJobs = jobs?.filter(j => !['delivered', 'cancelled', 'failed', 'pending'].includes(j.status)) || [];
  const allActiveBookings = jobs?.filter(j => !completedStatuses.includes(j.status)) || [];

  const getDriverLocation = useCallback((driver: Driver): { lat: number; lng: number; source: 'gps' | 'postcode' | null } => {
    const realtimeLoc = realtimeLocations.get(driver.id);
    if (realtimeLoc) {
      return { lat: realtimeLoc.lat, lng: realtimeLoc.lng, source: 'gps' };
    }
    
    if (driver.currentLatitude && driver.currentLongitude) {
      const lat = parseFloat(driver.currentLatitude);
      const lng = parseFloat(driver.currentLongitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng, source: 'gps' };
      }
    }
    
    const d = driver as any;
    if (d.postcodeLatitude && d.postcodeLongitude) {
      const lat = parseFloat(d.postcodeLatitude);
      const lng = parseFloat(d.postcodeLongitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng, source: 'postcode' };
      }
    }
    
    return { lat: 0, lng: 0, source: null };
  }, [realtimeLocations]);

  // Function to fit map to show all drivers
  const fitAllDrivers = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeDrivers.length) return;
    
    const bounds = new google.maps.LatLngBounds();
    let hasValidBounds = false;
    
    activeDrivers.forEach((driver) => {
      const location = getDriverLocation(driver);
      if (location.source) {
        bounds.extend({ lat: location.lat, lng: location.lng });
        hasValidBounds = true;
      } else {
        bounds.extend({ lat: 51.5074, lng: -0.1278 });
        hasValidBounds = true;
      }
    });
    
    if (hasValidBounds) {
      map.fitBounds(bounds, 50);
      // Clamp zoom: never below 12 (Greater London view) and never above 14 (street level)
      const listener = google.maps.event.addListener(map, 'idle', () => {
        const z = map.getZoom();
        if (z !== undefined) {
          if (z > 14) map.setZoom(14);
          else if (z < 12) map.setZoom(12);
        }
        google.maps.event.removeListener(listener);
      });
    }
  }, [activeDrivers, getDriverLocation]);

  const filteredDrivers = driverSearchQuery.trim()
    ? activeDrivers.filter(d => {
        const q = driverSearchQuery.trim().toUpperCase();
        return (d.driverCode || '').toUpperCase().includes(q) ||
               (d.fullName || '').toUpperCase().includes(q) ||
               (d.vehicleRegistration || '').toUpperCase().includes(q);
      })
    : activeDrivers;

  const handleDriverSearch = useCallback((query: string) => {
    setDriverSearchQuery(query);
    if (!query.trim()) return;
    const q = query.trim().toUpperCase();
    const match = activeDrivers.find(d => (d.driverCode || '').toUpperCase() === q);
    if (match) {
      const location = getDriverLocation(match);
      const map = mapInstanceRef.current;
      if (map && location.source) {
        map.panTo({ lat: location.lat, lng: location.lng });
        map.setZoom(16);
      }
      setSelectedDriver(match);
      setSelectedJob(null);
    }
  }, [activeDrivers, getDriverLocation]);

  const getDriverCurrentJob = (driverId: string) => {
    return jobs?.find(j => 
      j.driverId === driverId && 
      !['delivered', 'cancelled', 'pending'].includes(j.status)
    );
  };

  const getDriverStatus = (driver: Driver) => {
    const currentJob = getDriverCurrentJob(driver.id);
    if (currentJob) return 'on_delivery';
    
    // Use real-time availability from WebSocket if available (instant updates)
    const realtimeLocation = realtimeLocations.get(driver.id);
    if (realtimeLocation?.isAvailable !== undefined) {
      return realtimeLocation.isAvailable ? 'available' : 'offline';
    }
    
    // Fallback to API data
    if (driver.isAvailable) return 'available';
    return 'offline';
  };

  const { status: mapsStatus, error: mapsError, isReady: mapsReady, retry: retryMaps } = useGoogleMaps();

  const initMap = useCallback(() => {
    if (mapInstanceRef.current || !mapRef.current || !mapsReady) return;

    if (typeof google === 'undefined' || !google.maps) {
      setMapError('Google Maps failed to load.');
      return;
    }

    const center = getMapCenter();
    const newMap = new google.maps.Map(mapRef.current, {
      center,
      zoom: 12,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
      ],
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    
    mapInstanceRef.current = newMap;
    setMapLoaded(true);
    setMapError(null);
  }, [mapsReady]);

  useEffect(() => {
    if (mapsReady) {
      initMap();
    }
  }, [mapsReady, initMap]);

  useEffect(() => {
    const loadJobLocations = async () => {
      if (!jobs || !mapLoaded) return;
      
      // Load locations for ALL active bookings (not delivered/cancelled)
      // Use string IDs consistently since Maps are keyed by string
      const allDisplayJobs = allActiveBookings.filter(job => !jobLocations.has(String(job.id)));
      
      for (const job of allDisplayJobs) {
        const jobIdStr = String(job.id);
        // First try to use stored coordinates from the database
        const hasStoredPickup = job.pickupLatitude && job.pickupLongitude;
        const hasStoredDelivery = job.deliveryLatitude && job.deliveryLongitude;
        
        let multiDropStops: { lat: number; lng: number; postcode: string; stopOrder: number }[] | undefined;
        
        // For multi-drop jobs, fetch the stops
        if (job.isMultiDrop) {
          try {
            const response = await apiRequest('GET', `/api/jobs/${job.id}/stops`);
            const data = await response.json();
            if (data.stops && Array.isArray(data.stops)) {
              const sortedStops = data.stops.sort((a: MultiDropStop, b: MultiDropStop) => a.stopOrder - b.stopOrder);
              
              // Process each stop - use stored coords or geocode from postcode
              const processedStops: { lat: number; lng: number; postcode: string; stopOrder: number }[] = [];
              for (const stop of sortedStops) {
                if (stop.latitude && stop.longitude) {
                  // Use stored coordinates
                  processedStops.push({
                    lat: parseFloat(String(stop.latitude)),
                    lng: parseFloat(String(stop.longitude)),
                    postcode: stop.postcode,
                    stopOrder: stop.stopOrder,
                  });
                } else if (stop.postcode) {
                  // Geocode from postcode
                  try {
                    const geocoded = await geocodePostcode(stop.postcode);
                    if (geocoded) {
                      processedStops.push({
                        lat: geocoded.lat,
                        lng: geocoded.lng,
                        postcode: stop.postcode,
                        stopOrder: stop.stopOrder,
                      });
                    }
                  } catch (geocodeError) {
                    console.error(`Failed to geocode stop ${stop.stopOrder}:`, geocodeError);
                  }
                }
              }
              multiDropStops = processedStops;
            }
          } catch (error) {
            console.error(`Failed to fetch multi-drop stops for job ${jobIdStr}:`, error);
          }
        }
        
        if (hasStoredPickup && hasStoredDelivery) {
          // Use stored coordinates directly
          setJobLocations(prev => new Map(prev).set(jobIdStr, {
            jobId: jobIdStr,
            pickupLat: parseFloat(String(job.pickupLatitude)),
            pickupLng: parseFloat(String(job.pickupLongitude)),
            deliveryLat: parseFloat(String(job.deliveryLatitude)),
            deliveryLng: parseFloat(String(job.deliveryLongitude)),
            pickupPostcode: job.pickupPostcode || job.pickupAddress?.slice(-8) || '',
            deliveryPostcode: job.deliveryPostcode || job.deliveryAddress?.slice(-8) || '',
            multiDropStops,
          }));
        } else if (job.pickupPostcode && job.deliveryPostcode) {
          // Fall back to geocoding if we have postcodes
          try {
            const [pickupResult, deliveryResult] = await Promise.all([
              geocodePostcode(job.pickupPostcode),
              geocodePostcode(job.deliveryPostcode)
            ]);
            
            if (pickupResult && deliveryResult) {
              setJobLocations(prev => new Map(prev).set(jobIdStr, {
                jobId: jobIdStr,
                pickupLat: pickupResult.lat,
                pickupLng: pickupResult.lng,
                deliveryLat: deliveryResult.lat,
                deliveryLng: deliveryResult.lng,
                pickupPostcode: job.pickupPostcode,
                deliveryPostcode: job.deliveryPostcode,
                multiDropStops,
              }));
            }
          } catch (error) {
            console.error(`Failed to geocode job ${jobIdStr}:`, error);
          }
        }
      }
    };
    
    loadJobLocations();
  }, [jobs, mapLoaded, allActiveBookings]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    const currentMarkerIds = new Set<string>();

    activeDrivers.forEach((driver) => {
      const location = getDriverLocation(driver);
      
      const hasGps = location.source === 'gps';
      const hasPostcode = location.source === 'postcode';
      const noGps = !hasGps;
      const isOnlineNoGps = driver.isAvailable && noGps;
      if (!location.source) return;
      const displayLocation = { lat: location.lat, lng: location.lng };

      currentMarkerIds.add(driver.id);
      const status = getDriverStatus(driver);
      const fillColor = noGps ? (isOnlineNoGps ? '#F97316' : '#6B7280') : (status === 'on_delivery' ? '#3B82F6' : status === 'available' ? '#22C55E' : '#9CA3AF');
      const markerOpacity = hasPostcode ? 0.7 : 1;

      const existingMarker = driverMarkersRef.current.get(driver.id);
      
      const vehicleIcons: Record<string, { path: string; scale: number; anchor: [number, number] }> = {
        car: {
          path: 'M 23 16 L 23 12 C 23 11 22.5 10 21.5 10 L 20 10 L 18 6 C 17.5 5 16.5 4 15.5 4 L 8.5 4 C 7.5 4 6.5 5 6 6 L 4 10 L 2.5 10 C 1.5 10 1 11 1 12 L 1 16 C 1 17 1.5 17.5 2 17.5 L 3 17.5 C 3 19.4 4.6 21 6.5 21 C 8.4 21 10 19.4 10 17.5 L 14 17.5 C 14 19.4 15.6 21 17.5 21 C 19.4 21 21 19.4 21 17.5 L 22 17.5 C 22.5 17.5 23 17 23 16 Z M 6.5 19 C 5.7 19 5 18.3 5 17.5 C 5 16.7 5.7 16 6.5 16 C 7.3 16 8 16.7 8 17.5 C 8 18.3 7.3 19 6.5 19 Z M 17.5 19 C 16.7 19 16 18.3 16 17.5 C 16 16.7 16.7 16 17.5 16 C 18.3 16 19 16.7 19 17.5 C 19 18.3 18.3 19 17.5 19 Z M 7 10 L 8.5 6.5 C 8.7 6.2 9 6 9.3 6 L 14.7 6 C 15 6 15.3 6.2 15.5 6.5 L 17 10 L 7 10 Z',
          scale: 1.4,
          anchor: [12, 12],
        },
        motorbike: {
          path: 'M 20 17 C 20 19.2 18.2 21 16 21 C 13.8 21 12 19.2 12 17 C 12 14.8 13.8 13 16 13 C 18.2 13 20 14.8 20 17 Z M 16 15 C 14.9 15 14 15.9 14 17 C 14 18.1 14.9 19 16 19 C 17.1 19 18 18.1 18 17 C 18 15.9 17.1 15 16 15 Z M 12 17 C 12 19.2 10.2 21 8 21 C 5.8 21 4 19.2 4 17 C 4 14.8 5.8 13 8 13 C 10.2 13 12 14.8 12 17 Z M 8 15 C 6.9 15 6 15.9 6 17 C 6 18.1 6.9 19 8 19 C 9.1 19 10 18.1 10 17 C 10 15.9 9.1 15 8 15 Z M 16 13 L 14 8 L 16 6 L 18 6 L 17 8 L 19 10 L 17 13 Z M 8 13 L 9 10 L 12 8 L 14 8 L 12 10 L 10 13 Z',
          scale: 1.3,
          anchor: [12, 14],
        },
        small_van: {
          path: 'M 24 20 L 24 10 C 24 9 23 8 22 8 L 18 8 L 18 6 C 18 5 17 4 16 4 L 4 4 C 3 4 2 5 2 6 L 2 18 C 2 19 3 20 4 20 L 5 20 C 5 21.7 6.3 23 8 23 C 9.7 23 11 21.7 11 20 L 15 20 C 15 21.7 16.3 23 18 23 C 19.7 23 21 21.7 21 20 L 22 20 C 23 20 24 19 24 18 L 24 20 Z M 8 21 C 7.4 21 7 20.6 7 20 C 7 19.4 7.4 19 8 19 C 8.6 19 9 19.4 9 20 C 9 20.6 8.6 21 8 21 Z M 18 21 C 17.4 21 17 20.6 17 20 C 17 19.4 17.4 19 18 19 C 18.6 19 19 19.4 19 20 C 19 20.6 18.6 21 18 21 Z M 22 14 L 18 14 L 18 10 L 20 10 L 22 12 L 22 14 Z',
          scale: 1.4,
          anchor: [13, 13],
        },
        medium_van: {
          path: 'M 28 20 L 28 10 C 28 9 27 8 26 8 L 20 8 L 20 5 C 20 4 19 3 18 3 L 3 3 C 2 3 1 4 1 5 L 1 18 C 1 19 2 20 3 20 L 4 20 C 4 21.7 5.3 23 7 23 C 8.7 23 10 21.7 10 20 L 18 20 C 18 21.7 19.3 23 21 23 C 22.7 23 24 21.7 24 20 L 26 20 C 27 20 28 19 28 18 L 28 20 Z M 7 21 C 6.4 21 6 20.6 6 20 C 6 19.4 6.4 19 7 19 C 7.6 19 8 19.4 8 20 C 8 20.6 7.6 21 7 21 Z M 21 21 C 20.4 21 20 20.6 20 20 C 20 19.4 20.4 19 21 19 C 21.6 19 22 19.4 22 20 C 22 20.6 21.6 21 21 21 Z M 26 14 L 20 14 L 20 10 L 23 10 L 26 13 L 26 14 Z',
          scale: 1.3,
          anchor: [14, 13],
        },
      };
      const vType = driver.vehicleType || 'car';
      const iconData = vehicleIcons[vType] || vehicleIcons.car;
      
      const strokeColor = noGps ? (isOnlineNoGps ? '#F97316' : '#6B7280') : '#1a1a1a';
      const baseScale = iconData.scale;
      const iconConfig = {
        path: iconData.path,
        scale: baseScale,
        fillColor,
        fillOpacity: markerOpacity,
        strokeColor,
        strokeWeight: 1.5,
        anchor: new google.maps.Point(iconData.anchor[0], iconData.anchor[1]),
      };

      if (existingMarker) {
        existingMarker.setPosition(displayLocation);
        existingMarker.setIcon(iconConfig);
      } else {
        const gpsLabel = noGps ? (hasPostcode ? ' (POSTCODE)' : ' (NO GPS)') : '';
        const driverLabel = driver.driverCode 
          ? `${driver.driverCode} · ${driver.fullName || 'Driver'}${gpsLabel}` 
          : (driver.fullName || driver.vehicleRegistration || 'Driver') + gpsLabel;
        const marker = new google.maps.Marker({
          position: displayLocation,
          map,
          title: driverLabel,
          icon: iconConfig,
        });

        marker.addListener('click', () => {
          setSelectedDriver(driver);
          setSelectedJob(null);
          map.panTo(displayLocation);
          map.setZoom(15);
        });

        marker.addListener('mouseover', () => {
          if (!infoWindowRef.current) {
            infoWindowRef.current = new google.maps.InfoWindow();
          }
          const vehicleType = driver.vehicleType?.replace(/_/g, ' ') || 'Unknown';
          const driverDisplay = driver.driverCode 
            ? `${driver.driverCode} · ${driver.fullName || 'Driver'}` 
            : driver.fullName || 'Driver';
          const postcodeInfo = driver.postcode ? `<div style="font-size: 11px; color: #666; margin-top: 2px;">Area: ${driver.postcode}</div>` : '';
          const locationStatus = noGps 
            ? `<div style="font-size: 11px; color: ${isOnlineNoGps ? '#F97316' : '#6B7280'}; font-weight: 600; margin-top: 4px;">${hasPostcode ? 'POSTCODE ONLY - Not real-time' : 'NO GPS DATA'}</div>`
            : `<div style="font-size: 11px; color: #22C55E; font-weight: 600; margin-top: 4px;">LIVE GPS TRACKING</div>`;
          infoWindowRef.current.setContent(`
            <div style="padding: 8px; font-family: system-ui, -apple-system, sans-serif; min-width: 180px;">
              <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${driverDisplay}</div>
              <div style="font-size: 12px; color: #666; text-transform: capitalize;">Vehicle: ${vehicleType}</div>
              ${postcodeInfo}
              ${locationStatus}
            </div>
          `);
          infoWindowRef.current.open(map, marker);
        });

        marker.addListener('mouseout', () => {
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
        });

        driverMarkersRef.current.set(driver.id, marker);
      }
    });

    driverMarkersRef.current.forEach((marker, driverId) => {
      if (!currentMarkerIds.has(driverId)) {
        marker.setMap(null);
        driverMarkersRef.current.delete(driverId);
      }
    });
    
  }, [activeDrivers, mapLoaded, jobs, realtimeLocations, getDriverLocation, fitAllDrivers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    const currentJobIds = new Set<string>();
    // Show ALL active bookings on the map until completed
    const allDisplayJobs = allActiveBookings;

    allDisplayJobs.forEach((job) => {
      const jobIdStr = String(job.id);
      const location = jobLocations.get(jobIdStr);
      if (!location) return;

      currentJobIds.add(jobIdStr);
      const isPending = job.status === 'pending' && !job.driverId;
      const existingJobMarkers = jobMarkersRef.current.get(jobIdStr);

      if (existingJobMarkers) {
        existingJobMarkers.pickup.setPosition({ lat: location.pickupLat, lng: location.pickupLng });
        existingJobMarkers.delivery.setPosition({ lat: location.deliveryLat, lng: location.deliveryLng });
        existingJobMarkers.pickup.setIcon({
          path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: isPending ? '#F59E0B' : '#22C55E',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          rotation: 0,
        });
        existingJobMarkers.delivery.setIcon({
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: isPending ? '#EF4444' : '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          rotation: 0,
        });
        existingJobMarkers.polyline.setOptions({
          strokeColor: isPending ? '#F59E0B' : '#3B82F6',
        });
      } else {
        const pickupMarker = new google.maps.Marker({
          position: { lat: location.pickupLat, lng: location.pickupLng },
          map,
          title: `Pickup: ${job.pickupPostcode}`,
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: isPending ? '#F59E0B' : '#22C55E',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            rotation: 0,
          },
        });

        const deliveryMarker = new google.maps.Marker({
          position: { lat: location.deliveryLat, lng: location.deliveryLng },
          map,
          title: `Delivery: ${job.deliveryPostcode}`,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: isPending ? '#EF4444' : '#3B82F6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            rotation: 0,
          },
        });

        // Build the route path - for multi-drop jobs, include all stops in order
        const routePath: google.maps.LatLngLiteral[] = [
          { lat: location.pickupLat, lng: location.pickupLng }
        ];
        
        // Add multi-drop stops in order if available
        if (location.multiDropStops && location.multiDropStops.length > 0) {
          location.multiDropStops.forEach(stop => {
            routePath.push({ lat: stop.lat, lng: stop.lng });
          });
        }
        
        // Add final delivery
        routePath.push({ lat: location.deliveryLat, lng: location.deliveryLng });

        const polyline = new google.maps.Polyline({
          path: routePath,
          geodesic: true,
          strokeColor: isPending ? '#F59E0B' : '#3B82F6',
          strokeOpacity: 0.6,
          strokeWeight: 3,
          map,
        });
        
        // Create markers for multi-drop stops
        const stopMarkers: google.maps.Marker[] = [];
        if (location.multiDropStops && location.multiDropStops.length > 0) {
          location.multiDropStops.forEach((stop, index) => {
            const stopMarker = new google.maps.Marker({
              position: { lat: stop.lat, lng: stop.lng },
              map,
              title: `Drop ${stop.stopOrder}: ${stop.postcode}`,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#8B5CF6', // Purple for intermediate stops
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              },
              label: {
                text: String(stop.stopOrder),
                color: '#ffffff',
                fontSize: '10px',
                fontWeight: 'bold',
              },
            });
            
            stopMarker.addListener('mouseover', () => {
              if (!infoWindowRef.current) {
                infoWindowRef.current = new google.maps.InfoWindow();
              }
              infoWindowRef.current.setContent(`
                <div style="padding: 8px; font-family: system-ui, -apple-system, sans-serif; min-width: 150px;">
                  <div style="font-weight: 600; font-size: 13px; color: #8B5CF6; margin-bottom: 4px;">Drop ${stop.stopOrder}</div>
                  <div style="font-size: 12px; color: #666;">${stop.postcode}</div>
                  <div style="font-size: 11px; color: #999; margin-top: 4px;">Job: ${job.trackingNumber || job.id}</div>
                </div>
              `);
              infoWindowRef.current.open(map, stopMarker);
            });
            
            stopMarker.addListener('mouseout', () => {
              if (infoWindowRef.current) infoWindowRef.current.close();
            });
            
            stopMarker.addListener('click', () => {
              setSelectedJob(job);
              setSelectedDriver(null);
              const bounds = new google.maps.LatLngBounds();
              routePath.forEach(point => bounds.extend(point));
              map.fitBounds(bounds, 100);
            });
            
            stopMarkers.push(stopMarker);
          });
        }

        const handleMarkerClick = () => {
          setSelectedJob(job);
          setSelectedDriver(null);
          const bounds = new google.maps.LatLngBounds();
          // Include all route points in bounds for multi-drop jobs
          routePath.forEach(point => bounds.extend(point));
          map.fitBounds(bounds, 100);
        };

        pickupMarker.addListener('click', handleMarkerClick);
        deliveryMarker.addListener('click', handleMarkerClick);

        pickupMarker.addListener('mouseover', () => {
          if (!infoWindowRef.current) {
            infoWindowRef.current = new google.maps.InfoWindow();
          }
          infoWindowRef.current.setContent(`
            <div style="padding: 8px; font-family: system-ui, -apple-system, sans-serif; min-width: 150px;">
              <div style="font-weight: 600; font-size: 13px; color: #22C55E; margin-bottom: 4px;">Pickup Location</div>
              <div style="font-size: 12px; color: #666;">${job.pickupPostcode}</div>
              <div style="font-size: 11px; color: #999; margin-top: 4px;">Job: ${job.trackingNumber || job.id}</div>
            </div>
          `);
          infoWindowRef.current.open(map, pickupMarker);
        });

        pickupMarker.addListener('mouseout', () => {
          if (infoWindowRef.current) infoWindowRef.current.close();
        });

        deliveryMarker.addListener('mouseover', () => {
          if (!infoWindowRef.current) {
            infoWindowRef.current = new google.maps.InfoWindow();
          }
          infoWindowRef.current.setContent(`
            <div style="padding: 8px; font-family: system-ui, -apple-system, sans-serif; min-width: 150px;">
              <div style="font-weight: 600; font-size: 13px; color: #EF4444; margin-bottom: 4px;">Delivery Location</div>
              <div style="font-size: 12px; color: #666;">${job.deliveryPostcode}</div>
              <div style="font-size: 11px; color: #999; margin-top: 4px;">Job: ${job.trackingNumber || job.id}</div>
            </div>
          `);
          infoWindowRef.current.open(map, deliveryMarker);
        });

        deliveryMarker.addListener('mouseout', () => {
          if (infoWindowRef.current) infoWindowRef.current.close();
        });

        // Store markers including multi-drop stop markers
        jobMarkersRef.current.set(jobIdStr, { 
          pickup: pickupMarker, 
          delivery: deliveryMarker, 
          polyline,
          stopMarkers: stopMarkers.length > 0 ? stopMarkers : undefined,
        });
      }
    });

    // Cleanup removed job markers
    jobMarkersRef.current.forEach((markers, jobId) => {
      if (!currentJobIds.has(jobId)) {
        markers.pickup.setMap(null);
        markers.delivery.setMap(null);
        markers.polyline.setMap(null);
        // Also clean up multi-drop stop markers
        if (markers.stopMarkers) {
          markers.stopMarkers.forEach(marker => marker.setMap(null));
        }
        jobMarkersRef.current.delete(jobId);
      }
    });
  }, [allActiveBookings, jobLocations, mapLoaded]);

  const handleDriverClick = (driver: Driver) => {
    setSelectedDriver(driver);
    setSelectedJob(null);
    const map = mapInstanceRef.current;
    const location = getDriverLocation(driver);
    if (map && location.source) {
      map.panTo({ lat: location.lat, lng: location.lng });
      map.setZoom(15);
    }
  };

  const handleJobClick = (job: Job) => {
    setSelectedJob(job);
    setSelectedDriver(null);
    const map = mapInstanceRef.current;
    const location = jobLocations.get(String(job.id));
    if (map && location) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: location.pickupLat, lng: location.pickupLng });
      bounds.extend({ lat: location.deliveryLat, lng: location.deliveryLng });
      map.fitBounds(bounds, 100);
    }
  };

  const handleAssignJob = (job: Job) => {
    setAssigningJobId(job.id);
    setSelectedDriverForAssign('');
    setShowAssignDialog(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setSelectedDriverForAssign('');
      setAssigningJobId(null);
    }
    setShowAssignDialog(open);
    if (!open) {
      setDriverPriceForAssign('');
    }
  };

  const confirmAssignJob = () => {
    if (assigningJobId && selectedDriverForAssign && driverPriceForAssign) {
      assignJobMutation.mutate({ 
        jobId: assigningJobId, 
        driverId: selectedDriverForAssign,
        driverPrice: driverPriceForAssign
      });
    }
  };

  const getStatusBadge = (driver: Driver) => {
    const status = getDriverStatus(driver);
    switch (status) {
      case 'on_delivery':
        return <Badge className="bg-blue-500 text-white text-xs">On Delivery</Badge>;
      case 'available':
        return <Badge className="bg-green-500 text-white text-xs">Available</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Offline</Badge>;
    }
  };

  const getJobStatusBadge = (job: Job) => {
    switch (job.status) {
      case 'pending':
        return <Badge className="bg-yellow-500 text-white text-xs">Pending</Badge>;
      case 'assigned':
        return <Badge className="bg-blue-500 text-white text-xs">Assigned</Badge>;
      case 'picked_up':
        return <Badge className="bg-purple-500 text-white text-xs">Picked Up</Badge>;
      case 'on_the_way':
        return <Badge className="bg-indigo-500 text-white text-xs">In Transit</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{job.status}</Badge>;
    }
  };

  const getConnectionStatus = () => {
    if (wsConnecting) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Connecting...
        </Badge>
      );
    }
    if (wsConnected) {
      return (
        <Badge className="bg-green-500 text-white gap-1">
          <Wifi className="h-3 w-3" />
          Live
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1 cursor-pointer" onClick={reconnect}>
        <WifiOff className="h-3 w-3" />
        Offline
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex gap-6">
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Live Map
                </CardTitle>
                {getConnectionStatus()}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span>On Delivery</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-gray-500 opacity-50" />
                    <span>Offline</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-orange-500 opacity-70" />
                    <span>Postcode</span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fitAllDrivers}
                  data-testid="button-fit-all-drivers"
                >
                  <Maximize2 className="h-4 w-4 mr-2" />
                  Fit All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { refetchDrivers(); refetchJobs(); }}
                  data-testid="button-refresh-map"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 h-full relative">
            {(mapsStatus === 'error' || mapsStatus === 'unconfigured' || mapError) ? (
              <MapFallback 
                status={mapError ? 'error' : mapsStatus} 
                error={mapError || mapsError} 
                onRetry={() => {
                  setMapError(null);
                  retryMaps();
                }}
                className="absolute inset-0"
              />
            ) : mapsStatus === 'loading' || !mapLoaded ? (
              <MapFallback status="loading" className="absolute inset-0" />
            ) : null}
            <div ref={mapRef} className="w-full h-full min-h-[400px]" data-testid="map-container" />
          </CardContent>
        </Card>

        <Card className="w-96 flex flex-col">
          <Tabs defaultValue="drivers" className="flex flex-col h-full">
            <CardHeader className="border-b pb-0">
              <TabsList className="w-full">
                <TabsTrigger value="drivers" className="flex-1" data-testid="tab-drivers">
                  <Truck className="h-4 w-4 mr-2" />
                  Drivers ({activeDrivers.length})
                </TabsTrigger>
                <TabsTrigger value="jobs" className="flex-1" data-testid="tab-jobs">
                  <Package className="h-4 w-4 mr-2" />
                  Jobs ({pendingJobs.length})
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-2 pb-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  {liveGpsCount} Live GPS
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                  {postcodeOnlyCount} Postcode Only
                </span>
              </div>
            </CardHeader>

            <TabsContent value="drivers" className="flex-1 flex flex-col mt-0 overflow-hidden">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search driver code e.g. RC28R"
                    value={driverSearchQuery}
                    onChange={(e) => handleDriverSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleDriverSearch(driverSearchQuery);
                      }
                    }}
                    className="pl-8 pr-8"
                    data-testid="input-driver-search"
                  />
                  {driverSearchQuery && (
                    <button
                      onClick={() => { setDriverSearchQuery(''); setSelectedDriver(null); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover-elevate rounded-sm"
                      data-testid="button-clear-driver-search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {driverSearchQuery && (
                  <p className="text-xs text-muted-foreground mt-1.5" data-testid="text-search-results-count">
                    {filteredDrivers.length} driver{filteredDrivers.length !== 1 ? 's' : ''} found
                  </p>
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {driversLoading ? (
                    [1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))
                  ) : filteredDrivers.length > 0 ? (
                    filteredDrivers.map((driver) => {
                      const currentJob = getDriverCurrentJob(driver.id);
                      const isLive = realtimeLocations.has(driver.id);
                      const driverLoc = getDriverLocation(driver);
                      const hasGpsLocation = driverLoc.source === 'gps';
                      const hasPostcodeLocation = driverLoc.source === 'postcode';
                      const isOnlineNoGps = driver.isAvailable && !hasGpsLocation;
                      
                      return (
                        <button
                          key={driver.id}
                          onClick={() => handleDriverClick(driver)}
                          className={`w-full p-3 rounded-lg border text-left transition-colors ${
                            selectedDriver?.id === driver.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover-elevate'
                          }`}
                          data-testid={`driver-card-${driver.id}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                  {(driver.fullName || driver.vehicleRegistration || 'DR')
                                    .split(' ')
                                    .map(n => n[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {isLive && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                              )}
                              {isOnlineNoGps && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-orange-500 rounded-full border-2 border-background" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {driver.driverCode && (
                                  <span className="font-mono font-bold text-blue-600 mr-1">{driver.driverCode}</span>
                                )}
                                <span className="text-muted-foreground">·</span>{' '}
                                {driver.fullName || driver.vehicleRegistration || 'Driver'}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Truck className="h-3 w-3" />
                                <span className="capitalize">{driver.vehicleType?.replace('_', ' ')}</span>
                                {driver.postcode && (
                                  <>
                                    <span className="text-muted-foreground/50">|</span>
                                    <MapPin className="h-3 w-3" />
                                    <span>{driver.postcode}</span>
                                  </>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2 flex-wrap">
                                {getStatusBadge(driver)}
                                {isLive && (
                                  <span className="text-[10px] text-green-600 font-medium">LIVE GPS</span>
                                )}
                                {!isLive && hasGpsLocation && driver.lastLocationUpdate && (
                                  <span className="text-[10px] text-yellow-600 font-medium">
                                    GPS {(() => {
                                      const diff = Date.now() - new Date(driver.lastLocationUpdate).getTime();
                                      const mins = Math.floor(diff / 60000);
                                      if (mins < 60) return `${mins}m ago`;
                                      const hrs = Math.floor(mins / 60);
                                      if (hrs < 24) return `${hrs}h ago`;
                                      return `${Math.floor(hrs / 24)}d ago`;
                                    })()}
                                  </span>
                                )}
                                {isOnlineNoGps && !hasPostcodeLocation && (
                                  <span className="text-[10px] text-orange-600 font-medium">NO GPS</span>
                                )}
                                {hasPostcodeLocation && (
                                  <span className="text-[10px] text-orange-500 font-medium">POSTCODE ONLY</span>
                                )}
                                {!driver.isVerified && (
                                  <span className="text-[10px] text-red-600 font-medium">NOT VERIFIED</span>
                                )}
                                <Button
                                  size="sm"
                                  variant={driver.isAvailable ? "outline" : "default"}
                                  className="h-5 px-2 text-[10px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleAvailabilityMutation.mutate({
                                      driverId: driver.id,
                                      isAvailable: !driver.isAvailable
                                    });
                                  }}
                                  disabled={toggleAvailabilityMutation.isPending}
                                  data-testid={`toggle-availability-${driver.id}`}
                                >
                                  {driver.isAvailable ? 'Set Offline' : 'Set Online'}
                                </Button>
                              </div>
                              {currentJob && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Job: {currentJob.trackingNumber}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{driverSearchQuery ? 'No drivers match your search' : 'No active drivers'}</p>
                      {driverSearchQuery && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => { setDriverSearchQuery(''); setSelectedDriver(null); }}
                          data-testid="button-clear-search-empty"
                        >
                          Clear search
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {selectedDriver && (
                <div className="border-t p-4">
                  <h4 className="font-semibold mb-3">
                    {selectedDriver.driverCode && (
                      <span className="font-mono font-bold text-blue-600 mr-1">{selectedDriver.driverCode}</span>
                    )}
                    <span className="text-muted-foreground">·</span>{' '}
                    {selectedDriver.fullName || selectedDriver.vehicleRegistration || 'Driver'}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="capitalize">{selectedDriver.vehicleType?.replace('_', ' ')}</span>
                      {selectedDriver.vehicleRegistration && (
                        <span className="text-muted-foreground">({selectedDriver.vehicleRegistration})</span>
                      )}
                    </div>
                    {selectedDriver.postcode && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>Area: {selectedDriver.postcode}</span>
                      </div>
                    )}
                    {(() => {
                      const loc = getDriverLocation(selectedDriver);
                      if (loc.source) {
                        return (
                          <div className="flex items-center gap-2">
                            <Navigation className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-mono">
                              {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                            </span>
                            {realtimeLocations.has(selectedDriver.id) && (
                              <Badge className="bg-green-500 text-white text-[10px] px-1 py-0">LIVE GPS</Badge>
                            )}
                            {loc.source === 'postcode' && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600 border-orange-300">POSTCODE ONLY</Badge>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {(() => {
                      const loc = getDriverLocation(selectedDriver);
                      if (loc.source === 'postcode') {
                        return (
                          <div className="text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/30 p-2 rounded-md">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            This driver has no live GPS. Location shown is based on their postcode. Ask them to open the app for real-time tracking.
                          </div>
                        );
                      }
                      if (loc.source === 'gps' && !realtimeLocations.has(selectedDriver.id) && selectedDriver.lastLocationUpdate) {
                        const diff = Date.now() - new Date(selectedDriver.lastLocationUpdate).getTime();
                        const mins = Math.floor(diff / 60000);
                        const timeStr = mins < 60 ? `${mins} minutes` : mins < 1440 ? `${Math.floor(mins / 60)} hours` : `${Math.floor(mins / 1440)} days`;
                        return (
                          <div className="text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded-md">
                            <Clock className="h-3 w-3 inline mr-1" />
                            Last GPS update was {timeStr} ago. Location may not be current.
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {getDriverCurrentJob(selectedDriver.id) && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Job: {getDriverCurrentJob(selectedDriver.id)?.trackingNumber}</span>
                      </div>
                    )}
                  </div>
                  {selectedDriver.phone && (
                    <Button 
                      className="w-full mt-4" 
                      size="sm" 
                      asChild
                      data-testid="button-contact-driver"
                    >
                      <a href={`tel:${selectedDriver.phone}`}>
                        <Phone className="h-4 w-4 mr-2" />
                        Call {selectedDriver.phone}
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="jobs" className="flex-1 flex flex-col mt-0 overflow-hidden">
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {pendingJobs.length > 0 ? (
                    pendingJobs.map((job) => (
                      <div
                        key={job.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          selectedJob?.id === job.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border'
                        }`}
                        data-testid={`job-card-${job.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => handleJobClick(job)}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Package className="h-4 w-4 text-primary" />
                              <span className="font-medium text-sm">{job.trackingNumber || `#${job.id}`}</span>
                              {getJobStatusBadge(job)}
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Navigation className="h-3 w-3 text-green-500" />
                                <span>{job.pickupPostcode}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3 w-3 text-red-500" />
                                <span>{job.deliveryPostcode}</span>
                              </div>
                            </div>
                          </button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAssignJob(job)}
                            data-testid={`button-assign-job-${job.id}`}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Assign
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No pending jobs</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {selectedJob && (
                <div className="border-t p-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {selectedJob.trackingNumber || `Job #${selectedJob.id}`}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-green-500" />
                      <span>From: {selectedJob.pickupPostcode}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-red-500" />
                      <span>To: {selectedJob.deliveryPostcode}</span>
                    </div>
                    {selectedJob.vehicleType && (
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span className="capitalize">{selectedJob.vehicleType.replace('_', ' ')}</span>
                      </div>
                    )}
                  </div>
                  {!selectedJob.driverId && (
                    <Button 
                      className="w-full mt-4" 
                      size="sm"
                      onClick={() => handleAssignJob(selectedJob)}
                      data-testid="button-assign-selected-job"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Assign to Driver
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <Dialog open={showAssignDialog} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Job to Driver</DialogTitle>
            <DialogDescription>
              Select a verified driver to assign this job to. Online drivers are marked with a badge.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Driver</label>
              <Select value={selectedDriverForAssign} onValueChange={setSelectedDriverForAssign}>
                <SelectTrigger data-testid="select-driver-for-assign">
                  <SelectValue placeholder="Select a driver" />
                </SelectTrigger>
                <SelectContent>
                  {activeDrivers.length > 0 ? (
                    activeDrivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {driver.driverCode && (
                            <span className="font-mono font-bold text-blue-600">{driver.driverCode}</span>
                          )}
                          <span>{driver.fullName || driver.vehicleRegistration || 'Driver'}</span>
                          {driver.isAvailable && (
                            <Badge variant="secondary" className="text-xs text-green-600">Online</Badge>
                          )}
                          <span className="text-muted-foreground text-xs capitalize">
                            ({driver.vehicleType?.replace('_', ' ')})
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No verified drivers
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Driver Payment (Required)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter driver payment amount"
                  value={driverPriceForAssign}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDriverPriceForAssign(e.target.value)}
                  className="pl-7"
                  data-testid="input-driver-price-assign"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This is the amount the driver will see and be paid. Required before driver can accept.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogClose(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmAssignJob} 
              disabled={!selectedDriverForAssign || !driverPriceForAssign || assignJobMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignJobMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Assign Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
