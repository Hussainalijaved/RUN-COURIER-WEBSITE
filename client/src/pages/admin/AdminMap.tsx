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
import { Truck, MapPin, Clock, Phone, RefreshCw, AlertCircle, Loader2, Wifi, WifiOff, Package, Navigation, Send, User } from 'lucide-react';
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
    refetchInterval: wsConnected ? false : 10000,
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

  // Show all online drivers in the list (not just verified ones)
  // This helps admin see drivers who are online but missing GPS or verification
  // Include drivers from real-time WebSocket who are online (instant status updates)
  const activeDrivers = drivers?.filter(d => {
    // Check real-time status first (instant updates from mobile app)
    const realtimeLoc = realtimeLocations.get(d.id);
    if (realtimeLoc?.isAvailable !== undefined) {
      return realtimeLoc.isAvailable || d.isVerified;
    }
    // Fallback to API data
    return d.isVerified || d.isAvailable;
  }) || [];
  
  const availableDrivers = activeDrivers.filter(d => {
    const realtimeLoc = realtimeLocations.get(d.id);
    return realtimeLoc?.isAvailable ?? d.isAvailable;
  });
  
  // Show ALL jobs that are not completed (delivered/cancelled) on the map
  const pendingJobs = jobs?.filter(j => j.status === 'pending') || [];
  const activeJobs = jobs?.filter(j => !['delivered', 'cancelled', 'pending'].includes(j.status)) || [];
  const allActiveBookings = jobs?.filter(j => !['delivered', 'cancelled'].includes(j.status)) || [];

  const getDriverLocation = useCallback((driver: Driver): { lat: number; lng: number } | null => {
    const realtimeLoc = realtimeLocations.get(driver.id);
    if (realtimeLoc) {
      return { lat: realtimeLoc.lat, lng: realtimeLoc.lng };
    }
    
    if (driver.currentLatitude && driver.currentLongitude) {
      const lat = parseFloat(driver.currentLatitude);
      const lng = parseFloat(driver.currentLongitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    
    return null;
  }, [realtimeLocations]);

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
              multiDropStops = data.stops
                .filter((stop: MultiDropStop) => stop.latitude && stop.longitude)
                .sort((a: MultiDropStop, b: MultiDropStop) => a.stopOrder - b.stopOrder)
                .map((stop: MultiDropStop) => ({
                  lat: parseFloat(String(stop.latitude)),
                  lng: parseFloat(String(stop.longitude)),
                  postcode: stop.postcode,
                  stopOrder: stop.stopOrder,
                }));
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
      if (!location) return;

      currentMarkerIds.add(driver.id);
      const status = getDriverStatus(driver);
      const fillColor = status === 'on_delivery' ? '#3B82F6' : status === 'available' ? '#22C55E' : '#9CA3AF';

      const existingMarker = driverMarkersRef.current.get(driver.id);
      
      if (existingMarker) {
        existingMarker.setPosition(location);
        existingMarker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        });
      } else {
        const driverLabel = driver.driverCode 
          ? `${driver.driverCode} · ${driver.fullName || 'Driver'}` 
          : driver.fullName || driver.vehicleRegistration || 'Driver';
        const marker = new google.maps.Marker({
          position: location,
          map,
          title: driverLabel,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        marker.addListener('click', () => {
          setSelectedDriver(driver);
          setSelectedJob(null);
          map.panTo(location);
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
          infoWindowRef.current.setContent(`
            <div style="padding: 8px; font-family: system-ui, -apple-system, sans-serif; min-width: 150px;">
              <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${driverDisplay}</div>
              <div style="font-size: 12px; color: #666; text-transform: capitalize;">Vehicle: ${vehicleType}</div>
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
  }, [activeDrivers, mapLoaded, jobs, realtimeLocations, getDriverLocation]);

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
    if (map && location) {
      map.panTo(location);
      map.setZoom(15);
    }
  };

  const handleJobClick = (job: Job) => {
    setSelectedJob(job);
    setSelectedDriver(null);
    const map = mapInstanceRef.current;
    const location = jobLocations.get(job.id);
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
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span>Pending Job</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>Available Driver</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span>Active Job/Driver</span>
                  </div>
                </div>
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
            </CardHeader>

            <TabsContent value="drivers" className="flex-1 flex flex-col mt-0 overflow-hidden">
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {driversLoading ? (
                    [1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))
                  ) : activeDrivers.length > 0 ? (
                    activeDrivers.map((driver) => {
                      const currentJob = getDriverCurrentJob(driver.id);
                      const isLive = realtimeLocations.has(driver.id);
                      const hasLocation = getDriverLocation(driver) !== null;
                      const isOnlineNoGps = driver.isAvailable && !hasLocation;
                      
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
                              </div>
                              <div className="mt-1 flex items-center gap-2 flex-wrap">
                                {getStatusBadge(driver)}
                                {isLive && (
                                  <span className="text-[10px] text-green-600 font-medium">LIVE</span>
                                )}
                                {isOnlineNoGps && (
                                  <span className="text-[10px] text-orange-600 font-medium">NO GPS</span>
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
                      <p className="text-sm">No active drivers</p>
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
                    {(() => {
                      const loc = getDriverLocation(selectedDriver);
                      if (loc) {
                        return (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-mono">
                              {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                            </span>
                            {realtimeLocations.has(selectedDriver.id) && (
                              <Badge className="bg-green-500 text-white text-[10px] px-1 py-0">LIVE</Badge>
                            )}
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
