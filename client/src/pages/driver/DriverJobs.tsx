import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Package,
  MapPin,
  Clock,
  ArrowRight,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Job, Driver, JobStatus } from '@shared/schema';

const formatPrice = (price: string | number) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${num.toFixed(2)}`;
};

const getStatusBadge = (status: JobStatus) => {
  const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    pending: 'secondary',
    assigned: 'outline',
    accepted: 'default',
    on_the_way_pickup: 'default',
    arrived_pickup: 'default',
    collected: 'default',
    on_the_way_delivery: 'default',
    delivered: 'secondary',
    cancelled: 'destructive',
  };
  const labels: Record<string, string> = {
    pending: 'Pending',
    assigned: 'Assigned',
    accepted: 'Accepted',
    on_the_way_pickup: 'To Pickup',
    arrived_pickup: 'At Pickup',
    collected: 'Collected',
    on_the_way_delivery: 'En Route',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
};

export default function DriverJobs() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: driver } = useQuery<Driver>({
    queryKey: ['/api/drivers/user', user?.id],
    enabled: !!user?.id,
  });

  const { data: myJobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { driverId: driver?.id }],
    enabled: !!driver?.id,
  });

  const { data: availableJobs, isLoading: availableLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { status: 'pending' }],
    enabled: Boolean(driver?.isAvailable && driver?.isVerified),
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

  const activeJobs = myJobs?.filter((j) => !['delivered', 'cancelled'].includes(j.status)) || [];
  const completedJobs = myJobs?.filter((j) => j.status === 'delivered') || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">My Jobs</h1>
          <p className="text-muted-foreground">View and manage your delivery jobs</p>
        </div>

        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active" data-testid="tab-active">
              Active ({activeJobs.length})
            </TabsTrigger>
            <TabsTrigger value="available" data-testid="tab-available">
              Available ({availableJobs?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              Completed ({completedJobs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {jobsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : activeJobs.length > 0 ? (
              activeJobs.map((job) => (
                <Card key={job.id} data-testid={`job-card-${job.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-mono font-medium">{job.trackingNumber}</span>
                          {getStatusBadge(job.status)}
                          <Badge variant="outline" className="capitalize">{job.vehicleType?.replace('_', ' ')}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{job.pickupPostcode} → {job.deliveryPostcode}</span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {job.distance} miles • {job.weight}kg
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary text-lg">{formatPrice(job.totalPrice)}</div>
                        <Button size="sm" className="mt-2" data-testid={`button-view-job-${job.id}`}>
                          View Details
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No active jobs</p>
                  <p className="text-sm text-muted-foreground">Accept a job from the Available tab</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="available" className="space-y-4">
            {!driver?.isVerified ? (
              <Card className="border-yellow-500">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Clock className="h-12 w-12 text-yellow-500 mb-4" />
                  <p className="font-medium text-yellow-600">Account Not Verified</p>
                  <p className="text-sm text-muted-foreground mt-1">Complete verification to see available jobs</p>
                </CardContent>
              </Card>
            ) : !driver?.isAvailable ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">You're currently offline</p>
                  <p className="text-sm text-muted-foreground mt-1">Go online from the Dashboard to see available jobs</p>
                </CardContent>
              </Card>
            ) : availableLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : availableJobs && availableJobs.length > 0 ? (
              availableJobs.map((job) => (
                <Card key={job.id} data-testid={`available-job-${job.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-mono font-medium">{job.trackingNumber}</span>
                          <Badge variant="outline" className="capitalize">{job.vehicleType?.replace('_', ' ')}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{job.pickupPostcode} → {job.deliveryPostcode}</span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {job.distance} miles • {job.weight}kg
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary text-lg">{formatPrice(job.totalPrice)}</div>
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
                            <CheckCircle className="mr-2 h-4 w-4" />
                          )}
                          Accept Job
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No available jobs</p>
                  <p className="text-sm text-muted-foreground mt-1">Check back soon for new deliveries</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedJobs.length > 0 ? (
              completedJobs.map((job) => (
                <Card key={job.id} data-testid={`completed-job-${job.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-mono font-medium">{job.trackingNumber}</span>
                          {getStatusBadge(job.status)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{job.pickupPostcode} → {job.deliveryPostcode}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">{formatPrice(job.totalPrice)}</div>
                        <p className="text-xs text-muted-foreground mt-1">Completed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No completed jobs yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Complete your first delivery to see it here</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
