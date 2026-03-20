import { useEffect, useRef, useState, useCallback } from 'react';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { Loader2, MapPin, Navigation, Radio, CheckCircle2, XCircle } from 'lucide-react';

interface LiveStop {
  stopOrder: number;
  address: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
  status: string; // 'pending' | 'delivered' | 'failed'
}

interface LiveData {
  status: string;
  statusLabel: string;
  isActive: boolean;
  isMultiDrop: boolean;
  pickup: { lat: number; lng: number } | null;
  delivery: { lat: number; lng: number } | null;
  stops: LiveStop[];
  driver: { lat: number; lng: number; updatedAt: number; isLive: boolean } | null;
}

interface TrackingLiveMapProps {
  trackingNumber: string;
  jobStatus: string;
}

const POLL_INTERVAL_MS = 5000;
const FINAL_STATUSES = new Set(['delivered', 'cancelled', 'failed']);

function statusChipStyle(status: string) {
  if (status === 'delivered') return { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2 };
  if (status === 'cancelled' || status === 'failed') return { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: XCircle };
  if (['on_the_way_pickup', 'on_the_way_delivery', 'on_the_way'].includes(status)) return { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: Radio };
  return { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', icon: Radio };
}

function makeDriverSvg(isLive: boolean): string {
  const color = isLive ? '#2563EB' : '#6366F1';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="18" fill="${color}" stroke="white" stroke-width="2.5"/>
    <text x="20" y="26" text-anchor="middle" font-size="18" font-family="sans-serif">🚚</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
}

function makePinSvg(label: string, fill: string, stroke: string = 'white', textColor: string = 'white'): string {
  const fontSize = label.length > 2 ? '10' : '12';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
    <path d="M17 2 C8.7 2 2 8.7 2 17 C2 28 17 40 17 40 C17 40 32 28 32 17 C32 8.7 25.3 2 17 2Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text x="17" y="21" text-anchor="middle" font-size="${fontSize}" font-family="monospace,sans-serif" fill="${textColor}" font-weight="bold">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
}

// Stop colours: delivered = grey, pending = orange, failed = red
function stopFill(status: string, idx: number): string {
  if (status === 'delivered') return '#6B7280';
  if (status === 'failed') return '#DC2626';
  // Cycle through distinct colours for pending stops
  const COLORS = ['#F97316', '#8B5CF6', '#0891B2', '#BE185D', '#16A34A', '#B45309'];
  return COLORS[idx % COLORS.length];
}

export function TrackingLiveMap({ trackingNumber, jobStatus }: TrackingLiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const pickupMarkerRef = useRef<google.maps.Marker | null>(null);
  const deliveryMarkerRef = useRef<google.maps.Marker | null>(null);
  const stopMarkersRef = useRef<(google.maps.Marker | null)[]>([]);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const { isReady } = useGoogleMaps();
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const isFinal = FINAL_STATUSES.has(jobStatus);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/track/${trackingNumber}/live`);
      if (!res.ok) return;
      const data: LiveData = await res.json();
      console.log('[TrackingLiveMap] live data:', JSON.stringify({ isMultiDrop: data.isMultiDrop, stopsCount: data.stops?.length, stops: data.stops, pickup: data.pickup, delivery: data.delivery }));
      setLiveData(data);
    } catch { /* silent */ }
  }, [trackingNumber]);

  // Init map
  useEffect(() => {
    if (!isReady || !mapRef.current || mapInstanceRef.current) return;
    try {
      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        zoom: 12,
        center: { lat: 51.5074, lng: -0.1278 },
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      });
      infoWindowRef.current = new google.maps.InfoWindow();
      setMapReady(true);
    } catch {
      setMapError(true);
    }
  }, [isReady]);

  // Smooth driver animation
  const animateMarker = useCallback((
    marker: google.maps.Marker,
    from: google.maps.LatLngLiteral,
    to: google.maps.LatLngLiteral,
  ) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const start = Date.now();
    const duration = 1200;
    function step() {
      const t = Math.min((Date.now() - start) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      marker.setPosition({
        lat: from.lat + (to.lat - from.lat) * ease,
        lng: from.lng + (to.lng - from.lng) * ease,
      });
      if (t < 1) animFrameRef.current = requestAnimationFrame(step);
    }
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Build/update all markers whenever liveData changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !liveData) return;

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    const addPoint = (pos: { lat: number; lng: number }) => {
      bounds.extend(pos);
      hasPoints = true;
    };

    // --- Pickup marker ---
    if (liveData.pickup) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = new google.maps.Marker({
          map,
          title: 'Pickup',
          icon: { url: makePinSvg('P', '#16A34A'), scaledSize: new google.maps.Size(34, 42), anchor: new google.maps.Point(17, 40) },
          zIndex: 10,
        });
      }
      pickupMarkerRef.current.setPosition(liveData.pickup);
      addPoint(liveData.pickup);
    }

    // --- Single-drop delivery marker ---
    if (!liveData.isMultiDrop && liveData.delivery) {
      if (!deliveryMarkerRef.current) {
        deliveryMarkerRef.current = new google.maps.Marker({
          map,
          title: 'Delivery',
          icon: { url: makePinSvg('D', '#DC2626'), scaledSize: new google.maps.Size(34, 42), anchor: new google.maps.Point(17, 40) },
          zIndex: 10,
        });
      }
      deliveryMarkerRef.current.setPosition(liveData.delivery);
      addPoint(liveData.delivery);
    } else if (deliveryMarkerRef.current) {
      deliveryMarkerRef.current.setMap(null);
      deliveryMarkerRef.current = null;
    }

    // --- Multi-drop stop markers ---
    if (liveData.isMultiDrop && liveData.stops.length > 0) {
      // Remove excess markers if stop count changed
      while (stopMarkersRef.current.length > liveData.stops.length) {
        const m = stopMarkersRef.current.pop();
        m?.setMap(null);
      }

      liveData.stops.forEach((stop, idx) => {
        if (stop.lat === null || stop.lng === null) return;
        const pos = { lat: stop.lat, lng: stop.lng };
        const label = String(stop.stopOrder);
        const fill = stopFill(stop.status, idx);
        const icon = { url: makePinSvg(label, fill), scaledSize: new google.maps.Size(34, 42), anchor: new google.maps.Point(17, 40) };
        const title = `Stop ${stop.stopOrder}: ${stop.address}`;

        if (!stopMarkersRef.current[idx]) {
          const marker = new google.maps.Marker({ map, title, icon, zIndex: 9 });
          // Click opens info window with address + status
          marker.addListener('click', () => {
            infoWindowRef.current?.setContent(
              `<div style="font-family:sans-serif;font-size:13px;padding:2px 4px;max-width:220px">
                <strong>Stop ${stop.stopOrder}</strong><br/>
                <span style="color:#555">${stop.address}</span><br/>
                <span style="display:inline-block;margin-top:4px;padding:2px 6px;border-radius:4px;font-size:11px;background:${fill};color:white">${stop.status === 'delivered' ? 'Delivered' : stop.status === 'failed' ? 'Failed' : 'Pending'}</span>
              </div>`
            );
            infoWindowRef.current?.open(map, marker);
          });
          stopMarkersRef.current[idx] = marker;
        } else {
          stopMarkersRef.current[idx]!.setPosition(pos);
          stopMarkersRef.current[idx]!.setIcon(icon);
          stopMarkersRef.current[idx]!.setTitle(title);
        }
        addPoint(pos);
      });
    } else {
      // Clear any leftover stop markers
      stopMarkersRef.current.forEach(m => m?.setMap(null));
      stopMarkersRef.current = [];
    }

    // --- Driver marker ---
    if (liveData.isActive && liveData.driver) {
      const driverPos = { lat: liveData.driver.lat, lng: liveData.driver.lng };
      const icon = { url: makeDriverSvg(liveData.driver.isLive), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) };
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new google.maps.Marker({ map, position: driverPos, title: 'Driver', icon, zIndex: 20 });
      } else {
        const prev = driverMarkerRef.current.getPosition();
        if (prev) animateMarker(driverMarkerRef.current, { lat: prev.lat(), lng: prev.lng() }, driverPos);
        else driverMarkerRef.current.setPosition(driverPos);
        driverMarkerRef.current.setIcon(icon);
      }
      addPoint(driverPos);
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }

    if (hasPoints) map.fitBounds(bounds, { top: 48, right: 30, bottom: 24, left: 30 });
  }, [liveData, mapReady, animateMarker]);

  // Polling
  useEffect(() => {
    if (isFinal) { if (pollRef.current) clearInterval(pollRef.current); return; }
    fetchLive();
    pollRef.current = setInterval(fetchLive, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchLive, isFinal]);

  useEffect(() => { if (isFinal) fetchLive(); }, [isFinal, fetchLive]);

  // Cleanup
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  if (mapError) return null;

  const chip = liveData ? statusChipStyle(liveData.status) : null;
  const ChipIcon = chip?.icon ?? Radio;
  const isMultiDrop = liveData?.isMultiDrop ?? false;
  const stops = liveData?.stops ?? [];
  const deliveredCount = stops.filter(s => s.status === 'delivered').length;

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-medium text-sm">Live Tracking</span>
          {isMultiDrop && stops.length > 0 && (
            <span className="text-xs text-muted-foreground">
              · {deliveredCount}/{stops.length} stops delivered
            </span>
          )}
        </div>
        {liveData && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${chip?.bg ?? ''} ${chip?.text ?? ''}`}>
            <ChipIcon className={`h-3 w-3 ${!isFinal ? 'animate-pulse' : ''}`} />
            {liveData.statusLabel}
          </span>
        )}
      </div>

      {/* Map */}
      <div className="relative" style={{ height: 300 }}>
        {(!isReady || !mapReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* Legend */}
        {mapReady && liveData && (
          <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground shadow-sm pointer-events-none max-w-[90%]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-600" />Pickup
            </span>
            {!isMultiDrop && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600" />Delivery
              </span>
            )}
            {isMultiDrop && stops.length > 0 && (
              <>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500" />Pending stop
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-400" />Delivered stop
                </span>
              </>
            )}
            {liveData.isActive && liveData.driver && (
              <span className="flex items-center gap-1">
                <Navigation className="h-3 w-3 text-blue-600" />Driver
              </span>
            )}
          </div>
        )}
      </div>

      {/* Multi-drop stop list */}
      {isMultiDrop && stops.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Delivery Stops</p>
          <div className="space-y-1.5">
            {stops.map((stop, idx) => (
              <div key={stop.stopOrder} className="flex items-center gap-2.5 text-sm">
                <span
                  className="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: stopFill(stop.status, idx) }}
                >
                  {stop.stopOrder}
                </span>
                <span className={`flex-1 truncate ${stop.status === 'delivered' ? 'line-through text-muted-foreground' : ''}`}>
                  {stop.address}
                </span>
                <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  stop.status === 'delivered'
                    ? 'bg-green-100 text-green-700'
                    : stop.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {stop.status === 'delivered' ? 'Done' : stop.status === 'failed' ? 'Failed' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
