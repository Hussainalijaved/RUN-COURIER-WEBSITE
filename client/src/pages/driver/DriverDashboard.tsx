import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package,
  MapPin,
  Clock,
  Navigation,
  Phone,
  CheckCircle,
  TrendingUp,
  Star,
  Truck,
  ArrowRight,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Job, Driver, JobStatus } from '@shared/schema';

interface DriverStats {
  todaysJobs: number;
  completedJobs: number;
  activeJobs: number;
  totalEarnings: number;
  totalJobs: number;
}

const formatPrice = (price: string | number) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${num.toFixed(2)}`;
};

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

export default function DriverDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: driver, isLoading: driverLoading, error: driverError } = useQuery<Driver>({
    queryKey: ['/api/drivers/user', user?.id],
    enabled: !!user?.id,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DriverStats>({
    queryKey: ['/api/stats/driver', driver?.id],
    enabled: !!driver?.id,
  });

  const { data: myJobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { driverId: driver?.id }],
    enabled: !!driver?.id,
  });

  const { data: availableJobs } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { status: 'pending' }],
    enabled: Boolean(driver?.isAvailable && driver?.isVerified),
  });

  const availabilityMutation = useMutation({
    mutationFn: async (isAvailable: boolean) => {
      if (!driver) return;
      return apiRequest('PATCH', `/api/drivers/${driver.id}/availability`, { isAvailable });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/user', user?.id] });
      toast({ title: driver?.isAvailable ? 'You are now offline' : 'You are now online' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: JobStatus }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ title: 'Status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  const acceptJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      if (!driver) return;
      return apiRequest('PATCH', `/api/jobs/${jobId}/assign`, { driverId: driver.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ title: 'Job accepted!' });
    },
    onError: () => {
      toast({ title: 'Failed to accept job', variant: 'destructive' });
    },
  });

  const activeJob = myJobs?.find((j) => 
    !['delivered', 'cancelled', 'pending'].includes(j.status)
  );

  const advanceStatus = (job: Job) => {
    const currentIndex = statusFlow.indexOf(job.status);
    if (currentIndex < statusFlow.length - 1) {
      const nextStatus = statusFlow[currentIndex + 1];
      updateStatusMutation.mutate({ jobId: job.id, status: nextStatus });
    }
  };

  const isOnline = driver?.isAvailable || false;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Driver Dashboard</h1>
            <p className="text-muted-foreground">Manage your deliveries and availability</p>
          </div>
          <div className="flex items-center gap-3">
            {driverLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <>
                <Label htmlFor="online-toggle" className="text-sm">
                  {isOnline ? 'Online' : 'Offline'}
                </Label>
                <Switch
                  id="online-toggle"
                  checked={isOnline}
                  onCheckedChange={(checked) => availabilityMutation.mutate(checked)}
                  disabled={availabilityMutation.isPending}
                  data-testid="switch-online"
                />
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card data-testid="stat-earnings">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Earnings</CardTitle>
              <TrendingUp className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{formatPrice(stats?.totalEarnings || 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="stat-completed">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Jobs Completed</CardTitle>
              <CheckCircle className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{stats?.completedJobs || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="stat-rating">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rating</CardTitle>
              <Star className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {driverLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{driver?.rating || '5.0'}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {activeJob && (
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Current Job
                </CardTitle>
                <Badge className="bg-primary" data-testid="badge-current-status">{getStatusLabel(activeJob.status)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className={`p-4 rounded-lg border-2 ${
                  activeJob.status.includes('pickup') ? 'border-primary bg-primary/5' : 'border-border'
                }`} data-testid="pickup-info">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-green-500" />
                    <span className="font-semibold">Pickup</span>
                  </div>
                  <p className="text-sm mb-2">{activeJob.pickupAddress}</p>
                  <p className="text-sm font-mono text-muted-foreground">{activeJob.pickupPostcode}</p>
                  {activeJob.pickupInstructions && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Note: {activeJob.pickupInstructions}
                    </p>
                  )}
                </div>

                <div className={`p-4 rounded-lg border-2 ${
                  activeJob.status.includes('delivery') || activeJob.status === 'collected' ? 'border-primary bg-primary/5' : 'border-border'
                }`} data-testid="delivery-info">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-red-500" />
                    <span className="font-semibold">Delivery</span>
                  </div>
                  <p className="text-sm mb-2">{activeJob.deliveryAddress}</p>
                  <p className="text-sm font-mono text-muted-foreground">{activeJob.deliveryPostcode}</p>
                  {activeJob.recipientName && (
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                      <span>{activeJob.recipientName}</span>
                      {activeJob.recipientPhone && (
                        <a href={`tel:${activeJob.recipientPhone}`} className="flex items-center gap-1 text-primary">
                          <Phone className="h-3 w-3" />
                          Call
                        </a>
                      )}
                    </div>
                  )}
                  {activeJob.deliveryInstructions && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Note: {activeJob.deliveryInstructions}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" className="flex-1" data-testid="button-open-maps">
                  <Navigation className="mr-2 h-4 w-4" />
                  Open in Maps
                </Button>
                <Button 
                  onClick={() => advanceStatus(activeJob)} 
                  className="flex-1" 
                  disabled={updateStatusMutation.isPending || activeJob.status === 'delivered'}
                  data-testid="button-advance-status"
                >
                  {updateStatusMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  {getNextActionLabel(activeJob.status)}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isOnline && driver?.isVerified && (
          <Card>
            <CardHeader>
              <CardTitle>Available Jobs</CardTitle>
              <CardDescription>Accept a job to start earning</CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : availableJobs && availableJobs.length > 0 ? (
                <div className="space-y-3">
                  {availableJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors"
                      data-testid={`available-job-${job.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-medium">{job.trackingNumber}</span>
                          <Badge variant="outline" className="capitalize">{job.vehicleType?.replace('_', ' ')}</Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {job.pickupPostcode} → {job.deliveryPostcode}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {job.distance} miles • {job.weight}kg
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary">{formatPrice(job.totalPrice)}</div>
                        <Button 
                          size="sm" 
                          className="mt-2" 
                          onClick={() => acceptJobMutation.mutate(job.id)}
                          disabled={acceptJobMutation.isPending}
                          data-testid={`button-accept-job-${job.id}`}
                        >
                          {acceptJobMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              Accept
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No available jobs at the moment</p>
                  <p className="text-sm text-muted-foreground mt-1">Check back soon for new deliveries</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!driver?.isVerified && (
          <Card className="border-yellow-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-600">
                <Clock className="h-5 w-5" />
                Verification Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Your account is pending verification. Please upload all required documents to start accepting jobs.
              </p>
              <Button variant="outline" className="mt-4" data-testid="button-upload-documents">
                Upload Documents
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
