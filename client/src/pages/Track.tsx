import { useState, useEffect } from 'react';
import { useSearch } from 'wouter';
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
} from 'lucide-react';
import { SmoothBackground } from '@/components/ui/smooth-image';
import trackingHeroImage from '@assets/generated_images/courier_tracking_van_gps_concept.png';
import type { JobStatus } from '@shared/schema';

const statusSteps: { status: JobStatus; label: string; icon: any }[] = [
  { status: 'pending', label: 'Order Placed', icon: Package },
  { status: 'assigned', label: 'Driver Assigned', icon: User },
  { status: 'on_the_way_pickup', label: 'En Route to Pickup', icon: Truck },
  { status: 'arrived_pickup', label: 'Arrived at Pickup', icon: MapPin },
  { status: 'collected', label: 'Parcel Collected', icon: Package },
  { status: 'on_the_way_delivery', label: 'Out for Delivery', icon: Truck },
  { status: 'delivered', label: 'Delivered', icon: CheckCircle },
];

const getStatusIndex = (status: JobStatus): number => {
  const index = statusSteps.findIndex((s) => s.status === status);
  return index >= 0 ? index : 0;
};

const getStatusColor = (status: JobStatus): string => {
  switch (status) {
    case 'delivered':
      return 'bg-green-500';
    case 'cancelled':
      return 'bg-red-500';
    case 'on_the_way_delivery':
    case 'on_the_way_pickup':
      return 'bg-blue-500';
    default:
      return 'bg-yellow-500';
  }
};

interface MockJob {
  id: string;
  trackingNumber: string;
  status: JobStatus;
  pickupAddress: string;
  deliveryAddress: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType: string;
  estimatedDelivery?: string;
  createdAt: string;
}

export default function Track() {
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const initialId = params.get('ref') || params.get('id') || '';
  
  const [trackingNumber, setTrackingNumber] = useState(initialId);
  const [isLoading, setIsLoading] = useState(false);
  const [job, setJob] = useState<MockJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTrackingData = async (number: string) => {
    if (!number.trim()) {
      setError('Please enter a tracking number');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/track/${number.toUpperCase()}`);
      
      if (response.ok) {
        const data = await response.json();
        setJob({
          id: data.id,
          trackingNumber: data.trackingNumber,
          status: data.status,
          pickupAddress: `${data.pickupAddress}, ${data.pickupPostcode}`,
          deliveryAddress: `${data.deliveryAddress}, ${data.deliveryPostcode}`,
          driverName: data.driverName || undefined,
          driverPhone: data.driverPhone || undefined,
          vehicleType: data.vehicleType?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Standard',
          estimatedDelivery: data.estimatedDeliveryTime ? new Date(data.estimatedDeliveryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : undefined,
          createdAt: data.createdAt,
        });
        setError(null);
      } else {
        setError('Tracking number not found. Please check and try again.');
        setJob(null);
      }
    } catch (err) {
      setError('Unable to fetch tracking information. Please try again.');
      setJob(null);
    }

    setIsLoading(false);
  };

  const handleTrack = () => {
    fetchTrackingData(trackingNumber);
  };

  useEffect(() => {
    if (initialId) {
      fetchTrackingData(initialId);
    }
  }, [initialId]);

  const currentStepIndex = job ? getStatusIndex(job.status) : -1;

  return (
    <PublicLayout>
      <SmoothBackground 
        src={trackingHeroImage}
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
                      <CardTitle className="text-lg">Tracking Number</CardTitle>
                      <p className="text-2xl font-mono font-bold text-primary">
                        {job.trackingNumber}
                      </p>
                    </div>
                    <Badge className={`${getStatusColor(job.status)} text-white`}>
                      {statusSteps.find((s) => s.status === job.status)?.label || job.status}
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

              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      Delivery Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">From</p>
                      <p className="font-medium">{job.pickupAddress}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">To</p>
                      <p className="font-medium">{job.deliveryAddress}</p>
                    </div>
                  </CardContent>
                </Card>

                {job.driverName && (
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
                        <p className="text-sm text-muted-foreground">Vehicle</p>
                        <p className="font-medium">{job.vehicleType}</p>
                      </div>
                      {job.driverPhone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{job.driverPhone}</span>
                        </div>
                      )}
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
