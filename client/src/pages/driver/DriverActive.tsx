import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package,
  MapPin,
  Navigation,
  Phone,
  CheckCircle,
  Truck,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import {
  useDriver,
  useDriverJobs,
  useUpdateJobStatus,
} from '@/hooks/useSupabaseDriver';
import type { JobStatus } from '@shared/schema';
import type { DriverJob } from '@/lib/data/base';

const getStatusLabel = (status: JobStatus) => {
  const labels: Record<string, string> = {
    assigned: 'Job Assigned',
    accepted: 'Job Accepted',
    on_the_way_pickup: 'Heading to Pickup',
    arrived_pickup: 'Arrived at Pickup',
    collected: 'Parcel Collected',
    on_the_way_delivery: 'Heading to Delivery',
    delivered: 'Delivered',
  };
  return labels[status] || status;
};

const getNextActionLabel = (status: JobStatus) => {
  const actions: Record<string, string> = {
    assigned: 'Accept Job',
    accepted: 'Start Journey',
    on_the_way_pickup: 'Arrived at Pickup',
    arrived_pickup: 'Collected Parcel',
    collected: 'En Route to Delivery',
    on_the_way_delivery: 'Mark Delivered',
  };
  return actions[status] || 'Complete';
};

const statusFlow: JobStatus[] = [
  'assigned',
  'accepted',
  'on_the_way_pickup',
  'arrived_pickup',
  'collected',
  'on_the_way_delivery',
  'delivered',
];

export default function DriverActive() {
  const { toast } = useToast();

  const { data: driver, isLoading: driverLoading } = useDriver();
  const { data: myJobs, isLoading: jobsLoading } = useDriverJobs(driver?.id);
  const updateStatusMutation = useUpdateJobStatus();

  const activeJob = myJobs?.find((j) => 
    !['delivered', 'cancelled', 'pending'].includes(j.status)
  );

  const advanceStatus = (job: DriverJob) => {
    const currentIndex = statusFlow.indexOf(job.status);
    if (currentIndex < statusFlow.length - 1) {
      const nextStatus = statusFlow[currentIndex + 1];
      updateStatusMutation.mutate(
        { jobId: job.id, status: nextStatus },
        {
          onSuccess: () => toast({ title: 'Status updated' }),
          onError: () => toast({ title: 'Failed to update status', variant: 'destructive' }),
        }
      );
    }
  };

  const isLoading = driverLoading || jobsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Active Job</h1>
          <p className="text-muted-foreground">Manage your current delivery</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : activeJob ? (
          <Card className="border-primary" data-testid="active-job-card">
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  {activeJob.trackingNumber}
                </CardTitle>
                <Badge className="bg-primary" data-testid="badge-current-status">
                  {getStatusLabel(activeJob.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-2 flex-wrap p-3 bg-muted rounded-lg">
                {statusFlow.slice(0, -1).map((status, index) => {
                  const isCurrent = activeJob.status === status;
                  const isPast = statusFlow.indexOf(activeJob.status) > index;
                  return (
                    <div key={status} className="flex items-center gap-1">
                      <div className={`w-3 h-3 rounded-full ${
                        isPast ? 'bg-green-500' : isCurrent ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'
                      }`} />
                      {index < statusFlow.length - 2 && (
                        <div className={`w-8 h-0.5 ${isPast ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className={`p-4 rounded-lg border-2 ${
                  activeJob.status.includes('pickup') ? 'border-primary bg-primary/5' : 'border-border'
                }`} data-testid="pickup-info">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-green-500" />
                    <span className="font-semibold">Pickup Location</span>
                  </div>
                  <p className="text-sm mb-2">{activeJob.pickupAddress || 'Address pending'}</p>
                  <p className="text-sm font-mono text-muted-foreground">{activeJob.pickupPostcode}</p>
                  {activeJob.pickupInstructions && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Note: {activeJob.pickupInstructions}
                    </p>
                  )}
                  <Button variant="outline" size="sm" className="mt-3 w-full" data-testid="button-navigate-pickup">
                    <Navigation className="mr-2 h-4 w-4" />
                    Navigate to Pickup
                  </Button>
                </div>

                <div className={`p-4 rounded-lg border-2 ${
                  activeJob.status.includes('delivery') || activeJob.status === 'collected' ? 'border-primary bg-primary/5' : 'border-border'
                }`} data-testid="delivery-info">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-red-500" />
                    <span className="font-semibold">Delivery Location</span>
                  </div>
                  <p className="text-sm mb-2">{activeJob.deliveryAddress || 'Address pending'}</p>
                  <p className="text-sm font-mono text-muted-foreground">{activeJob.deliveryPostcode}</p>
                  {activeJob.recipientName && (
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                      <span>{activeJob.recipientName}</span>
                      {activeJob.recipientPhone && (
                        <a href={`tel:${activeJob.recipientPhone}`} className="flex items-center gap-1 text-primary hover:underline">
                          <Phone className="h-3 w-3" />
                          Call
                        </a>
                      )}
                    </div>
                  )}
                  {activeJob.deliveryInstructions && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Note: {activeJob.deliveryInstructions}
                    </p>
                  )}
                  <Button variant="outline" size="sm" className="mt-3 w-full" data-testid="button-navigate-delivery">
                    <Navigation className="mr-2 h-4 w-4" />
                    Navigate to Delivery
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Parcel Details</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Weight</span>
                    <p className="font-medium">{activeJob.weight}kg</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Distance</span>
                    <p className="font-medium">{activeJob.distance} miles</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vehicle</span>
                    <p className="font-medium capitalize">{activeJob.vehicleType?.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Earnings</span>
                    <p className="font-medium text-green-600">
                      {activeJob.driverPrice 
                        ? `£${parseFloat(activeJob.driverPrice).toFixed(2)}` 
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => advanceStatus(activeJob)} 
                className="w-full" 
                size="lg"
                disabled={updateStatusMutation.isPending || activeJob.status === 'delivered'}
                data-testid="button-advance-status"
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-5 w-5" />
                )}
                {getNextActionLabel(activeJob.status)}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Package className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Active Job</h3>
              <p className="text-muted-foreground text-center mb-4">
                You don't have any active deliveries right now.
              </p>
              <Link href="/driver/jobs">
                <Button data-testid="button-find-jobs">
                  View Assigned Jobs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
