import { useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { initGoogleMaps, getMapCenter } from '@/lib/maps';
import { Truck, MapPin, Clock, Phone, RefreshCw } from 'lucide-react';

const mockDriverLocations = [
  { id: 'd1', name: 'Mike Wilson', vehicle: 'Car', lat: 51.5145, lng: -0.0894, status: 'on_delivery', currentJob: 'RC001234' },
  { id: 'd2', name: 'Tom Brown', vehicle: 'Motorbike', lat: 51.5074, lng: -0.1278, status: 'available', currentJob: null },
  { id: 'd3', name: 'James Lee', vehicle: 'Car', lat: 51.4978, lng: -0.1357, status: 'on_delivery', currentJob: 'RC001237' },
  { id: 'd4', name: 'Sarah Miller', vehicle: 'Small Van', lat: 51.5225, lng: -0.0839, status: 'available', currentJob: null },
];

export default function AdminMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<typeof mockDriverLocations[0] | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);

  useEffect(() => {
    const loadMap = async () => {
      try {
        const google = await initGoogleMaps();
        if (mapRef.current && !map) {
          const center = getMapCenter();
          const newMap = new google.maps.Map(mapRef.current, {
            center,
            zoom: 12,
            styles: [
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            ],
          });
          setMap(newMap);
        }
      } catch (error) {
        console.error('Error loading map:', error);
      }
    };
    loadMap();
  }, []);

  useEffect(() => {
    if (!map) return;

    markers.forEach(m => m.setMap(null));
    
    const newMarkers = mockDriverLocations.map((driver) => {
      const marker = new google.maps.Marker({
        position: { lat: driver.lat, lng: driver.lng },
        map,
        title: driver.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: driver.status === 'on_delivery' ? '#3B82F6' : '#22C55E',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      marker.addListener('click', () => {
        setSelectedDriver(driver);
      });

      return marker;
    });

    setMarkers(newMarkers);
  }, [map]);

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex gap-6">
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Live Driver Map
              </CardTitle>
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 h-full">
            <div ref={mapRef} className="w-full h-full min-h-[400px]" data-testid="map-container" />
          </CardContent>
        </Card>

        <Card className="w-80 flex flex-col">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Active Drivers</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {mockDriverLocations.map((driver) => (
                <button
                  key={driver.id}
                  onClick={() => {
                    setSelectedDriver(driver);
                    if (map) {
                      map.panTo({ lat: driver.lat, lng: driver.lng });
                      map.setZoom(15);
                    }
                  }}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selectedDriver?.id === driver.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  data-testid={`driver-card-${driver.id}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {driver.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{driver.name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Truck className="h-3 w-3" />
                        {driver.vehicle}
                      </div>
                      <div className="mt-1">
                        {driver.status === 'on_delivery' ? (
                          <Badge className="bg-blue-500 text-white text-xs">On Delivery</Badge>
                        ) : (
                          <Badge className="bg-green-500 text-white text-xs">Available</Badge>
                        )}
                      </div>
                      {driver.currentJob && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Job: {driver.currentJob}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>

          {selectedDriver && (
            <div className="border-t p-4">
              <h4 className="font-semibold mb-3">{selectedDriver.name}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedDriver.vehicle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedDriver.lat.toFixed(4)}, {selectedDriver.lng.toFixed(4)}</span>
                </div>
                {selectedDriver.currentJob && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Job: {selectedDriver.currentJob}</span>
                  </div>
                )}
              </div>
              <Button className="w-full mt-4" size="sm">
                <Phone className="h-4 w-4 mr-2" />
                Contact Driver
              </Button>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
