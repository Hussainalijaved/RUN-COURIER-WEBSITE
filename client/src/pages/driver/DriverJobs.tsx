import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Package,
  MapPin,
  ArrowRight,
  Loader2,
  CheckCircle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import {
  useDriver,
  useDriverJobs,
  useAcceptJob,
  useDriverAssignments,
  useRespondToAssignment,
} from '@/hooks/useSupabaseDriver';
import type { JobStatus, Job } from '@shared/schema';

const formatPrice = (price: string | number) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${num.toFixed(2)}`;
};

const getDriverPayment = (job: { driverPrice?: string | null; totalPrice?: string | number }) => {
  if (job.driverPrice) {
    return parseFloat(job.driverPrice);
  }
  return typeof job.totalPrice === 'string' ? parseFloat(job.totalPrice) : (job.totalPrice || 0);
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
  const { toast } = useToast();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevAssignedCountRef = useRef<number>(0);
  const prevPendingCountRef = useRef<number>(0);
  const { playAlert, playNotification } = useNotificationSound({ enabled: soundEnabled, volume: 0.8 });

  const { data: driver } = useDriver();
  const { data: myJobs, isLoading: jobsLoading } = useDriverJobs(driver?.id);
  const { data: pendingAssignments, isLoading: assignmentsLoading } = useDriverAssignments(driver?.id);
  const acceptJobMutation = useAcceptJob();
  const respondToAssignmentMutation = useRespondToAssignment();

  // Detect new assigned jobs and play alert sound
  const assignedJobs = myJobs?.filter((j) => j.status === 'assigned') || [];
  
  useEffect(() => {
    const currentCount = assignedJobs.length;
    const prevCount = prevAssignedCountRef.current;
    
    // Play sound when new job is assigned
    if (prevCount > 0 && currentCount > prevCount) {
      playAlert();
      toast({
        title: 'New Job Assigned!',
        description: 'You have a new delivery job waiting.',
      });
    } else if (prevCount === 0 && currentCount > 0) {
      // First load with assigned jobs - play notification
      playNotification();
    }
    
    prevAssignedCountRef.current = currentCount;
  }, [assignedJobs.length, playAlert, playNotification, toast]);

  // Detect new pending assignments and play alert sound
  useEffect(() => {
    const currentCount = pendingAssignments?.length || 0;
    const prevCount = prevPendingCountRef.current;
    
    if (prevCount > 0 && currentCount > prevCount) {
      playAlert();
      toast({
        title: 'New Job Offer!',
        description: 'You have a new job offer from dispatch. Please review and respond.',
      });
    } else if (prevCount === 0 && currentCount > 0 && prevAssignedCountRef.current > 0) {
      playNotification();
    }
    
    prevPendingCountRef.current = currentCount;
  }, [pendingAssignments?.length, playAlert, playNotification, toast]);

  const handleRespondToAssignment = (assignmentId: string, accepted: boolean) => {
    respondToAssignmentMutation.mutate(
      { assignmentId, accepted },
      {
        onSuccess: () => {
          toast({ 
            title: accepted ? 'Job Accepted!' : 'Job Declined',
            description: accepted 
              ? 'The job has been assigned to you.' 
              : 'The dispatcher will find another driver.',
          });
        },
        onError: (error: any) => {
          toast({ 
            title: 'Failed to respond', 
            description: error?.message || 'Please try again',
            variant: 'destructive' 
          });
        },
      }
    );
  };

  const handleAcceptJob = (jobId: string) => {
    if (!driver) return;
    acceptJobMutation.mutate(
      { jobId, driverId: driver.id },
      {
        onSuccess: () => toast({ title: 'Job accepted!' }),
        onError: () => toast({ title: 'Failed to accept job', variant: 'destructive' }),
      }
    );
  };

  const activeJobs = myJobs?.filter((j) => !['delivered', 'cancelled', 'assigned', 'pending'].includes(j.status)) || [];
  const completedJobs = myJobs?.filter((j) => j.status === 'delivered') || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">My Jobs</h1>
            <p className="text-muted-foreground">View and manage your delivery jobs</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Disable notification sounds' : 'Enable notification sounds'}
              data-testid="button-toggle-sound"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                playAlert();
                toast({ title: 'Sound Test', description: 'Alert sound played!' });
              }}
              data-testid="button-test-sound"
            >
              Test Sound
            </Button>
          </div>
        </div>

        <Tabs defaultValue={pendingAssignments && pendingAssignments.length > 0 ? "offers" : "assigned"} className="space-y-4">
          <TabsList className="flex-wrap">
            {pendingAssignments && pendingAssignments.length > 0 && (
              <TabsTrigger value="offers" className="relative" data-testid="tab-offers">
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Offers ({pendingAssignments.length})
              </TabsTrigger>
            )}
            <TabsTrigger value="assigned" data-testid="tab-assigned">
              Assigned ({assignedJobs.length})
            </TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">
              Active ({activeJobs.length})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              Completed ({completedJobs.length})
            </TabsTrigger>
          </TabsList>

          {/* Job Offers Tab - Pending assignments from dispatch */}
          <TabsContent value="offers" className="space-y-4">
            {assignmentsLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : pendingAssignments && pendingAssignments.length > 0 ? (
              pendingAssignments.map((assignment) => (
                <Card key={assignment.id} className="border-2 border-primary/20 bg-primary/5" data-testid={`offer-card-${assignment.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge className="bg-blue-600 text-white">New Job Offer</Badge>
                      <span className="text-xs text-muted-foreground">
                        {assignment.sentAt ? new Date(assignment.sentAt).toLocaleString() : 'Just now'}
                      </span>
                    </div>
                    
                    <div className="bg-background rounded-md p-3 mb-4">
                      <div className="text-center py-2">
                        <div className="text-sm text-muted-foreground mb-1">Your Payment</div>
                        <div className="text-3xl font-bold text-primary">£{parseFloat(assignment.driverPrice).toFixed(2)}</div>
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-4">
                      Job #{assignment.jobId.substring(0, 8)} has been offered to you by dispatch. 
                      Accept to take this delivery or decline to let another driver handle it.
                    </p>
                    
                    <div className="flex gap-2">
                      <Button 
                        className="flex-1 bg-green-600 hover:bg-green-700" 
                        onClick={() => handleRespondToAssignment(assignment.id, true)}
                        disabled={respondToAssignmentMutation.isPending}
                        data-testid={`button-accept-offer-${assignment.id}`}
                      >
                        {respondToAssignmentMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-2 h-4 w-4" />
                        )}
                        Accept
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1 text-red-600 border-red-200 hover:bg-red-50" 
                        onClick={() => handleRespondToAssignment(assignment.id, false)}
                        disabled={respondToAssignmentMutation.isPending}
                        data-testid={`button-decline-offer-${assignment.id}`}
                      >
                        Decline
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No pending job offers</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="assigned" className="space-y-4">
            {jobsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : assignedJobs.length > 0 ? (
              assignedJobs.map((job) => (
                <Card key={job.id} data-testid={`assigned-job-${job.id}`}>
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
                        <div className="font-bold text-primary text-lg">{formatPrice(getDriverPayment(job))}</div>
                        <Button 
                          size="sm" 
                          className="mt-2" 
                          onClick={() => handleAcceptJob(job.id)}
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
                  <p className="text-muted-foreground">No jobs assigned to you</p>
                  <p className="text-sm text-muted-foreground mt-1">Admin will assign jobs when available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

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
                        <div className="font-bold text-primary text-lg">{formatPrice(getDriverPayment(job))}</div>
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
                  <p className="text-sm text-muted-foreground">Accept an assigned job to start</p>
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
                        <div className="font-bold text-green-600">{formatPrice(getDriverPayment(job))}</div>
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
