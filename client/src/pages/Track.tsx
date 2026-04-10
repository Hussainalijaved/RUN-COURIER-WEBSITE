import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearch, useParams } from 'wouter';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Package,
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  User,
  Phone,
  Loader2,
  Radio,
  ImageIcon,
  UserCheck,
} from 'lucide-react';
import { SmoothBackground } from '@/components/ui/smooth-image';
import trackingHeroImage from '@assets/generated_images/courier_tracking_van_gps_concept_opt.jpg';
import type { JobStatus } from '@shared/schema';
import { TrackingLiveMap } from '@/components/TrackingLiveMap';

const statusSteps: { status: JobStatus; label: string; icon: any }[] = [
  { status: 'pending', label: 'Order Placed', icon: Package },
  { status: 'assigned', label: 'Driver Assigned', icon: User },
  { status: 'on_the_way_pickup', label: 'En Route to Pickup', icon: Truck },
  { status: 'arrived_pickup', label: 'Arrived at Pickup', icon: MapPin },
  { status: 'collected', label: 'Parcel Collected', icon: Package },
  { status: 'on_the_way_delivery', label: 'Out for Delivery', icon: Truck },
  { status: 'delivered', label: 'Delivered', icon: CheckCircle },
];

// Maps every possible job status to the correct position in the customer timeline.
// Statuses must only ever move forward — this function ensures the UI reflects
// the furthest milestone reached, never resetting to an earlier step.
const STATUS_TO_STEP_INDEX: Partial<Record<JobStatus | string, number>> = {
  pending: 0,
  assigned: 1,
  offered: 1,     // offered = assigned from customer perspective
  accepted: 1,    // driver accepted but not yet en-route — still "Driver Assigned"
  on_the_way_pickup: 2,
  arrived_pickup: 3,
  collected: 4,
  picked_up: 4,   // legacy mobile alias for collected
  on_the_way_delivery: 5,
  on_the_way: 5,  // legacy mobile alias for on_the_way_delivery
  delivered: 6,
};

const getStatusIndex = (status: JobStatus): number => {
  const idx = STATUS_TO_STEP_INDEX[status as string];
  // If status is unknown keep at 0 (Order Placed) — never go negative
  return idx !== undefined ? idx : 0;
};

const getStatusColor = (status: JobStatus): string => {
  switch (status) {
    case 'delivered':
      return 'bg-green-500';
    case 'cancelled':
    case 'failed':
      return 'bg-red-500';
    case 'on_the_way_delivery':
    case 'on_the_way':
    case 'on_the_way_pickup':
      return 'bg-blue-500';
    case 'assigned':
    case 'offered':
    case 'accepted':
      return 'bg-indigo-500';
    case 'collected':
    case 'picked_up':
    case 'arrived_pickup':
      return 'bg-purple-500';
    default:
      return 'bg-yellow-500';
  }
};

// Human-readable label for every possible status — used in the badge.
const STATUS_LABEL: Partial<Record<string, string>> = {
  pending: 'Order Placed',
  assigned: 'Driver Assigned',
  offered: 'Driver Assigned',
  accepted: 'Driver Assigned',
  on_the_way_pickup: 'En Route to Pickup',
  arrived_pickup: 'Arrived at Pickup',
  collected: 'Parcel Collected',
  picked_up: 'Parcel Collected',
  on_the_way_delivery: 'Out for Delivery',
  on_the_way: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const getStatusLabel = (status: string): string =>
  STATUS_LABEL[status] ?? status;

interface MockJob {
  id: string;
  trackingNumber: string;
  jobNumber?: string;
  status: JobStatus;
  pickupAddress: string;
  deliveryAddress: string;
  isMultiDrop: boolean;
  multiDropStops: {
    stopOrder: number;
    address: string;
    postcode: string;
    status: string;
    deliveredAt?: string | null;
    podPhotoUrl?: string | null;
    podRecipientName?: string | null;
  }[];
  driverName?: string;
  driverPhone?: string;
  driverVehicleType?: string;
  vehicleType: string;
  estimatedDelivery?: string;
  createdAt: string;
  podPhotoUrl?: string;
  podRecipientName?: string;
  recipientName?: string;
  deliveredAt?: string;
}

const REFRESH_INTERVAL = 10000; // Refresh every 10 seconds for live updates

export default function Track() {
  useEffect(() => {
    const title = 'Track Your Parcel | Run Courier Live Tracking';
    const desc = 'Track your Run Courier delivery in real time. Enter your booking reference to see live driver location, estimated arrival, and delivery status updates.';
    document.title = title;
    (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.setAttribute('content', desc);
    (document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)?.setAttribute('content', title);
    (document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null)?.setAttribute('content', desc);
    (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.setAttribute('href', 'https://runcourier.co.uk/track');
    (document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null)?.setAttribute('content', 'https://runcourier.co.uk/track');
  }, []);

  const searchParams = useSearch();
  const queryParams = new URLSearchParams(searchParams);
  const routeParams = useParams<{ trackingNumber?: string }>();
  const initialId = routeParams.trackingNumber || queryParams.get('ref') || queryParams.get('id') || '';
  
  const [trackingNumber, setTrackingNumber] = useState(initialId);
  const [isLoading, setIsLoading] = useState(false);
  const [job, setJob] = useState<MockJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousStatusRef = useRef<JobStatus | null>(null);

  const fetchTrackingData = useCallback(async (number: string, silent = false) => {
    if (!number.trim()) {
      setError('Please enter a tracking number');
      return;
    }

    if (!silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/jobs/track/${number.toUpperCase()}`);
      
      if (response.ok) {
        const data = await response.json();
        const newStatus = data.status as JobStatus;
        
        // Check if status changed (for live updates)
        if (previousStatusRef.current && previousStatusRef.current !== newStatus) {
          console.log('[Track] Status changed:', previousStatusRef.current, '->', newStatus);
        }
        previousStatusRef.current = newStatus;
        
        setJob({
          id: data.id,
          trackingNumber: data.trackingNumber,
          jobNumber: data.jobNumber || undefined,
          status: newStatus,
          pickupAddress: `${data.pickupAddress}, ${data.pickupPostcode}`,
          deliveryAddress: `${data.deliveryAddress}, ${data.deliveryPostcode}`,
          isMultiDrop: !!data.isMultiDrop,
          multiDropStops: data.multiDropStops || [],
          driverName: data.driverName || undefined,
          driverPhone: data.driverPhone || undefined,
          driverVehicleType: data.driverVehicleType
            ? data.driverVehicleType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
            : undefined,
          vehicleType: data.vehicleType?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Standard',
          estimatedDelivery: data.estimatedDeliveryTime ? new Date(data.estimatedDeliveryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : undefined,
          createdAt: data.createdAt,
          podPhotoUrl: data.podPhotoUrl || undefined,
          podRecipientName: data.podRecipientName || undefined,
          recipientName: data.recipientName || undefined,
          deliveredAt: data.deliveredAt || undefined,
        });
        setLastUpdate(new Date());
        setError(null);
        
        // Stop polling if delivered or cancelled
        if (newStatus === 'delivered' || newStatus === 'cancelled') {
          setIsLive(false);
          if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
            refreshIntervalRef.current = null;
          }
        }
      } else {
        setError('Tracking number not found. Please check and try again.');
        setJob(null);
        setIsLive(false);
      }
    } catch (err) {
      setError('Unable to fetch tracking information. Please try again.');
      if (!silent) {
        setJob(null);
      }
    }

    if (!silent) {
      setIsLoading(false);
    }
  }, []);

  const startLiveTracking = useCallback((number: string) => {
    // Clear existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
    
    setIsLive(true);
    
    // Set up polling interval
    refreshIntervalRef.current = setInterval(() => {
      fetchTrackingData(number, true);
    }, REFRESH_INTERVAL);
  }, [fetchTrackingData]);

  const handleTrack = () => {
    previousStatusRef.current = null;
    fetchTrackingData(trackingNumber).then(() => {
      startLiveTracking(trackingNumber);
    });
  };

  useEffect(() => {
    if (initialId) {
      previousStatusRef.current = null;
      fetchTrackingData(initialId).then(() => {
        startLiveTracking(initialId);
      });
    }
    
    // Cleanup on unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [initialId, fetchTrackingData, startLiveTracking]);

  const currentStepIndex = job ? getStatusIndex(job.status) : -1;

  return (
    <PublicLayout>
      <SmoothBackground 
        src={trackingHeroImage}
        priority
        className="min-h-[400px] flex items-center"
        overlayClassName="bg-gradient-to-r from-[#0077B6]/70 via-[#0077B6]/60 to-[#00B4D8]/50"
      >
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center text-white">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Track Your Parcel</h1>
            <p className="text-lg text-white/90 mb-8">
              Enter your tracking number to see real-time updates on your delivery
            </p>
            <div className="max-w-md mx-auto flex gap-2">
              <Input
                type="text"
                placeholder="e.g., RC123456789"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                className="flex-1 bg-white/95 border-white/20 text-gray-900 placeholder:text-gray-500"
                data-testid="input-tracking"
              />
              <Button onClick={handleTrack} disabled={isLoading} className="bg-white text-[#0077B6] hover:bg-white/90" data-testid="button-track">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            {error && (
              <p className="text-red-200 mt-4 text-sm bg-red-500/20 py-2 px-4 rounded-lg inline-block">{error}</p>
            )}
          </div>
        </div>
      </SmoothBackground>

      {job && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <Card className="mb-8">
                <CardHeader className="pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">Delivery Details</CardTitle>
                        {isLive && (
                          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 gap-1" data-testid="badge-live">
                            <Radio className="h-3 w-3 animate-pulse" />
                            Live
                          </Badge>
                        )}
                      </div>
                      {job.jobNumber && (
                        <div className="mt-1">
                          <span className="text-xs text-muted-foreground">Job No. </span>
                          <span className="text-lg font-mono font-bold text-primary" data-testid="text-job-number">
                            {job.jobNumber}
                          </span>
                        </div>
                      )}
                      <div className="mt-1">
                        <span className="text-xs text-muted-foreground">Tracking: </span>
                        <span className="text-sm font-mono text-muted-foreground">
                          {job.trackingNumber}
                        </span>
                      </div>
                      {lastUpdate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Last updated: {lastUpdate.toLocaleTimeString('en-GB')}
                        </p>
                      )}
                    </div>
                    <Badge className={`${getStatusColor(job.status)} text-white`}>
                      {getStatusLabel(job.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                    <div className="space-y-8">
                      {statusSteps.map((step, idx) => {
                        const isCompleted = idx <= currentStepIndex;
                        const isCurrent = idx === currentStepIndex;
                        return (
                          <div key={step.status} className="relative flex gap-4">
                            <div
                              className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                                isCompleted
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-background border-border'
                              } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                            >
                              <step.icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 pt-1">
                              <p
                                className={`font-medium ${
                                  isCompleted ? 'text-foreground' : 'text-muted-foreground'
                                }`}
                              >
                                {step.label}
                              </p>
                              {isCurrent && job.estimatedDelivery && step.status === 'on_the_way_delivery' && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  Estimated arrival: {job.estimatedDelivery}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Proof of Delivery — shown when delivered */}
              {job.status === 'delivered' && (job.podPhotoUrl || job.podRecipientName || job.recipientName) && (
                <Card className="mb-8 border-green-200 dark:border-green-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      Proof of Delivery
                      {job.deliveredAt && (
                        <span className="ml-auto text-xs font-normal text-muted-foreground">
                          {new Date(job.deliveredAt).toLocaleString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(job.podRecipientName || job.recipientName) && (
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                          <UserCheck className="h-4 w-4 text-green-700 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Received by</p>
                          <p className="font-semibold" data-testid="text-pod-recipient">{job.podRecipientName || job.recipientName}</p>
                        </div>
                      </div>
                    )}
                    {job.podPhotoUrl && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          Delivery photo
                        </p>
                        <a href={job.podPhotoUrl} target="_blank" rel="noopener noreferrer" className="block" data-testid="link-pod-photo">
                          <img
                            src={job.podPhotoUrl}
                            alt="Proof of delivery photo"
                            className="rounded-md max-h-64 w-auto object-cover border border-border cursor-zoom-in"
                            data-testid="img-pod-photo"
                          />
                        </a>
                        <p className="text-xs text-muted-foreground mt-1">Click to view full size</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Live tracking map — added between status steps and details cards */}
              <TrackingLiveMap
                trackingNumber={job.trackingNumber}
                jobStatus={job.status}
                pickupAddress={job.isMultiDrop ? job.pickupAddress : undefined}
              />

              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      Delivery Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {job.isMultiDrop && job.multiDropStops.length > 0 ? (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Multi-Drop Route ({job.multiDropStops.length + 1} stops)
                        </p>
                        <div className="space-y-2">
                          {/* Pickup — first point, marked Done once parcel is collected */}
                          {(() => {
                            const pickupDone = ['collected', 'picked_up', 'on_the_way_delivery', 'on_the_way', 'delivered'].includes(job.status);
                            return (
                              <div className="flex items-start gap-2 text-sm">
                                <span className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${pickupDone ? 'bg-green-600' : 'bg-blue-600'}`}>
                                  P
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[10px] font-semibold uppercase tracking-wide block leading-tight ${pickupDone ? 'text-green-600' : 'text-blue-600'}`}>Pickup</span>
                                    {pickupDone && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">Done</span>
                                    )}
                                  </div>
                                  <span className={pickupDone ? 'line-through text-muted-foreground' : 'text-foreground'}>{job.pickupAddress}</span>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Delivery stops — always in planned route order (stop_order) */}
                          {[...job.multiDropStops]
                            .sort((a, b) => a.stopOrder - b.stopOrder)
                            .map((stop) => {
                              const stopDone = stop.status === 'delivered';
                              return (
                                <div key={stop.stopOrder} className="flex flex-col gap-1">
                                  <div className="flex items-start gap-2 text-sm">
                                    <span className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${stopDone ? 'bg-green-600' : 'bg-primary/40'}`}>
                                      {stop.stopOrder}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] font-semibold uppercase tracking-wide leading-tight ${stopDone ? 'text-green-600' : 'text-muted-foreground'}`}>
                                          Drop {stop.stopOrder}
                                        </span>
                                        {stopDone && (
                                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 flex items-center gap-1">
                                            <CheckCircle className="h-2.5 w-2.5" /> Delivered
                                            {stop.deliveredAt && (
                                              <span className="ml-1 text-green-600">
                                                {new Date(stop.deliveredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                              </span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                      <span className={stopDone ? 'line-through text-muted-foreground' : 'text-foreground'}>
                                        {stop.address && stop.address.trim() ? stop.address : stop.postcode || '—'}
                                      </span>
                                      {stopDone && stop.podRecipientName && (
                                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                          <UserCheck className="h-3 w-3" /> {stop.podRecipientName}
                                        </p>
                                      )}
                                      {stopDone && stop.podPhotoUrl && (
                                        <a href={stop.podPhotoUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block">
                                          <img
                                            src={stop.podPhotoUrl}
                                            alt={`POD for drop ${stop.stopOrder}`}
                                            className="rounded border border-border h-16 w-auto object-cover cursor-zoom-in"
                                          />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          const pickupDone = ['collected', 'picked_up', 'on_the_way_delivery', 'on_the_way', 'delivered'].includes(job.status);
                          const deliveryDone = job.status === 'delivered';
                          return (
                            <>
                              {/* Pickup row */}
                              <div className="flex items-start gap-2 text-sm">
                                <span className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${pickupDone ? 'bg-green-600' : 'bg-blue-600'}`}>
                                  P
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[10px] font-semibold uppercase tracking-wide leading-tight ${pickupDone ? 'text-green-600' : 'text-blue-600'}`}>Pickup</span>
                                    {pickupDone && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">Done</span>}
                                  </div>
                                  <span className={pickupDone ? 'line-through text-muted-foreground' : 'text-foreground'}>{job.pickupAddress}</span>
                                </div>
                              </div>
                              {/* Delivery row */}
                              <div className="flex items-start gap-2 text-sm">
                                <span className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${deliveryDone ? 'bg-green-600' : 'bg-primary/40'}`}>
                                  D
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[10px] font-semibold uppercase tracking-wide leading-tight ${deliveryDone ? 'text-green-600' : 'text-muted-foreground'}`}>Delivery</span>
                                    {deliveryDone && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">Done</span>}
                                  </div>
                                  <span className={deliveryDone ? 'line-through text-muted-foreground' : 'text-foreground'}>{job.deliveryAddress}</span>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">Booked Vehicle</p>
                      <p className="font-medium capitalize">{job.vehicleType}</p>
                    </div>
                  </CardContent>
                </Card>

                {job.driverName && !['delivered', 'cancelled', 'failed'].includes(job.status) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        Driver Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Driver</p>
                        <p className="font-medium">{job.driverName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Vehicle Type</p>
                        <p className="font-medium capitalize">{job.driverVehicleType || job.vehicleType}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{job.driverPhone || '—'}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {job.estimatedDelivery && job.status !== 'delivered' && (
                <Card className="mt-6 bg-primary/5 border-primary/20">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Estimated Delivery Time</p>
                        <p className="text-2xl font-bold text-primary">{job.estimatedDelivery}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </section>
      )}

      {!job && !isLoading && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
              <h2 className="text-xl font-semibold mb-2">Enter Your Tracking Number</h2>
              <p className="text-muted-foreground">
                Your tracking number was provided in your confirmation email and starts with "RC"
              </p>
            </div>
          </div>
        </section>
      )}
    </PublicLayout>
  );
}
