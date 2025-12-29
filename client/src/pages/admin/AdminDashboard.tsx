import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  useJobs,
  useDrivers,
  useDriverApplications,
  usePendingDocuments,
  useReviewDocument,
  useAdminStats,
} from '@/hooks/useSupabaseData';
import {
  Package,
  Users,
  Truck,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  FileText,
  ArrowRight,
  Eye,
  AlertCircle,
  UserPlus,
  ClipboardCheck,
} from 'lucide-react';

interface AdminStats {
  todaysJobs: number;
  activeDrivers: number;
  totalDrivers: number;
  pendingJobs: number;
  completedToday: number;
  totalRevenue: number;
  todayRevenue: number;
  totalJobs: number;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'delivered':
      return <Badge className="bg-green-500 text-white" data-testid={`badge-status-${status}`}>Delivered</Badge>;
    case 'on_the_way_delivery':
    case 'on_the_way_pickup':
    case 'collected':
      return <Badge className="bg-blue-500 text-white" data-testid={`badge-status-${status}`}>In Progress</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500 text-white" data-testid={`badge-status-${status}`}>Pending</Badge>;
    case 'assigned':
    case 'accepted':
      return <Badge className="bg-purple-500 text-white" data-testid={`badge-status-${status}`}>Assigned</Badge>;
    case 'cancelled':
      return <Badge className="bg-red-500 text-white" data-testid={`badge-status-${status}`}>Cancelled</Badge>;
    default:
      return <Badge data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
};

function StatCard({ title, value, icon: Icon, color, isLoading, href }: { title: string; value: string | number; icon: any; color: string; isLoading?: boolean; href: string }) {
  return (
    <Link href={href}>
      <Card 
        className="cursor-pointer transition-all duration-200 hover-elevate" 
        data-testid={`stat-card-${title.toLowerCase().replace(/\s/g, '-')}`}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className={`h-5 w-5 ${color}`} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">{value}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useAdminStats();

  const { data: jobs, isLoading: jobsLoading } = useJobs({ limit: 10 });

  const { data: drivers } = useDrivers();

  const { data: documents } = usePendingDocuments();

  const { data: applications } = useDriverApplications();

  const reviewDocumentMutation = useReviewDocument();

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '—';
    
    // First check registered drivers
    const driver = drivers?.find(d => d.id === driverId);
    if (driver?.fullName) return driver.fullName;
    if (driver?.vehicleRegistration) return driver.vehicleRegistration;
    
    // Then check driver applications
    const application = applications?.find(a => a.id === driverId);
    if (application?.fullName) return `${application.fullName} (Applicant)`;
    
    // Format the ID for display if not found
    if (driverId.startsWith('application-')) {
      return `Pending Application`;
    }
    
    // Return formatted driver ID
    return driverId.length > 20 ? `${driverId.substring(0, 8)}...` : driverId;
  };

  const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    return `£${num.toFixed(2)}`;
  };

  const pendingDocCount = documents?.filter(d => d.status === 'pending').length || 0;
  const unverifiedDrivers = drivers?.filter(d => !d.isVerified).length || 0;
  const pendingApplications = applications?.filter(a => a.status === 'pending').length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-page-title">Admin Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Overview of your courier operations</p>
        </div>

        {(pendingApplications > 0 || pendingDocCount > 0 || unverifiedDrivers > 0) && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30" data-testid="alert-pending-actions">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">Action Required</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    {pendingApplications > 0 && (
                      <span className="font-semibold">{pendingApplications} new driver application{pendingApplications > 1 ? 's' : ''}</span>
                    )}
                    {pendingApplications > 0 && (pendingDocCount > 0 || unverifiedDrivers > 0) && <span> • </span>}
                    {pendingDocCount > 0 && (
                      <span>{pendingDocCount} document{pendingDocCount > 1 ? 's' : ''} awaiting review</span>
                    )}
                    {pendingDocCount > 0 && unverifiedDrivers > 0 && <span> • </span>}
                    {unverifiedDrivers > 0 && (
                      <span>{unverifiedDrivers} driver{unverifiedDrivers > 1 ? 's' : ''} pending verification</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                {pendingApplications > 0 && (
                  <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" asChild data-testid="button-review-applications">
                    <Link href="/admin/applications">
                      <UserPlus className="mr-1 h-4 w-4" />
                      Review Applications
                    </Link>
                  </Button>
                )}
                {pendingDocCount > 0 && (
                  <Button size="sm" variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-100" asChild data-testid="button-review-docs">
                    <Link href="/admin/documents">
                      <FileText className="mr-1 h-4 w-4" />
                      Review Docs
                    </Link>
                  </Button>
                )}
                {unverifiedDrivers > 0 && (
                  <Button size="sm" variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-100" asChild data-testid="button-review-drivers">
                    <Link href="/admin/drivers?filter=unverified">
                      <Users className="mr-1 h-4 w-4" />
                      Review Drivers
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Today's Jobs"
            value={stats?.todaysJobs || 0}
            icon={Package}
            color="text-blue-500"
            isLoading={statsLoading}
            href="/admin/jobs?filter=today"
          />
          <StatCard
            title="Active Drivers"
            value={`${stats?.activeDrivers || 0}/${stats?.totalDrivers || 0}`}
            icon={Truck}
            color="text-green-500"
            isLoading={statsLoading}
            href="/admin/drivers?filter=active"
          />
          <StatCard
            title="Today's Revenue"
            value={formatPrice(stats?.todayRevenue || 0)}
            icon={TrendingUp}
            color="text-primary"
            isLoading={statsLoading}
            href="/admin/reports/revenue?filter=today"
          />
          <StatCard
            title="Pending Jobs"
            value={stats?.pendingJobs || 0}
            icon={Clock}
            color="text-yellow-500"
            isLoading={statsLoading}
            href="/admin/jobs?filter=pending"
          />
        </div>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Recent Jobs</CardTitle>
                <CardDescription>Latest delivery orders</CardDescription>
              </div>
              <Link href="/admin/jobs">
                <Button variant="outline" size="sm" data-testid="button-view-all-jobs">
                  View All <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : jobs && jobs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.slice(0, 5).map((job) => (
                      <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                        <TableCell className="font-mono text-sm">{job.trackingNumber}</TableCell>
                        <TableCell className="text-sm">
                          {job.pickupPostcode} → {job.deliveryPostcode}
                        </TableCell>
                        <TableCell className="capitalize">{job.vehicleType?.replace('_', ' ')}</TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell className="text-right font-medium">{formatPrice(job.totalPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No jobs yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Pending Documents</CardTitle>
                <Link href="/admin/documents">
                  <Button variant="ghost" size="icon" data-testid="button-view-documents">
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {documents && documents.length > 0 ? (
                  <div className="space-y-4">
                    {documents.slice(0, 3).map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between" data-testid={`doc-${doc.id}`}>
                        <div>
                          <p className="font-medium text-sm">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground capitalize">{doc.type.replace('_', ' ')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-green-500" 
                              data-testid={`button-approve-doc-${doc.id}`}
                              onClick={() => reviewDocumentMutation.mutate({ id: doc.id, status: 'approved', reviewedBy: 'admin' })}
                              disabled={reviewDocumentMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-red-500" 
                              data-testid={`button-reject-doc-${doc.id}`}
                              onClick={() => reviewDocumentMutation.mutate({ id: doc.id, status: 'rejected', reviewedBy: 'admin', reviewNotes: 'Rejected by admin' })}
                              disabled={reviewDocumentMutation.isPending}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                    <p className="text-sm text-muted-foreground">All documents reviewed</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/admin/applications">
                  <Button 
                    variant="outline" 
                    className={`w-full justify-start ${pendingApplications > 0 ? 'border-yellow-500 bg-yellow-50 hover:bg-yellow-100' : ''}`} 
                    data-testid="button-driver-applications"
                  >
                    <ClipboardCheck className={`mr-2 h-4 w-4 ${pendingApplications > 0 ? 'text-yellow-600' : ''}`} />
                    Driver Applications
                    {pendingApplications > 0 && (
                      <Badge className="ml-auto bg-yellow-500 text-white">{pendingApplications}</Badge>
                    )}
                  </Button>
                </Link>
                <Link href="/admin/jobs">
                  <Button variant="outline" className="w-full justify-start" data-testid="button-manage-jobs">
                    <Package className="mr-2 h-4 w-4" />
                    Manage Jobs
                  </Button>
                </Link>
                <Link href="/admin/drivers">
                  <Button variant="outline" className="w-full justify-start" data-testid="button-manage-drivers">
                    <Users className="mr-2 h-4 w-4" />
                    Manage Drivers
                  </Button>
                </Link>
                <Link href="/admin/map">
                  <Button variant="outline" className="w-full justify-start" data-testid="button-live-map">
                    <MapPin className="mr-2 h-4 w-4" />
                    Live Map
                  </Button>
                </Link>
                <Link href="/admin/pricing">
                  <Button variant="outline" className="w-full justify-start" data-testid="button-pricing-settings">
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Pricing Settings
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
