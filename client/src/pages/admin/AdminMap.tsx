import { useEffect, useRef, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { initGoogleMaps, getMapCenter } from '@/lib/maps';
import { Truck, MapPin, Clock, Phone, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Driver, Job } from '@shared/schema';

export default function AdminMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: drivers, isLoading: driversLoading, refetch: refetchDrivers } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
    refetchInterval: 10000,
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 10000,
  });

  const activeDrivers = drivers?.filter(d => d.isVerified) || [];

  const getDriverCurrentJob = (driverId: string) => {
    return jobs?.find(j => 
      j.driverId === driverId && 
      !['delivered', 'cancelled', 'pending'].includes(j.status)
    );
  };

  const getDriverStatus = (driver: Driver) => {
    const currentJob = getDriverCurrentJob(driver.id);
    if (currentJob) return 'on_delivery';
    if (driver.isAvailable) return 'available';
    return 'offline';
  };

  const initMap = useCallback(async () => {
    if (mapInstanceRef.current || !mapRef.current) return;

    try {
      await initGoogleMaps();
      
      if (typeof google === 'undefined' || !google.maps) {
        setMapError('Google Maps failed to load. Please check your API key configuration.');
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
    } catch (error) {
      console.error('Error loading map:', error);
      setMapError('Failed to initialize Google Maps. Please try refreshing the page.');
    }
  }, []);

  useEffect(() => {
    initMap();
  }, [initMap]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    
    activeDrivers.forEach((driver) => {
      if (!driver.currentLatitude || !driver.currentLongitude) return;

      const lat = parseFloat(driver.currentLatitude);
      const lng = parseFloat(driver.currentLongitude);
      
      if (isNaN(lat) || isNaN(lng)) return;

      const status = getDriverStatus(driver);
      const fillColor = status === 'on_delivery' ? '#3B82F6' : status === 'available' ? '#22C55E' : '#9CA3AF';

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        title: driver.fullName || driver.vehicleRegistration || 'Driver',
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
        map.panTo({ lat, lng });
        map.setZoom(15);
      });

      markersRef.current.push(marker);
    });
  }, [activeDrivers, mapLoaded, jobs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchDrivers();
    setIsRefreshing(false);
  };

  const handleDriverClick = (driver: Driver) => {
    setSelectedDriver(driver);
    const map = mapInstanceRef.current;
    if (map && driver.currentLatitude && driver.currentLongitude) {
      const lat = parseFloat(driver.currentLatitude);
      const lng = parseFloat(driver.currentLongitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.panTo({ lat, lng });
        map.setZoom(15);
      }
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

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex gap-6">
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Live Driver Map
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isRefreshing}
                data-testid="button-refresh-map"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 h-full relative">
            {mapError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 p-8">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <p className="text-center text-destructive font-medium mb-2">Map Error</p>
                <p className="text-center text-muted-foreground text-sm max-w-md">{mapError}</p>
                <Button 
                  variant="outline" 
                  className="mt-4" 
                  onClick={() => {
                    setMapError(null);
                    initMap();
                  }}
                >
                  Try Again
                </Button>
              </div>
            ) : !mapLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading map...</p>
                </div>
              </div>
            ) : null}
            <div ref={mapRef} className="w-full h-full min-h-[400px]" data-testid="map-container" />
          </CardContent>
        </Card>

        <Card className="w-80 flex flex-col">
          <CardHeader className="border-b">
            <CardTitle className="text-base flex items-center gap-2">
              Active Drivers
              {activeDrivers.length > 0 && (
                <Badge variant="secondary">{activeDrivers.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {driversLoading ? (
                [1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))
              ) : activeDrivers.length > 0 ? (
                activeDrivers.map((driver) => {
                  const currentJob = getDriverCurrentJob(driver.id);
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
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {driver.fullName || driver.vehicleRegistration || 'Driver'}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Truck className="h-3 w-3" />
                            <span className="capitalize">{driver.vehicleType?.replace('_', ' ')}</span>
                          </div>
                          <div className="mt-1">
                            {getStatusBadge(driver)}
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
                {selectedDriver.currentLatitude && selectedDriver.currentLongitude && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-mono">
                      {parseFloat(selectedDriver.currentLatitude).toFixed(4)}, 
                      {parseFloat(selectedDriver.currentLongitude).toFixed(4)}
                    </span>
                  </div>
                )}
                {getDriverCurrentJob(selectedDriver.id) && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Job: {getDriverCurrentJob(selectedDriver.id)?.trackingNumber}</span>
                  </div>
                )}
              </div>
              {selectedDriver.phone && (
                <Button className="w-full mt-4" size="sm" data-testid="button-contact-driver">
                  <Phone className="h-4 w-4 mr-2" />
                  Contact Driver
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
