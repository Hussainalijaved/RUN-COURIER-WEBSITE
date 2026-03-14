import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, MapPin, Users, Package, AlertCircle } from 'lucide-react';

declare global {
  interface Window {
    google: any;
    initSupervisorMap?: () => void;
  }
}

interface DriverLocation {
  id: string;
  full_name?: string;
  driver_code?: string;
  vehicle_type?: string;
  is_available?: boolean;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  postcode?: string;
}

export default function SupervisorMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState('');

  const { data: drivers = [], refetch, isFetching } = useQuery<DriverLocation[]>({
    queryKey: ['/api/supabase-drivers'],
    queryFn: () => fetch('/api/supabase-drivers').then(r => r.json()),
    refetchInterval: 15000,
  });

  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ['/api/jobs', 'active-map'],
    queryFn: () => fetch('/api/jobs?limit=100').then(r => r.json()),
    refetchInterval: 30000,
  });

  const activeJobs = (jobs as any[]).filter((j: any) =>
    ['assigned', 'accepted', 'on_the_way_pickup', 'collected', 'on_the_way_delivery'].includes(j.status)
  );

  const driversWithLocation = (drivers as DriverLocation[]).filter(
    (d) => d.currentLatitude && d.currentLongitude
  );

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google) return;
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 51.5074, lng: -0.1278 },
      zoom: 10,
      mapTypeId: 'roadmap',
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    });
    setMapLoaded(true);
  }, []);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setMapError('Google Maps API key not configured.');
      return;
    }
    if (window.google?.maps) {
      initMap();
      return;
    }
    window.initSupervisorMap = initMap;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initSupervisorMap`;
    script.async = true;
    script.onerror = () => setMapError('Failed to load Google Maps.');
    document.head.appendChild(script);
    return () => {
      delete window.initSupervisorMap;
    };
  }, [initMap]);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;
    const currentIds = new Set<string>();

    for (const driver of driversWithLocation) {
      currentIds.add(driver.id);
      const pos = { lat: driver.currentLatitude!, lng: driver.currentLongitude! };
      if (markersRef.current.has(driver.id)) {
        markersRef.current.get(driver.id).setPosition(pos);
      } else {
        const marker = new window.google.maps.Marker({
          position: pos,
          map,
          title: driver.full_name || driver.driver_code || 'Driver',
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: driver.is_available ? '#22c55e' : '#3b82f6',
            fillOpacity: 0.9,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });
        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="font-size:13px;padding:4px 0"><strong>${driver.full_name || driver.driver_code || 'Driver'}</strong><br/>${driver.driver_code || ''}<br/>${driver.vehicle_type?.replace('_', ' ') || ''}</div>`,
        });
        marker.addListener('click', () => infoWindow.open(map, marker));
        markersRef.current.set(driver.id, marker);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }
  }, [driversWithLocation, mapLoaded]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-center justify-between gap-4 p-6 pb-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Live Map</h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time driver locations and job activity</p>
          </div>
          <Button variant="outline" size="default" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 px-6 pb-4 shrink-0">
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Live on Map</p>
                <p className="text-xl font-bold text-foreground">{driversWithLocation.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="p-4 flex items-center gap-3">
              <Package className="h-5 w-5 text-orange-600 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Active Jobs</p>
                <p className="text-xl font-bold text-foreground">{activeJobs.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="p-4 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-xl font-bold text-foreground">
                  {(drivers as DriverLocation[]).filter(d => d.is_available).length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 px-6 pb-6 min-h-0">
          {mapError ? (
            <div className="flex flex-col items-center justify-center h-full rounded-md border bg-muted/30 gap-3">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{mapError}</p>
            </div>
          ) : (
            <div ref={mapRef} className="w-full h-full min-h-[400px] rounded-md border" />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
