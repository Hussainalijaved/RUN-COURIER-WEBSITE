import { useEffect, useRef, useState, useCallback } from 'react';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { Loader2, MapPin, Navigation, Radio, CheckCircle2, XCircle } from 'lucide-react';

interface LiveData {
  status: string;
  statusLabel: string;
  isActive: boolean;
  pickup: { lat: number; lng: number } | null;
  delivery: { lat: number; lng: number } | null;
  driver: { lat: number; lng: number; updatedAt: number; isLive: boolean } | null;
}

interface TrackingLiveMapProps {
  trackingNumber: string;
  jobStatus: string;
}

const POLL_INTERVAL_MS = 5000;

const FINAL_STATUSES = new Set(['delivered', 'cancelled', 'failed']);

function statusChipStyle(status: string): { bg: string; text: string; icon: typeof Radio } {
  if (status === 'delivered') return { bg: 'bg-green-50 border-green-200 text-green-700', text: 'text-green-700', icon: CheckCircle2 };
  if (status === 'cancelled' || status === 'failed') return { bg: 'bg-red-50 border-red-200 text-red-700', text: 'text-red-700', icon: XCircle };
  if (status === 'on_the_way_pickup' || status === 'on_the_way_delivery' || status === 'on_the_way') return { bg: 'bg-blue-50 border-blue-200 text-blue-700', text: 'text-blue-700', icon: Radio };
  return { bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', text: 'text-indigo-700', icon: Radio };
}

function makeDriverSvg(isLive: boolean): string {
  const color = isLive ? '#2563EB' : '#6366F1';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <circle cx="19" cy="19" r="17" fill="${color}" stroke="white" stroke-width="2.5" opacity="0.92"/>
    <text x="19" y="24" text-anchor="middle" font-size="17" font-family="sans-serif">🚚</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
}

function makePickupSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
    <path d="M17 2 C8.7 2 2 8.7 2 17 C2 28 17 40 17 40 C17 40 32 28 32 17 C32 8.7 25.3 2 17 2Z" fill="#16A34A" stroke="white" stroke-width="2"/>
    <text x="17" y="21" text-anchor="middle" font-size="13" font-family="sans-serif" fill="white" font-weight="bold">A</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
}

function makeDeliverySvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
    <path d="M17 2 C8.7 2 2 8.7 2 17 C2 28 17 40 17 40 C17 40 32 28 32 17 C32 8.7 25.3 2 17 2Z" fill="#DC2626" stroke="white" stroke-width="2"/>
    <text x="17" y="21" text-anchor="middle" font-size="13" font-family="sans-serif" fill="white" font-weight="bold">B</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
}

export function TrackingLiveMap({ trackingNumber, jobStatus }: TrackingLiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const pickupMarkerRef = useRef<google.maps.Marker | null>(null);
  const deliveryMarkerRef = useRef<google.maps.Marker | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const { isReady } = useGoogleMaps();
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const isFinal = FINAL_STATUSES.has(jobStatus);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/track/${trackingNumber}/live`);
      if (!res.ok) return;
      const data: LiveData = await res.json();
      setLiveData(data);
    } catch {
      // silent
    }
  }, [trackingNumber]);

  // Initialise map once Google is ready
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
      setMapReady(true);
    } catch {
      setMapError(true);
    }
  }, [isReady]);

  // Animate driver marker smoothly to new position
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
      const lat = from.lat + (to.lat - from.lat) * ease;
      const lng = from.lng + (to.lng - from.lng) * ease;
      marker.setPosition({ lat, lng });
      if (t < 1) animFrameRef.current = requestAnimationFrame(step);
    }
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Update markers whenever liveData changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !liveData) return;

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    // Pickup marker
    if (liveData.pickup) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = new google.maps.Marker({
          map,
          title: 'Pickup',
          icon: { url: makePickupSvg(), scaledSize: new google.maps.Size(34, 42), anchor: new google.maps.Point(17, 40) },
          zIndex: 10,
        });
      }
      pickupMarkerRef.current.setPosition(liveData.pickup);
      bounds.extend(liveData.pickup);
      hasPoints = true;
    }

    // Delivery marker
    if (liveData.delivery) {
      if (!deliveryMarkerRef.current) {
        deliveryMarkerRef.current = new google.maps.Marker({
          map,
          title: 'Delivery',
          icon: { url: makeDeliverySvg(), scaledSize: new google.maps.Size(34, 42), anchor: new google.maps.Point(17, 40) },
          zIndex: 10,
        });
      }
      deliveryMarkerRef.current.setPosition(liveData.delivery);
      bounds.extend(liveData.delivery);
      hasPoints = true;
    }

    // Driver marker — only show for active jobs
    if (liveData.isActive && liveData.driver) {
      const driverPos = { lat: liveData.driver.lat, lng: liveData.driver.lng };
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new google.maps.Marker({
          map,
          title: 'Driver',
          position: driverPos,
          icon: {
            url: makeDriverSvg(liveData.driver.isLive),
            scaledSize: new google.maps.Size(38, 38),
            anchor: new google.maps.Point(19, 19),
          },
          zIndex: 20,
        });
      } else {
        const prev = driverMarkerRef.current.getPosition();
        if (prev) {
          animateMarker(driverMarkerRef.current, { lat: prev.lat(), lng: prev.lng() }, driverPos);
        } else {
          driverMarkerRef.current.setPosition(driverPos);
        }
        driverMarkerRef.current.setIcon({
          url: makeDriverSvg(liveData.driver.isLive),
          scaledSize: new google.maps.Size(38, 38),
          anchor: new google.maps.Point(19, 19),
        });
      }
      bounds.extend(driverPos);
      hasPoints = true;
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }

    if (hasPoints) {
      map.fitBounds(bounds, { top: 40, right: 30, bottom: 20, left: 30 });
    }
  }, [liveData, mapReady, animateMarker]);

  // Start/stop polling
  useEffect(() => {
    if (isFinal) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    fetchLive();
    pollRef.current = setInterval(fetchLive, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchLive, isFinal]);

  // Do one final fetch when job completes (to freeze last state)
  useEffect(() => {
    if (isFinal) fetchLive();
  }, [isFinal, fetchLive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  if (mapError) return null;

  const chip = liveData ? statusChipStyle(liveData.status) : null;
  const ChipIcon = chip?.icon ?? Radio;

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      {/* Status label */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-medium text-sm">Live Tracking</span>
        </div>
        {liveData && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${chip?.bg ?? ''}`}>
            <ChipIcon className={`h-3 w-3 ${!isFinal ? 'animate-pulse' : ''}`} />
            {liveData.statusLabel}
          </span>
        )}
      </div>

      {/* Map area */}
      <div className="relative" style={{ height: 280 }}>
        {(!isReady || !mapReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* Legend */}
        {mapReady && liveData && (
          <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1.5 flex items-center gap-3 text-xs text-muted-foreground shadow-sm pointer-events-none">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-600" />Pickup</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600" />Delivery</span>
            {liveData.isActive && liveData.driver && (
              <span className="flex items-center gap-1"><Navigation className="h-3 w-3 text-blue-600" />Driver</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
