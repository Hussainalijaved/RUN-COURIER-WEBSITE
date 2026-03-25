import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  MapPin,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Navigation,
  Milestone,
  Mail,
  MessageCircle,
  Send,
  Loader2,
  RotateCcw,
  Copy,
  CheckCheck,
  Flag,
  ExternalLink,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Driver } from '@shared/schema';

declare global {
  interface Window {
    google: typeof google;
    _routePlannerMapCb?: () => void;
  }
}

interface Stop {
  id: string;
  postcode: string;
}

interface RouteLeg {
  from: string;
  to: string;
  distance: number;
  duration: number;
}

interface RouteResult {
  legs: RouteLeg[];
  optimizedOrder: number[];
  totalDistance: number;
  totalDuration: number;
  routeMapUrl?: string;
}

interface AutocompletePrediction {
  place_id: string;
  description: string;
  structured_formatting?: { main_text: string; secondary_text: string };
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const STOP_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2'];

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatDistance(miles: number) {
  return `${miles.toFixed(1)} mi`;
}

function stopColor(i: number, total: number) {
  if (i === 0) return '#16a34a';
  if (i === total - 1) return '#dc2626';
  return '#2563eb';
}

// ─── Postcode autocomplete input ────────────────────────────────────────────
function PostcodeInput({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AutocompletePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/maps/autocomplete?input=${encodeURIComponent(val)}`);
        const data = await res.json();
        setSuggestions(data.predictions || []);
        setOpen((data.predictions || []).length > 0);
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 300);
  };

  const select = (pred: AutocompletePrediction) => {
    // Extract the main text (usually postcode or short address) as the value
    const main = pred.structured_formatting?.main_text || pred.description.split(',')[0];
    setQuery(main.toUpperCase());
    onChange(main.toUpperCase());
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative flex-1">
      <Input
        value={query}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        className="uppercase"
        data-testid={testId}
        autoComplete="off"
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
      />
      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-md overflow-hidden">
          {suggestions.slice(0, 6).map(pred => (
            <button
              key={pred.place_id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover-elevate truncate"
              onMouseDown={e => { e.preventDefault(); select(pred); }}
            >
              <span className="font-medium">{pred.structured_formatting?.main_text || pred.description}</span>
              {pred.structured_formatting?.secondary_text && (
                <span className="text-muted-foreground ml-1 text-xs">{pred.structured_formatting.secondary_text}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminRoutePlanner() {
  const { toast } = useToast();

  const [stops, setStops] = useState<Stop[]>([
    { id: genId(), postcode: '' },
    { id: genId(), postcode: '' },
  ]);
  const [startMode, setStartMode] = useState<'first' | 'last' | 'custom'>('first');
  const [endMode, setEndMode] = useState<'last' | 'first' | 'custom'>('last');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [optimizeRoute, setOptimizeRoute] = useState(false);

  const [calculating, setCalculating] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [displayedStops, setDisplayedStops] = useState<{ postcode: string }[]>([]);

  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendMethod, setSendMethod] = useState<'email' | 'whatsapp'>('email');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const mapsReadyRef = useRef(false);

  const { data: drivers } = useQuery<Driver[]>({ queryKey: ['/api/drivers'] });
  const activeDrivers = drivers?.filter(d => (d as any).status === 'verified' || (d as any).status === 'approved' || (d as any).status === 'active' || d.isVerified || d.isActive !== false) || [];

  // ── Load Google Maps ────────────────────────────────────────────────────────
  const initMap = useCallback(() => {
    if (!mapRef.current || mapsReadyRef.current) return;
    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 52.5, lng: -1.5 },
      zoom: 6,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    });
    mapInstanceRef.current = map;
    mapsReadyRef.current = true;
  }, []);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    if (window.google?.maps) {
      initMap();
      return;
    }

    window._routePlannerMapCb = initMap;

    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      // Script already loading – poll until ready
      const poll = setInterval(() => {
        if (window.google?.maps) { clearInterval(poll); initMap(); }
      }, 200);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=_routePlannerMapCb&loading=async`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => { delete window._routePlannerMapCb; };
  }, [initMap]);

  // ── Geocode & draw on map ────────────────────────────────────────────────
  const drawMarkersAndPolyline = useCallback(async (orderedPostcodes: string[]) => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    const map = mapInstanceRef.current;

    // Clear previous
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

    // Geocode each stop via our backend proxy
    const coords: google.maps.LatLng[] = [];
    for (let i = 0; i < orderedPostcodes.length; i++) {
      try {
        const res = await fetch(`/api/maps/geocode?address=${encodeURIComponent(orderedPostcodes[i] + ', UK')}`);
        const data = await res.json();
        if (data.results?.[0]?.geometry?.location) {
          const { lat, lng } = data.results[0].geometry.location;
          coords.push(new google.maps.LatLng(lat, lng));
        }
      } catch { /* skip if geocoding fails */ }
    }

    if (coords.length === 0) return;

    const total = orderedPostcodes.length;
    const bounds = new google.maps.LatLngBounds();

    coords.forEach((coord, i) => {
      bounds.extend(coord);
      const label = ALPHA[i] || String(i + 1);
      const color = stopColor(i, total);

      // SVG pin marker
      const svgMarker = {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
        scale: 14,
      };

      const marker = new google.maps.Marker({
        position: coord,
        map,
        icon: svgMarker,
        label: { text: label, color: '#fff', fontSize: '11px', fontWeight: 'bold' },
        title: orderedPostcodes[i],
        zIndex: 100 + i,
      });
      markersRef.current.push(marker);
    });

    // Draw polyline connecting stops in order
    if (coords.length >= 2) {
      const polyline = new google.maps.Polyline({
        path: coords,
        geodesic: true,
        strokeColor: '#2563eb',
        strokeOpacity: 0.85,
        strokeWeight: 4,
        map,
        icons: [{
          icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: '#1d4ed8' },
          offset: '50%',
        }],
      });
      polylineRef.current = polyline;
    }

    // Fit map to show all stops
    if (coords.length === 1) {
      map.setCenter(coords[0]);
      map.setZoom(13);
    } else {
      map.fitBounds(bounds, { top: 60, bottom: 40, left: 40, right: 40 });
    }
  }, []);

  // ── Route calculation ────────────────────────────────────────────────────
  const getEffectiveStart = () => {
    if (startMode === 'custom') return customStart.trim();
    if (startMode === 'first') return stops[0]?.postcode || '';
    return stops[stops.length - 1]?.postcode || '';
  };

  const getEffectiveEnd = () => {
    if (endMode === 'custom') return customEnd.trim();
    if (endMode === 'last') return stops[stops.length - 1]?.postcode || '';
    return stops[0]?.postcode || '';
  };

  const calculateRoute = async () => {
    const validStops = stops.filter(s => s.postcode.trim());
    if (validStops.length < 2) {
      toast({ title: 'Add at least 2 postcodes', variant: 'destructive' });
      return;
    }

    const start = getEffectiveStart();
    if (!start) {
      toast({ title: 'Set a starting point', variant: 'destructive' });
      return;
    }

    setCalculating(true);
    setRouteResult(null);

    try {
      // Build the origin + drops array
      // The backend API takes origin (start) and drops (pipe-separated stops including end)
      let allStopPostcodes = validStops.map(s => s.postcode.trim());

      // If start mode is 'first', the first stop is the origin — drops start from index 1
      // If start mode is 'last', the last stop is the origin — drops are everything except last
      // If start mode is 'custom', origin is customStart — all stops are drops
      let origin = start;
      let drops: string[];

      if (startMode === 'first') {
        drops = allStopPostcodes.slice(1);
      } else if (startMode === 'last') {
        drops = allStopPostcodes.slice(0, -1);
      } else {
        drops = [...allStopPostcodes];
      }

      // If end mode is 'custom' and it's different from the last drop, append it
      if (endMode === 'custom' && customEnd.trim() && customEnd.trim() !== drops[drops.length - 1]) {
        drops.push(customEnd.trim());
      }

      if (drops.length === 0) {
        toast({ title: 'Add more stops', variant: 'destructive' });
        setCalculating(false);
        return;
      }

      const url = `/api/maps/optimized-route?origin=${encodeURIComponent(origin)}&drops=${drops.map(encodeURIComponent).join('|')}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Route calculation failed');
      }

      const data: RouteResult = await res.json();
      setRouteResult(data);

      // Build the ordered list for display and map drawing
      const ordered = [{ postcode: origin }, ...drops.map(p => ({ postcode: p }))];
      setDisplayedStops(ordered);

      // Draw on map
      await drawMarkersAndPolyline(ordered.map(s => s.postcode));

      toast({
        title: 'Route calculated',
        description: `${formatDistance(data.totalDistance)} · ${formatDuration(data.totalDuration)}`,
      });
    } catch (err: any) {
      toast({ title: 'Error calculating route', description: err.message, variant: 'destructive' });
    } finally {
      setCalculating(false);
    }
  };

  // ── Stop management ──────────────────────────────────────────────────────
  const addStop = () => setStops(prev => [...prev, { id: genId(), postcode: '' }]);

  const removeStop = (id: string) => {
    if (stops.length <= 2) return;
    setStops(prev => prev.filter(s => s.id !== id));
  };

  const moveStop = (id: string, dir: 'up' | 'down') => {
    setStops(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const updateStopPostcode = (id: string, value: string) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, postcode: value } : s));
  };

  const resetAll = () => {
    setStops([{ id: genId(), postcode: '' }, { id: genId(), postcode: '' }]);
    setRouteResult(null);
    setDisplayedStops([]);
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat: 52.5, lng: -1.5 });
      mapInstanceRef.current.setZoom(6);
    }
  };

  // ── Sharing ───────────────────────────────────────────────────────────────
  const buildMapsLink = () => {
    if (displayedStops.length < 2) return '';
    const all = displayedStops.map(s => encodeURIComponent(s.postcode + ', UK'));
    const origin = all[0];
    const dest = all[all.length - 1];
    const waypoints = all.slice(1, -1).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
  };

  const buildRouteText = () => {
    if (!routeResult) return '';
    let text = `Route Plan\n`;
    text += `Total: ${formatDistance(routeResult.totalDistance)} · ${formatDuration(routeResult.totalDuration)}\n\n`;
    text += `Stops:\n`;
    displayedStops.forEach((s, i) => { text += `  ${ALPHA[i] || (i + 1)}. ${s.postcode}\n`; });
    if (routeResult.legs.length > 0) {
      text += `\nLeg Details:\n`;
      routeResult.legs.forEach((leg, i) => {
        text += `  ${ALPHA[i] || (i + 1)} → ${ALPHA[i + 1] || (i + 2)}: ${formatDistance(leg.distance)}, ${formatDuration(leg.duration)}\n`;
      });
    }
    const link = buildMapsLink();
    if (link) text += `\nOpen in Google Maps:\n${link}`;
    return text;
  };

  const selectedDriver = activeDrivers.find(d => d.id === selectedDriverId);
  const getDriverEmail = () => (selectedDriver?.email || customEmail);
  const getDriverPhone = () => (selectedDriver?.phone || customPhone);

  const sendRouteEmail = async () => {
    const email = getDriverEmail();
    if (!email) { toast({ title: 'Enter an email address', variant: 'destructive' }); return; }
    setSending(true);
    try {
      await apiRequest('POST', '/api/route-planner/send-email', {
        to: email,
        driverName: selectedDriver?.fullName || 'Driver',
        routeText: buildRouteText(),
        mapsLink: buildMapsLink(),
        legs: routeResult?.legs,
        stops: displayedStops,
        totalDistance: routeResult?.totalDistance,
        totalDuration: routeResult?.totalDuration,
      });
      toast({ title: 'Route sent via email' });
      setSendDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to send email', description: err.message, variant: 'destructive' });
    } finally { setSending(false); }
  };

  const sendViaWhatsApp = () => {
    const phone = getDriverPhone().replace(/\D/g, '');
    const text = buildRouteText();
    const encoded = encodeURIComponent(text);
    const waPhone = phone
      ? (phone.startsWith('44') ? phone : '44' + phone.replace(/^0/, ''))
      : '';
    const url = waPhone ? `https://wa.me/${waPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
    setSendDialogOpen(false);
  };

  const copyRouteText = () => {
    navigator.clipboard.writeText(buildRouteText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const validStopsCount = stops.filter(s => s.postcode.trim()).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Route Planner</h1>
            <p className="text-muted-foreground">Plan multi-stop routes and share them with drivers</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetAll} data-testid="button-reset-route">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            {routeResult && (
              <Button size="sm" onClick={() => setSendDialogOpen(true)} data-testid="button-send-route">
                <Send className="h-4 w-4 mr-2" />
                Send to Driver
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* ── Left panel ────────────────────────────────────────────── */}
          <div className="xl:col-span-2 space-y-4">

            {/* Stops editor */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Stops
                </CardTitle>
                <CardDescription>Type a postcode or address — suggestions will appear</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {stops.map((stop, idx) => (
                  <div key={stop.id} className="flex items-center gap-2" data-testid={`row-stop-${idx}`}>
                    {/* Reorder buttons */}
                    <div className="flex flex-col">
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => moveStop(stop.id, 'up')}
                        disabled={idx === 0}
                        data-testid={`button-move-up-${idx}`}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => moveStop(stop.id, 'down')}
                        disabled={idx === stops.length - 1}
                        data-testid={`button-move-down-${idx}`}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Stop label circle */}
                    <div
                      className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: stopColor(idx, stops.length) }}
                    >
                      {ALPHA[idx] || (idx + 1)}
                    </div>

                    {/* Autocomplete input */}
                    <PostcodeInput
                      value={stop.postcode}
                      onChange={val => updateStopPostcode(stop.id, val)}
                      placeholder={idx === 0 ? 'Start, e.g. SW1A 1AA' : `Stop ${ALPHA[idx]}`}
                      testId={`input-stop-${idx}`}
                    />

                    {/* Remove */}
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => removeStop(stop.id)}
                      disabled={stops.length <= 2}
                      className="text-destructive flex-shrink-0"
                      data-testid={`button-remove-stop-${idx}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" className="w-full mt-1" onClick={addStop} data-testid="button-add-stop">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stop
                </Button>
              </CardContent>
            </Card>

            {/* Start / End options */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flag className="h-4 w-4 text-primary" />
                  Start & End Points
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Start from</Label>
                  <Select value={startMode} onValueChange={(v: any) => setStartMode(v)}>
                    <SelectTrigger data-testid="select-start-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">First stop ({stops[0]?.postcode || '—'})</SelectItem>
                      <SelectItem value="last">Last stop ({stops[stops.length - 1]?.postcode || '—'})</SelectItem>
                      <SelectItem value="custom">Custom postcode</SelectItem>
                    </SelectContent>
                  </Select>
                  {startMode === 'custom' && (
                    <PostcodeInput
                      value={customStart}
                      onChange={setCustomStart}
                      placeholder="Starting postcode or address"
                      testId="input-custom-start"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">End at</Label>
                  <Select value={endMode} onValueChange={(v: any) => setEndMode(v)}>
                    <SelectTrigger data-testid="select-end-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last">Last stop ({stops[stops.length - 1]?.postcode || '—'})</SelectItem>
                      <SelectItem value="first">First stop ({stops[0]?.postcode || '—'})</SelectItem>
                      <SelectItem value="custom">Custom postcode</SelectItem>
                    </SelectContent>
                  </Select>
                  {endMode === 'custom' && (
                    <PostcodeInput
                      value={customEnd}
                      onChange={setCustomEnd}
                      placeholder="Ending postcode or address"
                      testId="input-custom-end"
                    />
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={calculateRoute}
                  disabled={calculating || validStopsCount < 2}
                  data-testid="button-calculate-route"
                >
                  {calculating
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating…</>
                    : <><Navigation className="h-4 w-4 mr-2" />Calculate Route</>
                  }
                </Button>
              </CardContent>
            </Card>

            {/* Route result summary */}
            {routeResult && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Milestone className="h-4 w-4 text-primary" />
                    Route Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted rounded-md p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Total Distance</p>
                      <p className="text-lg font-bold">{formatDistance(routeResult.totalDistance)}</p>
                    </div>
                    <div className="bg-muted rounded-md p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Estimated Time</p>
                      <p className="text-lg font-bold">{formatDuration(routeResult.totalDuration)}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Leg Breakdown</p>
                    {routeResult.legs.map((leg, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                            {ALPHA[i] || (i + 1)}
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            {leg.from} → {leg.to}
                          </span>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="font-medium text-sm">{formatDistance(leg.distance)}</p>
                          <p className="text-xs text-muted-foreground">{formatDuration(leg.duration)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={copyRouteText} data-testid="button-copy-route">
                      {copied
                        ? <><CheckCheck className="h-4 w-4 mr-1 text-green-500" />Copied</>
                        : <><Copy className="h-4 w-4 mr-1" />Copy</>
                      }
                    </Button>
                    <Button
                      variant="outline" size="sm" className="flex-1"
                      onClick={() => window.open(buildMapsLink(), '_blank')}
                      data-testid="button-open-maps"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Google Maps
                    </Button>
                  </div>

                  <Button className="w-full" onClick={() => setSendDialogOpen(true)} data-testid="button-send-to-driver">
                    <Send className="h-4 w-4 mr-2" />
                    Send to Driver
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right panel — Map ──────────────────────────────────────── */}
          <div className="xl:col-span-3">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Route Map
                </CardTitle>
                <CardDescription>
                  {routeResult
                    ? `${displayedStops.length} stops · ${formatDistance(routeResult.totalDistance)} · ${formatDuration(routeResult.totalDuration)}`
                    : 'Add postcodes and click Calculate Route'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  ref={mapRef}
                  className="w-full rounded-b-md"
                  style={{ height: 560 }}
                  data-testid="div-route-map"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Send dialog ──────────────────────────────────────────────────── */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Route to Driver</DialogTitle>
            <DialogDescription>Choose how to share this route</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Driver (optional)</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger data-testid="select-driver">
                  <SelectValue placeholder="Choose a driver…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Enter manually —</SelectItem>
                  {activeDrivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fullName} {d.driverCode ? `(${d.driverCode})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Method toggle */}
            <div className="flex rounded-md border overflow-hidden">
              <button
                type="button"
                className={`flex-1 py-2 text-sm flex items-center justify-center gap-2 transition-colors ${sendMethod === 'email' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setSendMethod('email')}
                data-testid="tab-email"
              >
                <Mail className="h-4 w-4" />Email
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm flex items-center justify-center gap-2 transition-colors ${sendMethod === 'whatsapp' ? 'bg-green-600 text-white' : 'hover:bg-muted'}`}
                onClick={() => setSendMethod('whatsapp')}
                data-testid="tab-whatsapp"
              >
                <MessageCircle className="h-4 w-4" />WhatsApp
              </button>
            </div>

            {sendMethod === 'email' && (
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  value={selectedDriver?.email || customEmail}
                  onChange={e => { if (!selectedDriver) setCustomEmail(e.target.value); }}
                  placeholder="driver@example.com"
                  type="email"
                  data-testid="input-driver-email"
                />
                {selectedDriver?.email && (
                  <p className="text-xs text-muted-foreground">Using {selectedDriver.fullName}'s email</p>
                )}
              </div>
            )}

            {sendMethod === 'whatsapp' && (
              <div className="space-y-2">
                <Label>WhatsApp Number</Label>
                <Input
                  value={selectedDriver?.phone || customPhone}
                  onChange={e => { if (!selectedDriver) setCustomPhone(e.target.value); }}
                  placeholder="+44 7700 900000"
                  type="tel"
                  data-testid="input-driver-phone"
                />
                {selectedDriver?.phone && (
                  <p className="text-xs text-muted-foreground">Using {selectedDriver.fullName}'s number</p>
                )}
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  WhatsApp opens in a new tab with the route pre-filled as a message.
                </p>
              </div>
            )}

            {/* Preview */}
            <div className="bg-muted rounded-md p-3 text-xs font-mono whitespace-pre-wrap max-h-28 overflow-y-auto text-muted-foreground">
              {buildRouteText().split('\n').slice(0, 10).join('\n')}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            {sendMethod === 'email' ? (
              <Button onClick={sendRouteEmail} disabled={sending} data-testid="button-confirm-send-email">
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Send Email
              </Button>
            ) : (
              <Button
                className="bg-green-600 text-white"
                onClick={sendViaWhatsApp}
                data-testid="button-confirm-send-whatsapp"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Open WhatsApp
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
