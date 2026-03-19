import { useEffect, useRef, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { MapFallback } from '@/components/ui/map-fallback';
import { Search, X, MapPin, Info, Loader2, Plus, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PostcodeInfo {
  postcode: string;
  quality: number;
  eastings: number;
  northings: number;
  country: string;
  nhs_ha: string;
  longitude: number;
  latitude: number;
  european_electoral_region: string;
  primary_care_trust: string;
  region: string;
  lsoa: string;
  msoa: string;
  incode: string;
  outcode: string;
  parliamentary_constituency: string;
  admin_district: string;
  parish: string;
  date_of_introduction: string;
  admin_ward: string;
  ced: string;
  ccg: string;
  nuts: string;
  pfa: string;
  codes: {
    admin_district: string;
    admin_county: string;
    admin_ward: string;
    parish: string;
    parliamentary_constituency: string;
    ccg: string;
    ccg_id: string;
    ced: string;
    nuts: string;
    lsoa: string;
    msoa: string;
    lau2: string;
    pfa: string;
  };
  admin_county: string;
}

interface PinnedPostcode {
  id: string;
  postcode: string;
  info: PostcodeInfo;
  color: string;
  marker: google.maps.Marker | null;
  circle: google.maps.Circle | null;
}

const ZONE_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
];

// Approximate circle radius based on outcode length (postcode district vs sector)
function getZoneRadius(postcode: string): number {
  const parts = postcode.trim().split(' ');
  if (parts.length === 2 && parts[1].length === 3) {
    // Full postcode (e.g. SW1A 1AA) — small sector
    return 400;
  }
  if (parts.length === 1 && parts[0].length <= 4) {
    // Outcode only (e.g. SW1A) — district level
    return 2000;
  }
  return 600;
}

export default function PostcodeMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const { isReady, error: loadError } = useGoogleMaps();

  const [searchValue, setSearchValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLooking, setIsLooking] = useState(false);
  const [pinnedPostcodes, setPinnedPostcodes] = useState<PinnedPostcode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const colorIndexRef = useRef(0);
  const { toast } = useToast();

  // Initialise the Google Map
  useEffect(() => {
    if (!isReady || !mapRef.current || mapInstanceRef.current) return;
    try {
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: 54.5, lng: -3.0 },
        zoom: 6,
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      });
      mapInstanceRef.current = map;
    } catch (e) {
      setMapError('Failed to load map');
    }
  }, [isReady]);

  // Autocomplete from postcodes.io
  const fetchSuggestions = useCallback(async (query: string) => {
    const q = query.trim().toUpperCase();
    if (q.length < 2) { setSuggestions([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes?q=${encodeURIComponent(q)}&limit=6`);
      const data = await res.json();
      if (data.result) {
        setSuggestions(data.result.map((r: any) => r.postcode));
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue.trim().length >= 2) {
        fetchSuggestions(searchValue);
      } else {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, fetchSuggestions]);

  const lookupPostcode = useCallback(async (postcode: string) => {
    const pc = postcode.trim().toUpperCase();
    if (!pc) return;

    // Check for duplicates
    if (pinnedPostcodes.some(p => p.postcode === pc)) {
      toast({ title: 'Already on map', description: `${pc} is already pinned.`, variant: 'default' });
      setSearchValue('');
      setSuggestions([]);
      return;
    }

    setIsLooking(true);
    setSuggestions([]);
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
      const data = await res.json();
      if (data.status !== 200 || !data.result) {
        toast({ title: 'Postcode not found', description: `"${pc}" is not a valid UK postcode.`, variant: 'destructive' });
        return;
      }
      const info: PostcodeInfo = data.result;
      const color = ZONE_COLORS[colorIndexRef.current % ZONE_COLORS.length];
      colorIndexRef.current++;

      const map = mapInstanceRef.current;
      let marker: google.maps.Marker | null = null;
      let circle: google.maps.Circle | null = null;

      if (map) {
        const pos = { lat: info.latitude, lng: info.longitude };

        marker = new google.maps.Marker({
          position: pos,
          map,
          title: info.postcode,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          label: {
            text: info.outcode,
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 'bold',
          },
          zIndex: 100,
        });

        circle = new google.maps.Circle({
          map,
          center: pos,
          radius: getZoneRadius(info.postcode),
          fillColor: color,
          fillOpacity: 0.18,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 2,
        });

        // Pan/zoom to the postcode
        map.panTo(pos);
        map.setZoom(13);
      }

      const id = `${pc}-${Date.now()}`;
      const pinned: PinnedPostcode = { id, postcode: pc, info, color, marker, circle };
      setPinnedPostcodes(prev => [...prev, pinned]);
      setSelectedId(id);
      setSearchValue('');
    } catch {
      toast({ title: 'Lookup failed', description: 'Could not fetch postcode data. Try again.', variant: 'destructive' });
    } finally {
      setIsLooking(false);
    }
  }, [pinnedPostcodes, toast]);

  const removePostcode = useCallback((id: string) => {
    setPinnedPostcodes(prev => {
      const item = prev.find(p => p.id === id);
      if (item) {
        item.marker?.setMap(null);
        item.circle?.setMap(null);
      }
      return prev.filter(p => p.id !== id);
    });
    setSelectedId(prev => (prev === id ? null : prev));
  }, []);

  const focusPostcode = useCallback((item: PinnedPostcode) => {
    setSelectedId(item.id);
    const map = mapInstanceRef.current;
    if (map) {
      map.panTo({ lat: item.info.latitude, lng: item.info.longitude });
      map.setZoom(13);
    }
  }, []);

  const clearAll = useCallback(() => {
    pinnedPostcodes.forEach(p => {
      p.marker?.setMap(null);
      p.circle?.setMap(null);
    });
    setPinnedPostcodes([]);
    setSelectedId(null);
    colorIndexRef.current = 0;
    mapInstanceRef.current?.panTo({ lat: 54.5, lng: -3.0 });
    mapInstanceRef.current?.setZoom(6);
  }, [pinnedPostcodes]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      lookupPostcode(searchValue);
    }
  };

  const selectedItem = pinnedPostcodes.find(p => p.id === selectedId) || pinnedPostcodes[pinnedPostcodes.length - 1];

  if (loadError || mapError) {
    return (
      <DashboardLayout>
        <MapFallback message={loadError || mapError || 'Map failed to load'} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 border-r border-border flex flex-col h-full bg-background">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-base">Postcode Zone Map</h2>
            </div>
            {/* Search */}
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter UK postcode..."
                    className="pl-9"
                    data-testid="input-postcode-search"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Button
                  size="icon"
                  onClick={() => lookupPostcode(searchValue)}
                  disabled={isLooking || !searchValue.trim()}
                  data-testid="button-postcode-lookup"
                >
                  {isLooking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>

              {/* Autocomplete dropdown */}
              {suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-background shadow-md overflow-hidden">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      className="w-full text-left px-3 py-2 text-sm hover-elevate flex items-center gap-2"
                      onClick={() => { setSuggestions([]); lookupPostcode(s); }}
                      data-testid={`suggestion-${s}`}
                    >
                      <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pinned list */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {pinnedPostcodes.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <span className="text-xs text-muted-foreground font-medium">{pinnedPostcodes.length} zone{pinnedPostcodes.length !== 1 ? 's' : ''} pinned</span>
                  <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7 px-2">
                    Clear all
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {pinnedPostcodes.map(item => (
                      <button
                        key={item.id}
                        onClick={() => focusPostcode(item)}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          selectedId === item.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover-elevate'
                        }`}
                        data-testid={`pinned-${item.postcode}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-3 w-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="font-mono font-bold text-sm">{item.postcode}</span>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={e => { e.stopPropagation(); removePostcode(item.id); }}
                            data-testid={`remove-${item.postcode}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate pl-5">
                          {item.info.admin_district || item.info.admin_ward || item.info.region || '—'}
                        </p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
                <MapPin className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No zones pinned yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Search a UK postcode above to pin it on the map</p>
                </div>
              </div>
            )}
          </div>

          {/* Postcode detail panel */}
          {selectedItem && (
            <div className="border-t border-border p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedItem.color }} />
                <span className="font-mono font-bold text-sm">{selectedItem.postcode}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{selectedItem.info.country}</Badge>
              </div>
              <div className="space-y-1.5 text-xs">
                {selectedItem.info.admin_district && (
                  <InfoRow label="District" value={selectedItem.info.admin_district} />
                )}
                {selectedItem.info.admin_ward && (
                  <InfoRow label="Ward" value={selectedItem.info.admin_ward} />
                )}
                {selectedItem.info.admin_county && (
                  <InfoRow label="County" value={selectedItem.info.admin_county} />
                )}
                {selectedItem.info.region && (
                  <InfoRow label="Region" value={selectedItem.info.region} />
                )}
                {selectedItem.info.parliamentary_constituency && (
                  <InfoRow label="Constituency" value={selectedItem.info.parliamentary_constituency} />
                )}
                <InfoRow
                  label="Coordinates"
                  value={`${selectedItem.info.latitude.toFixed(4)}, ${selectedItem.info.longitude.toFixed(4)}`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" data-testid="postcode-map-container" />

          {/* Map overlay hint */}
          {isReady && pinnedPostcodes.length === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm border border-border rounded-lg px-4 py-2 shadow-md pointer-events-none">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Info className="h-4 w-4 flex-shrink-0" />
                Search a postcode on the left to see its zone on the map
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground flex-shrink-0 w-24">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
