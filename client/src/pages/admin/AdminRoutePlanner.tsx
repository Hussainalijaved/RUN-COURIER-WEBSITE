import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import {
  MapPin,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Navigation,
  Clock,
  Milestone,
  Mail,
  MessageCircle,
  Send,
  Loader2,
  GripVertical,
  RotateCcw,
  Copy,
  CheckCheck,
  Flag,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Driver } from '@shared/schema';

declare global {
  interface Window {
    google: typeof google;
    initRoutePlannerMap?: () => void;
  }
}

interface Stop {
  id: string;
  postcode: string;
  label?: string;
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

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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

export default function AdminRoutePlanner() {
  const { toast } = useToast();

  const [stops, setStops] = useState<Stop[]>([
    { id: genId(), postcode: '' },
    { id: genId(), postcode: '' },
  ]);
  const [newPostcode, setNewPostcode] = useState('');
  const [startMode, setStartMode] = useState<'first' | 'last' | 'custom'>('first');
  const [endMode, setEndMode] = useState<'last' | 'first' | 'custom'>('last');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [optimizeRoute, setOptimizeRoute] = useState(true);

  const [calculating, setCalculating] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [orderedStops, setOrderedStops] = useState<Stop[]>([]);

  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendMethod, setSendMethod] = useState<'email' | 'whatsapp'>('email');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const mapsLoadedRef = useRef(false);

  const { data: drivers } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  const activeDrivers = drivers?.filter(d => d.status === 'verified' || d.status === 'active') || [];

  // Load Google Maps
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || mapsLoadedRef.current) return;

    const init = () => {
      if (!mapRef.current) return;
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: 51.5074, lng: -0.1278 },
        zoom: 7,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      mapInstanceRef.current = map;
      directionsRendererRef.current = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: { strokeColor: '#2563eb', strokeWeight: 5 },
      });
      directionsRendererRef.current.setMap(map);
      mapsLoadedRef.current = true;
    };

    if (window.google?.maps) {
      init();
    } else {
      window.initRoutePlannerMap = init;
      if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=initRoutePlannerMap`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      } else {
        const interval = setInterval(() => {
          if (window.google?.maps) {
            clearInterval(interval);
            init();
          }
        }, 200);
      }
    }
  }, []);

  const drawRoute = useCallback(async (start: string, waypoints: string[], end: string) => {
    if (!window.google?.maps || !mapInstanceRef.current || !directionsRendererRef.current) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const directionsService = new google.maps.DirectionsService();

    const wp = waypoints.map(p => ({
      location: p + ', UK',
      stopover: true,
    }));

    const result = await new Promise<google.maps.DirectionsResult | null>(resolve => {
      directionsService.route(
        {
          origin: start + ', UK',
          destination: end + ', UK',
          waypoints: wp,
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false,
          region: 'GB',
        },
        (res, status) => {
          if (status === 'OK') resolve(res);
          else resolve(null);
        }
      );
    });

    if (result) {
      directionsRendererRef.current.setDirections(result);
    }
  }, []);

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
    const end = getEffectiveEnd();

    if (!start || !end) {
      toast({ title: 'Please set start and end points', variant: 'destructive' });
      return;
    }

    setCalculating(true);
    setRouteResult(null);

    try {
      // Build drops list excluding the origin for API call
      let drops = validStops.map(s => s.postcode.trim());

      // If the start is the first stop, remove it from drops to avoid duplicate
      if (startMode === 'first' && drops.length > 0) {
        drops = drops.slice(1);
      }
      // Always include end in drops unless it's the last stop already
      if (endMode !== 'custom' && drops.length > 0) {
        // end is already included in the stops array
      } else if (endMode === 'custom' && end) {
        drops.push(end);
      }

      const response = await fetch(
        `/api/maps/optimized-route?origin=${encodeURIComponent(start)}&drops=${drops.map(encodeURIComponent).join('|')}&optimize=${optimizeRoute}`
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Route calculation failed');
      }

      const data: RouteResult = await response.json();
      setRouteResult(data);

      // Build ordered stop list for display
      const ordered = [{ id: 'start', postcode: start, label: 'Start' }, ...drops.map((p, i) => ({ id: `d${i}`, postcode: p, label: '' }))];
      setOrderedStops(ordered);

      // Draw on map
      const mapWaypoints = drops.slice(0, drops.length - 1);
      const mapEnd = drops[drops.length - 1] || end;
      await drawRoute(start, mapWaypoints, mapEnd);

      toast({ title: 'Route calculated', description: `${formatDistance(data.totalDistance)} · ${formatDuration(data.totalDuration)}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCalculating(false);
    }
  };

  const addStop = () => {
    if (newPostcode.trim()) {
      setStops(prev => [...prev, { id: genId(), postcode: newPostcode.trim().toUpperCase() }]);
      setNewPostcode('');
    } else {
      setStops(prev => [...prev, { id: genId(), postcode: '' }]);
    }
  };

  const removeStop = (id: string) => {
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
    setStops(prev => prev.map(s => s.id === id ? { ...s, postcode: value.toUpperCase() } : s));
  };

  const resetAll = () => {
    setStops([{ id: genId(), postcode: '' }, { id: genId(), postcode: '' }]);
    setRouteResult(null);
    setOrderedStops([]);
    if (directionsRendererRef.current) directionsRendererRef.current.setDirections({ routes: [] } as any);
  };

  // Build shareable Google Maps link
  const buildMapsLink = () => {
    if (!routeResult || orderedStops.length === 0) return '';
    const all = orderedStops.map(s => encodeURIComponent(s.postcode + ', UK'));
    if (all.length < 2) return '';
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
    orderedStops.forEach((s, i) => {
      text += `  ${ALPHA[i] || (i + 1)}. ${s.postcode}\n`;
    });
    text += `\nLeg Details:\n`;
    routeResult.legs.forEach((leg, i) => {
      text += `  ${ALPHA[i] || (i + 1)} → ${ALPHA[i + 1] || (i + 2)}: ${leg.from} → ${leg.to} (${formatDistance(leg.distance)}, ${formatDuration(leg.duration)})\n`;
    });
    const link = buildMapsLink();
    if (link) text += `\nGoogle Maps: ${link}`;
    return text;
  };

  const selectedDriver = activeDrivers.find(d => d.id === selectedDriverId);

  const getDriverEmail = () => customEmail || selectedDriver?.email || '';
  const getDriverPhone = () => customPhone || selectedDriver?.phone || '';

  const sendRouteEmail = async () => {
    const email = getDriverEmail();
    if (!email) {
      toast({ title: 'Please enter an email address', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      await apiRequest('POST', '/api/route-planner/send-email', {
        to: email,
        driverName: selectedDriver?.fullName || 'Driver',
        routeText: buildRouteText(),
        mapsLink: buildMapsLink(),
        legs: routeResult?.legs,
        stops: orderedStops,
        totalDistance: routeResult?.totalDistance,
        totalDuration: routeResult?.totalDuration,
      });
      toast({ title: 'Route sent via email' });
      setSendDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to send email', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const sendViaWhatsApp = () => {
    const phone = getDriverPhone().replace(/\D/g, '');
    const text = buildRouteText();
    const encoded = encodeURIComponent(text);
    const url = phone
      ? `https://wa.me/${phone.startsWith('44') ? phone : '44' + phone.replace(/^0/, '')}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
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
              <Button
                size="sm"
                onClick={() => setSendDialogOpen(true)}
                data-testid="button-send-route"
              >
                <Send className="h-4 w-4 mr-2" />
                Send to Driver
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Left Panel — Stop Editor */}
          <div className="xl:col-span-2 space-y-4">
            {/* Stops List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Stops
                </CardTitle>
                <CardDescription>Add postcodes or full addresses in order</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {stops.map((stop, idx) => (
                  <div key={stop.id} className="flex items-center gap-2" data-testid={`row-stop-${idx}`}>
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => moveStop(stop.id, 'up')}
                        disabled={idx === 0}
                        data-testid={`button-move-up-${idx}`}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => moveStop(stop.id, 'down')}
                        disabled={idx === stops.length - 1}
                        data-testid={`button-move-down-${idx}`}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div
                      className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: idx === 0 ? '#16a34a' : idx === stops.length - 1 ? '#dc2626' : '#2563eb' }}
                    >
                      {ALPHA[idx] || (idx + 1)}
                    </div>
                    <Input
                      value={stop.postcode}
                      onChange={e => updateStopPostcode(stop.id, e.target.value)}
                      placeholder={idx === 0 ? 'e.g. SW1A 1AA' : `Stop ${idx + 1}`}
                      className="flex-1 uppercase"
                      data-testid={`input-stop-${idx}`}
                      onKeyDown={e => {
                        if (e.key === 'Enter') addStop();
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStop(stop.id)}
                      disabled={stops.length <= 2}
                      className="text-destructive"
                      data-testid={`button-remove-stop-${idx}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {/* Add stop row */}
                <div className="flex gap-2 pt-1">
                  <Input
                    value={newPostcode}
                    onChange={e => setNewPostcode(e.target.value.toUpperCase())}
                    placeholder="Add postcode…"
                    className="flex-1 uppercase"
                    data-testid="input-new-stop"
                    onKeyDown={e => { if (e.key === 'Enter') addStop(); }}
                  />
                  <Button variant="outline" size="icon" onClick={addStop} data-testid="button-add-stop">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Start / End Options */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flag className="h-4 w-4 text-primary" />
                  Start & End Points
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Start from</Label>
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
                    <Input
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value.toUpperCase())}
                      placeholder="Starting postcode"
                      className="uppercase"
                      data-testid="input-custom-start"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">End at</Label>
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
                    <Input
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value.toUpperCase())}
                      placeholder="Ending postcode"
                      className="uppercase"
                      data-testid="input-custom-end"
                    />
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="optimize-toggle"
                    checked={optimizeRoute}
                    onChange={e => setOptimizeRoute(e.target.checked)}
                    className="rounded"
                    data-testid="checkbox-optimize"
                  />
                  <Label htmlFor="optimize-toggle" className="text-sm cursor-pointer">Auto-optimise stop order</Label>
                </div>

                <Button
                  className="w-full"
                  onClick={calculateRoute}
                  disabled={calculating || validStopsCount < 2}
                  data-testid="button-calculate-route"
                >
                  {calculating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating…</>
                  ) : (
                    <><Navigation className="h-4 w-4 mr-2" />Calculate Route</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Route Summary */}
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
                      <p className="text-xs text-muted-foreground mb-1">Total Time</p>
                      <p className="text-lg font-bold">{formatDuration(routeResult.totalDuration)}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leg Breakdown</p>
                    {routeResult.legs.map((leg, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 text-sm py-1.5 border-b last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                            {ALPHA[i] || (i + 1)}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {leg.from} → {leg.to}
                          </span>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="font-medium">{formatDistance(leg.distance)}</p>
                          <p className="text-xs text-muted-foreground">{formatDuration(leg.duration)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={copyRouteText} data-testid="button-copy-route">
                      {copied ? <CheckCheck className="h-4 w-4 mr-1 text-green-500" /> : <Copy className="h-4 w-4 mr-1" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => window.open(buildMapsLink(), '_blank')} data-testid="button-open-maps">
                      <MapPin className="h-4 w-4 mr-1" />
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

          {/* Right Panel — Map */}
          <div className="xl:col-span-3">
            <Card className="h-full min-h-[600px]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Route Map
                </CardTitle>
                <CardDescription>
                  {routeResult
                    ? `Showing ${orderedStops.length} stops · ${formatDistance(routeResult.totalDistance)} · ${formatDuration(routeResult.totalDuration)}`
                    : 'Add stops and click Calculate Route to display'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 pb-0">
                <div
                  ref={mapRef}
                  className="w-full rounded-b-md"
                  style={{ height: '560px' }}
                  data-testid="div-route-map"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Send Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Route to Driver</DialogTitle>
            <DialogDescription>
              Choose how to share this route plan
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Driver selector */}
            <div className="space-y-2">
              <Label>Select Driver (optional)</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId} data-testid="select-driver">
                <SelectTrigger>
                  <SelectValue placeholder="Choose a driver…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Manual entry —</SelectItem>
                  {activeDrivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fullName} {d.driverCode ? `(${d.driverCode})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tabs: Email / WhatsApp */}
            <div className="flex rounded-md border overflow-hidden">
              <button
                className={`flex-1 py-2 text-sm flex items-center justify-center gap-2 transition-colors ${sendMethod === 'email' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setSendMethod('email')}
                data-testid="tab-email"
              >
                <Mail className="h-4 w-4" />
                Email
              </button>
              <button
                className={`flex-1 py-2 text-sm flex items-center justify-center gap-2 transition-colors ${sendMethod === 'whatsapp' ? 'bg-green-600 text-white' : 'hover:bg-muted'}`}
                onClick={() => setSendMethod('whatsapp')}
                data-testid="tab-whatsapp"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </button>
            </div>

            {sendMethod === 'email' && (
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  value={selectedDriver?.email || customEmail}
                  onChange={e => setCustomEmail(e.target.value)}
                  placeholder="driver@example.com"
                  type="email"
                  readOnly={!!selectedDriver?.email}
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
                  onChange={e => setCustomPhone(e.target.value)}
                  placeholder="+44 7700 900000"
                  type="tel"
                  readOnly={!!selectedDriver?.phone}
                  data-testid="input-driver-phone"
                />
                {selectedDriver?.phone && (
                  <p className="text-xs text-muted-foreground">Using {selectedDriver.fullName}'s number</p>
                )}
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  WhatsApp will open in a new tab with the route details pre-filled as a message.
                </p>
              </div>
            )}

            {/* Route preview */}
            <div className="bg-muted rounded-md p-3 text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {buildRouteText().split('\n').slice(0, 8).join('\n')}
              {buildRouteText().split('\n').length > 8 && '\n...'}
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
                className="bg-green-600 hover:bg-green-700 text-white"
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
