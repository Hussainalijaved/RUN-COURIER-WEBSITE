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
  Loader2,
  FileText,
  XCircle,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  useDriver,
  useDriverJobs,
  useDriverStats,
  useUpdateDriverAvailability,
  useUpdateJobStatus,
  useAcceptJob,
  useDriverDocuments,
} from '@/hooks/useSupabaseDriver';
import type { Job, JobStatus } from '@shared/schema';

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

  const { data: driver, isLoading: driverLoading } = useDriver();
  const { data: myJobs, isLoading: jobsLoading } = useDriverJobs(driver?.id);
  const { data: documents } = useDriverDocuments(driver?.id);
  const stats = useDriverStats(driver?.id);
  const statsLoading = jobsLoading;

  const availabilityMutation = useUpdateDriverAvailability();
  const updateStatusMutation = useUpdateJobStatus();
  const acceptJobMutation = useAcceptJob();
  
  // Calculate document statistics
  const approvedDocs = documents?.filter(d => d.status === 'approved').length || 0;
  const pendingDocs = documents?.filter(d => d.status === 'pending').length || 0;
  const rejectedDocs = documents?.filter(d => d.status === 'rejected').length || 0;
  const totalDocs = documents?.length || 0;

  const handleAvailabilityChange = (isAvailable: boolean) => {
    if (!driver) return;
    availabilityMutation.mutate(
      { driverId: driver.id, isAvailable },
      {
        onSuccess: () => toast({ title: isAvailable ? 'You are now online' : 'You are now offline' }),
        onError: () => toast({ title: 'Failed to update status', variant: 'destructive' }),
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

  const activeJob = myJobs?.find((j) => 
    !['delivered', 'cancelled', 'pending'].includes(j.status)
  );

  const advanceStatus = (job: Job) => {
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
            ) : driver?.isVerified ? (
              <>
                <Label htmlFor="online-toggle" className="text-sm">
                  {isOnline ? 'Online' : 'Offline'}
                </Label>
                <Switch
                  id="online-toggle"
                  checked={isOnline}
                  onCheckedChange={handleAvailabilityChange}
                  disabled={availabilityMutation.isPending}
                  data-testid="switch-online"
                />
              </>
            ) : (
              <Badge variant="outline" className="text-yellow-600 border-yellow-500" data-testid="badge-pending-verification">
                <Clock className="h-3 w-3 mr-1" />
                Pending Approval
              </Badge>
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

        {driver?.isVerified && (
          <Card>
            <CardHeader>
              <CardTitle>Assigned Jobs</CardTitle>
              <CardDescription>Jobs assigned to you by dispatch</CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : myJobs && myJobs.filter(j => j.status === 'assigned').length > 0 ? (
                <div className="space-y-3">
                  {myJobs.filter(j => j.status === 'assigned').map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors"
                      data-testid={`assigned-job-${job.id}`}
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
                          onClick={() => handleAcceptJob(job.id)}
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
                  <p className="text-muted-foreground">No jobs assigned to you</p>
                  <p className="text-sm text-muted-foreground mt-1">Admin will assign jobs when available</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!driver?.isVerified && (
          <Card className="border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20" data-testid="card-verification-pending">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-500">
                <AlertTriangle className="h-5 w-5" />
                Admin Approval Required
              </CardTitle>
              <CardDescription className="text-yellow-600 dark:text-yellow-400">
                Your account is pending admin verification. All new drivers must be approved before accepting jobs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-white dark:bg-black/20 p-4 border">
                <h4 className="font-medium mb-3">Your Document Status</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm">{approvedDocs} Approved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm">{pendingDocs} Under Review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm">{rejectedDocs} Rejected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{totalDocs} Uploaded</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-primary/5 p-4 border border-primary/20">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-primary">Awaiting Admin Approval</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Our admin team will review your application and documents. You will receive notification when your account is activated.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 border border-blue-200 dark:border-blue-800">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Approval Process</h4>
                <ol className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
                  <li>Upload all required documents on the Documents page</li>
                  <li>Admin reviews your application and each document</li>
                  <li>All documents must be approved by admin</li>
                  <li>Admin activates your driver account</li>
                  <li>You can then go online and receive job assignments</li>
                </ol>
              </div>
              
              {rejectedDocs > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
                    <XCircle className="h-4 w-4" />
                    <span className="font-medium">Action Required</span>
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                    Some documents have been rejected. Please check the Documents page for details and re-upload.
                  </p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button asChild data-testid="button-upload-documents">
                  <Link href="/driver/documents">
                    <Upload className="mr-2 h-4 w-4" />
                    Go to Documents
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
