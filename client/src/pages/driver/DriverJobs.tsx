import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Package,
  MapPin,
  ArrowRight,
  Loader2,
  CheckCircle,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import {
  useDriver,
  useDriverJobs,
  useAcceptJob,
  useDriverAssignments,
  useRespondToAssignment,
  useDeclineJob,
} from '@/hooks/useSupabaseDriver';
import type { JobStatus } from '@shared/schema';
import type { DriverJob } from '@/lib/data/base';

const REJECTION_REASONS = [
  'Unacceptable rate',
  'Too far from pickup location',
  'Vehicle not suitable for this job',
  'Already on another delivery',
  'Not available at the scheduled time',
  'Personal emergency',
  'Other (please specify)',
];

const formatPrice = (price: string | number | null) => {
  if (price === null || price === undefined) return '—';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '—';
  return `£${num.toFixed(2)}`;
};

// Drivers should ONLY see the admin-set driver price, never the customer's total price
const getDriverPayment = (job: { driverPrice?: string | null }): number | null => {
  if (job.driverPrice) {
    return parseFloat(job.driverPrice);
  }
  // Return null if no driver price is set - drivers should not see customer pricing
  return null;
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
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState('');
  const [declineJobDialogOpen, setDeclineJobDialogOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDeclineReason, setJobDeclineReason] = useState<string>('');
  const [jobCustomReason, setJobCustomReason] = useState('');
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<DriverJob | null>(null);
  const prevAssignedCountRef = useRef<number>(0);
  const prevPendingCountRef = useRef<number>(0);
  const { playAlert, playNotification } = useNotificationSound({ enabled: soundEnabled, volume: 0.8 });

  const { data: driver } = useDriver();
  const { data: myJobs, isLoading: jobsLoading } = useDriverJobs(driver?.id);
  const { data: pendingAssignments, isLoading: assignmentsLoading } = useDriverAssignments(driver?.id);
  const acceptJobMutation = useAcceptJob();
  const respondToAssignmentMutation = useRespondToAssignment();
  const declineJobMutation = useDeclineJob();

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

  const openRejectDialog = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setSelectedReason('');
    setCustomReason('');
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = () => {
    if (!selectedAssignmentId) return;
    
    const finalReason = selectedReason === 'Other (please specify)' 
      ? customReason 
      : selectedReason;
    
    respondToAssignmentMutation.mutate(
      { assignmentId: selectedAssignmentId, accepted: false, rejectionReason: finalReason },
      {
        onSuccess: () => {
          toast({ 
            title: 'Job Declined',
            description: 'The dispatcher will find another driver.',
          });
          setRejectDialogOpen(false);
          setSelectedAssignmentId(null);
          setSelectedReason('');
          setCustomReason('');
        },
        onError: (error: any) => {
          toast({ 
            title: 'Failed to decline job', 
            description: error?.message || 'Please try again',
            variant: 'destructive' 
          });
        },
      }
    );
  };

  const handleAcceptAssignment = (assignmentId: string) => {
    respondToAssignmentMutation.mutate(
      { assignmentId, accepted: true },
      {
        onSuccess: () => {
          toast({ 
            title: 'Job Accepted!',
            description: 'The job has been assigned to you.',
          });
        },
        onError: (error: any) => {
          toast({ 
            title: 'Failed to accept job', 
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

  const openDeclineJobDialog = (jobId: string) => {
    setSelectedJobId(jobId);
    setJobDeclineReason('');
    setJobCustomReason('');
    setDeclineJobDialogOpen(true);
  };

  const handleConfirmDeclineJob = () => {
    if (!selectedJobId) return;
    
    const finalReason = jobDeclineReason === 'Other (please specify)' 
      ? jobCustomReason 
      : jobDeclineReason;
    
    declineJobMutation.mutate(
      { jobId: selectedJobId, rejectionReason: finalReason },
      {
        onSuccess: () => {
          toast({ 
            title: 'Job Declined',
            description: 'The job has been returned for reassignment.',
          });
          setDeclineJobDialogOpen(false);
          setSelectedJobId(null);
          setJobDeclineReason('');
          setJobCustomReason('');
        },
        onError: (error: any) => {
          toast({ 
            title: 'Failed to decline job', 
            description: error?.message || 'Please try again',
            variant: 'destructive' 
          });
        },
      }
    );
  };

  const handleViewDetails = (job: DriverJob) => {
    setSelectedJobForDetails(job);
    setViewDetailsOpen(true);
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
                        onClick={() => handleAcceptAssignment(assignment.id)}
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
                        className="flex-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950" 
                        onClick={() => openRejectDialog(assignment.id)}
                        disabled={respondToAssignmentMutation.isPending}
                        data-testid={`button-decline-offer-${assignment.id}`}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
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
                      <div className="flex flex-col items-end gap-2">
                        <div className="font-bold text-primary text-lg">{formatPrice(getDriverPayment(job))}</div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleAcceptJob(job.id)}
                            disabled={acceptJobMutation.isPending || declineJobMutation.isPending}
                            data-testid={`button-accept-job-${job.id}`}
                          >
                            {acceptJobMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="mr-2 h-4 w-4" />
                            )}
                            Accept
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={() => openDeclineJobDialog(job.id)}
                            disabled={acceptJobMutation.isPending || declineJobMutation.isPending}
                            data-testid={`button-decline-job-${job.id}`}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Decline
                          </Button>
                        </div>
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
                        <Button 
                          size="sm" 
                          className="mt-2" 
                          onClick={() => handleViewDetails(job)}
                          data-testid={`button-view-job-${job.id}`}
                        >
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

      {/* Rejection Reason Dialog for Job Offers */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Decline Job Offer</AlertDialogTitle>
            <AlertDialogDescription>
              Please select a reason for declining this job. This helps dispatch understand and find a better match.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
              {REJECTION_REASONS.map((reason) => (
                <div key={reason} className="flex items-center space-x-3">
                  <RadioGroupItem value={reason} id={reason} data-testid={`radio-reason-${reason.replace(/\s+/g, '-').toLowerCase()}`} />
                  <Label htmlFor={reason} className="cursor-pointer text-sm">
                    {reason}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            
            {selectedReason === 'Other (please specify)' && (
              <Textarea
                placeholder="Please describe your reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-2"
                data-testid="textarea-custom-reason"
              />
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setRejectDialogOpen(false);
                setSelectedAssignmentId(null);
                setSelectedReason('');
                setCustomReason('');
              }}
              data-testid="button-cancel-decline"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReject}
              disabled={!selectedReason || (selectedReason === 'Other (please specify)' && !customReason.trim()) || respondToAssignmentMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-decline"
            >
              {respondToAssignmentMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Confirm Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline Job Dialog for Assigned Jobs */}
      <AlertDialog open={declineJobDialogOpen} onOpenChange={setDeclineJobDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Decline Assigned Job</AlertDialogTitle>
            <AlertDialogDescription>
              Please select a reason for declining this job. The job will be returned to the queue for reassignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            <RadioGroup value={jobDeclineReason} onValueChange={setJobDeclineReason}>
              {REJECTION_REASONS.map((reason) => (
                <div key={`job-${reason}`} className="flex items-center space-x-3">
                  <RadioGroupItem value={reason} id={`job-${reason}`} data-testid={`radio-job-reason-${reason.replace(/\s+/g, '-').toLowerCase()}`} />
                  <Label htmlFor={`job-${reason}`} className="cursor-pointer text-sm">
                    {reason}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            
            {jobDeclineReason === 'Other (please specify)' && (
              <Textarea
                placeholder="Please describe your reason..."
                value={jobCustomReason}
                onChange={(e) => setJobCustomReason(e.target.value)}
                className="mt-2"
                data-testid="textarea-job-custom-reason"
              />
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setDeclineJobDialogOpen(false);
                setSelectedJobId(null);
                setJobDeclineReason('');
                setJobCustomReason('');
              }}
              data-testid="button-cancel-job-decline"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeclineJob}
              disabled={!jobDeclineReason || (jobDeclineReason === 'Other (please specify)' && !jobCustomReason.trim()) || declineJobMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-job-decline"
            >
              {declineJobMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Confirm Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Job Details Dialog */}
      <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Job Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedJobForDetails && (
            <div className="space-y-4">
              {/* Status & Tracking */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tracking #</span>
                <span className="font-mono font-medium">{selectedJobForDetails.trackingNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(selectedJobForDetails.status)}
              </div>
              
              <Separator />
              
              {/* Pickup Details */}
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-600" />
                  Pickup
                </h4>
                <div className="bg-muted/50 p-3 rounded-md space-y-1">
                  <p className="font-medium">{selectedJobForDetails.pickupContactName || 'N/A'}</p>
                  <p className="text-sm">{selectedJobForDetails.pickupAddress}</p>
                  {selectedJobForDetails.pickupPostcode && (
                    <p className="text-sm font-mono">{selectedJobForDetails.pickupPostcode}</p>
                  )}
                  {selectedJobForDetails.pickupPhone && (
                    <p className="text-sm text-muted-foreground">{selectedJobForDetails.pickupPhone}</p>
                  )}
                  {selectedJobForDetails.pickupInstructions && (
                    <p className="text-sm text-muted-foreground italic mt-2">
                      Note: {selectedJobForDetails.pickupInstructions}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Delivery Details */}
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-red-600" />
                  Delivery
                </h4>
                <div className="bg-muted/50 p-3 rounded-md space-y-1">
                  <p className="font-medium">{selectedJobForDetails.deliveryContactName || 'N/A'}</p>
                  <p className="text-sm">{selectedJobForDetails.deliveryAddress}</p>
                  {selectedJobForDetails.deliveryPostcode && (
                    <p className="text-sm font-mono">{selectedJobForDetails.deliveryPostcode}</p>
                  )}
                  {selectedJobForDetails.deliveryPhone && (
                    <p className="text-sm text-muted-foreground">{selectedJobForDetails.deliveryPhone}</p>
                  )}
                  {selectedJobForDetails.deliveryInstructions && (
                    <p className="text-sm text-muted-foreground italic mt-2">
                      Note: {selectedJobForDetails.deliveryInstructions}
                    </p>
                  )}
                </div>
              </div>
              
              <Separator />
              
              {/* Package Details */}
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Package Information
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Distance</span>
                    <p className="font-medium">{selectedJobForDetails.distance} miles</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Weight</span>
                    <p className="font-medium">{selectedJobForDetails.weight} kg</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vehicle</span>
                    <p className="font-medium capitalize">{selectedJobForDetails.vehicleType?.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Urgency</span>
                    <p className="font-medium capitalize">{selectedJobForDetails.urgency}</p>
                  </div>
                </div>
                {selectedJobForDetails.packageDescription && (
                  <div className="mt-3">
                    <span className="text-sm text-muted-foreground">Description</span>
                    <p className="text-sm">{selectedJobForDetails.packageDescription}</p>
                  </div>
                )}
              </div>
              
              <Separator />
              
              {/* Payment */}
              <div className="flex items-center justify-between bg-primary/5 p-3 rounded-md">
                <span className="font-medium">Your Payment</span>
                <span className="text-xl font-bold text-primary">
                  {formatPrice(getDriverPayment(selectedJobForDetails))}
                </span>
              </div>
              
              {/* Close Button */}
              <Button 
                className="w-full" 
                variant="outline" 
                onClick={() => setViewDetailsOpen(false)}
                data-testid="button-close-details"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
