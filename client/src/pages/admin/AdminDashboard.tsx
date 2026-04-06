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
  useCustomers,
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
  Mail,
  Building,
  Activity,
  MessageSquare,
  LayoutDashboard,
} from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';

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
      return (
        <Badge
          className="bg-emerald-500 text-white dark:bg-emerald-600 font-medium text-xs px-2.5"
          data-testid={`badge-status-${status}`}
        >
          Delivered
        </Badge>
      );
    case 'on_the_way_delivery':
    case 'on_the_way_pickup':
    case 'collected':
      return (
        <Badge
          className="bg-sky-500 text-white dark:bg-sky-600 font-medium text-xs px-2.5"
          data-testid={`badge-status-${status}`}
        >
          In Progress
        </Badge>
      );
    case 'pending':
      return (
        <Badge
          className="bg-amber-400 text-amber-900 dark:bg-amber-500 dark:text-white font-medium text-xs px-2.5"
          data-testid={`badge-status-${status}`}
        >
          Pending
        </Badge>
      );
    case 'assigned':
    case 'accepted':
      return (
        <Badge
          className="bg-violet-500 text-white dark:bg-violet-600 font-medium text-xs px-2.5"
          data-testid={`badge-status-${status}`}
        >
          Assigned
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge
          className="bg-rose-500 text-white dark:bg-rose-600 font-medium text-xs px-2.5"
          data-testid={`badge-status-${status}`}
        >
          Cancelled
        </Badge>
      );
    case 'rejected':
      return (
        <Badge
          className="bg-blue-500 text-white dark:bg-blue-600 font-medium text-xs px-2.5"
          data-testid={`badge-status-${status}`}
        >
          Rejected
        </Badge>
      );
    default:
      return (
        <Badge
          variant="secondary"
          className="font-medium text-xs px-2.5"
          data-testid={`badge-status-${status}`}
        >
          {status}
        </Badge>
      );
  }
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  isLoading?: boolean;
  href: string;
  accent: string;
}

function StatCard({ title, value, icon: Icon, iconBg, iconColor, isLoading, href, accent }: StatCardProps) {
  return (
    <Link href={href}>
      <Card
        className={`cursor-pointer transition-all duration-200 hover-elevate overflow-hidden border-t-2 ${accent}`}
        data-testid={`stat-card-${title.toLowerCase().replace(/\s/g, '-')}`}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {title}
              </p>
              {isLoading ? (
                <Skeleton className="h-9 w-24 mt-1" />
              ) : (
                <p className="text-3xl font-bold tabular-nums text-foreground leading-none">
                  {value}
                </p>
              )}
            </div>
            <div className={`flex-shrink-0 h-11 w-11 rounded-xl flex items-center justify-center ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
          </div>
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
  const { data: customers, isLoading: customersLoading } = useCustomers(10);

  const reviewDocumentMutation = useReviewDocument();

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '—';
    const driver = drivers?.find(d => d.id === driverId);
    if (driver?.fullName) return driver.fullName;
    if (driver?.vehicleRegistration) return driver.vehicleRegistration;
    const application = applications?.find(a => a.id === driverId);
    if (application?.fullName) return `${application.fullName} (Applicant)`;
    if (driverId.startsWith('application-')) return 'Pending Application';
    return driverId.length > 20 ? `${driverId.substring(0, 8)}...` : driverId;
  };

  const formatPrice = (price: string | number | undefined | null) => {
    if (price === undefined || price === null) return '£0.00';
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num)) return '£0.00';
    return `£${num.toFixed(2)}`;
  };

  const formatVehicle = (type: string | undefined | null) => {
    if (!type) return '—';
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const pendingDocCount = documents?.filter(d => d.status === 'pending').length || 0;
  const unverifiedDrivers = drivers?.filter(d => !d.isVerified && d.isActive !== false).length || 0;
  const pendingApplications = applications?.filter(a => a.status === 'pending').length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <LayoutDashboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">
                Operations Dashboard
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Live overview of Run Courier operations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-muted-foreground font-medium">Live</span>
          </div>
        </div>

        {/* Action required banner */}
        {(pendingApplications > 0 || pendingDocCount > 0 || unverifiedDrivers > 0) && (
          <Card
            className="border-amber-400/60 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-500/30"
            data-testid="alert-pending-actions"
          >
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                    Action Required
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    {pendingApplications > 0 && (
                      <span className="font-semibold">
                        {pendingApplications} new driver application{pendingApplications > 1 ? 's' : ''}
                      </span>
                    )}
                    {pendingApplications > 0 && (pendingDocCount > 0 || unverifiedDrivers > 0) && <span> · </span>}
                    {pendingDocCount > 0 && (
                      <span>{pendingDocCount} document{pendingDocCount > 1 ? 's' : ''} awaiting review</span>
                    )}
                    {pendingDocCount > 0 && unverifiedDrivers > 0 && <span> · </span>}
                    {unverifiedDrivers > 0 && (
                      <span>{unverifiedDrivers} driver{unverifiedDrivers > 1 ? 's' : ''} pending verification</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                {pendingApplications > 0 && (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    asChild
                    data-testid="button-review-applications"
                  >
                    <Link href="/admin/applications">
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      Review Applications
                    </Link>
                  </Button>
                )}
                {pendingDocCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-500 text-amber-700 dark:text-amber-300"
                    asChild
                    data-testid="button-review-docs"
                  >
                    <Link href="/admin/documents">
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Review Docs
                    </Link>
                  </Button>
                )}
                {unverifiedDrivers > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-500 text-amber-700 dark:text-amber-300"
                    asChild
                    data-testid="button-review-drivers"
                  >
                    <Link href="/admin/drivers?filter=unverified">
                      <Users className="mr-1.5 h-3.5 w-3.5" />
                      Review Drivers
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI metric cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Today's Jobs"
            value={stats?.todaysJobs || 0}
            icon={Package}
            iconBg="bg-blue-50 dark:bg-blue-950/60"
            iconColor="text-blue-600 dark:text-blue-400"
            accent="border-t-blue-500"
            isLoading={statsLoading}
            href="/admin/jobs?filter=today"
          />
          <StatCard
            title="Active Drivers"
            value={`${stats?.activeDrivers || 0}/${stats?.totalDrivers || 0}`}
            icon={Truck}
            iconBg="bg-emerald-50 dark:bg-emerald-950/60"
            iconColor="text-emerald-600 dark:text-emerald-400"
            accent="border-t-emerald-500"
            isLoading={statsLoading}
            href="/admin/drivers?filter=active"
          />
          <StatCard
            title="Today's Revenue"
            value={formatPrice(stats?.todayRevenue || 0)}
            icon={TrendingUp}
            iconBg="bg-primary/10 dark:bg-primary/20"
            iconColor="text-primary"
            accent="border-t-primary"
            isLoading={statsLoading}
            href="/admin/reports/revenue?filter=today"
          />
          <StatCard
            title="Pending Jobs"
            value={stats?.pendingJobs || 0}
            icon={Clock}
            iconBg="bg-amber-50 dark:bg-amber-950/60"
            iconColor="text-amber-600 dark:text-amber-400"
            accent="border-t-amber-400"
            isLoading={statsLoading}
            href="/admin/jobs?filter=pending"
          />
        </div>

        {/* Main content area */}
        <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-3">

          {/* Recent Jobs table — 2/3 width */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center">
                  <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Recent Jobs</CardTitle>
                  <CardDescription className="text-xs">Latest delivery orders</CardDescription>
                </div>
              </div>
              <Link href="/admin/jobs">
                <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-view-all-jobs">
                  View All <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {jobsLoading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-11 w-full" />
                  ))}
                </div>
              ) : jobs && jobs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border/50">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pl-4 py-2.5 w-36">
                        Order ID
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2.5">
                        Route
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2.5 hidden sm:table-cell">
                        Vehicle
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2.5">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right pr-4 py-2.5">
                        Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.slice(0, 5).map((job) => (
                      <TableRow
                        key={job.id}
                        className="hover:bg-muted/40 transition-colors border-b border-border/30 last:border-0"
                        data-testid={`row-job-${job.id}`}
                      >
                        <TableCell className="pl-4 py-3">
                          <span className="font-mono text-xs font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded">
                            {job.trackingNumber}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-1.5 text-xs text-foreground">
                            <span className="font-medium truncate max-w-24 sm:max-w-none">
                              {job.pickupPostcode}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-muted-foreground truncate max-w-24 sm:max-w-none">
                              {job.deliveryPostcode}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground font-medium">
                            {formatVehicle(job.vehicleType)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          {getStatusBadge(job.status)}
                        </TableCell>
                        <TableCell className="text-right pr-4 py-3">
                          <span className="text-sm font-bold text-foreground tabular-nums">
                            {formatPrice(job.totalPrice)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No jobs yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Jobs will appear here once bookings are created.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right column */}
          <div className="space-y-4">

            {/* Recent Customers */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-violet-50 dark:bg-violet-950/60 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Recent Customers</CardTitle>
                    <CardDescription className="text-xs">Latest accounts</CardDescription>
                  </div>
                </div>
                <Link href="/admin/customers">
                  <Button variant="ghost" size="icon" data-testid="button-view-customers">
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-3 px-3 pb-3">
                {customersLoading ? (
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-11 w-full" />
                    ))}
                  </div>
                ) : customers && customers.length > 0 ? (
                  <div className="space-y-1">
                    {customers.slice(0, 5).map((customer) => (
                      <div
                        key={customer.id}
                        className="flex items-center justify-between p-2 rounded-lg hover-elevate"
                        data-testid={`row-customer-${customer.id}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs truncate leading-tight">
                              {customer.fullName || 'Unknown'}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              {customer.companyName ? (
                                <span className="flex items-center gap-1 truncate">
                                  <Building className="h-2.5 w-2.5" />
                                  {customer.companyName}
                                </span>
                              ) : customer.email ? (
                                <span className="flex items-center gap-1 truncate">
                                  <Mail className="h-2.5 w-2.5" />
                                  {customer.email}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        {customer.userType && (
                          <Badge
                            variant={customer.userType === 'business' ? 'default' : 'secondary'}
                            className="flex-shrink-0 text-xs"
                          >
                            {customer.userType}
                          </Badge>
                        )}
                      </div>
                    ))}
                    <Link href="/admin/customers">
                      <Button variant="ghost" size="sm" className="w-full mt-1 h-8 text-xs" data-testid="button-view-all-customers">
                        View All Customers <ArrowRight className="ml-1.5 h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="h-10 w-10 rounded-xl bg-muted/60 flex items-center justify-center mb-2.5">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-medium text-foreground">No customers yet</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Customer accounts will appear here.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center">
                    <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Pending Documents</CardTitle>
                </div>
                <Link href="/admin/documents">
                  <Button variant="ghost" size="icon" data-testid="button-view-documents">
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-3 px-3 pb-3">
                {documents && documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.slice(0, 3).map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                        data-testid={`doc-${doc.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs truncate">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">
                            {doc.type.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
                            data-testid={`button-approve-doc-${doc.id}`}
                            onClick={() =>
                              reviewDocumentMutation.mutate({
                                id: doc.id,
                                status: 'approved',
                                reviewedBy: 'admin',
                              })
                            }
                            disabled={reviewDocumentMutation.isPending}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-rose-500 dark:text-rose-400"
                            data-testid={`button-reject-doc-${doc.id}`}
                            onClick={() =>
                              reviewDocumentMutation.mutate({
                                id: doc.id,
                                status: 'rejected',
                                reviewedBy: 'admin',
                                reviewNotes: 'Rejected by admin',
                              })
                            }
                            disabled={reviewDocumentMutation.isPending}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-2.5">
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    </div>
                    <p className="text-xs font-semibold text-foreground">All documents reviewed</p>
                    <p className="text-xs text-muted-foreground mt-0.5">No documents pending review.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-muted/80 flex items-center justify-center">
                    <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-3 px-3 pb-3 space-y-1.5">
                <Link href="/admin/applications">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`w-full justify-start h-9 text-xs font-medium ${
                      pendingApplications > 0
                        ? 'border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-500/30'
                        : ''
                    }`}
                    data-testid="button-driver-applications"
                  >
                    <ClipboardCheck
                      className={`mr-2 h-3.5 w-3.5 ${pendingApplications > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}
                    />
                    Driver Applications
                    {pendingApplications > 0 && (
                      <Badge className="ml-auto bg-amber-500 text-white text-xs h-5">
                        {pendingApplications}
                      </Badge>
                    )}
                  </Button>
                </Link>
                <Link href="/admin/jobs">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start h-9 text-xs font-medium"
                    data-testid="button-manage-jobs"
                  >
                    <Package className="mr-2 h-3.5 w-3.5" />
                    Manage Jobs
                  </Button>
                </Link>
                <Link href="/admin/drivers">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start h-9 text-xs font-medium"
                    data-testid="button-manage-drivers"
                  >
                    <Users className="mr-2 h-3.5 w-3.5" />
                    Manage Drivers
                  </Button>
                </Link>
                <Link href="/admin/map">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start h-9 text-xs font-medium"
                    data-testid="button-live-map"
                  >
                    <MapPin className="mr-2 h-3.5 w-3.5" />
                    Live Map
                  </Button>
                </Link>
                <Link href="/admin/pricing">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start h-9 text-xs font-medium"
                    data-testid="button-pricing-settings"
                  >
                    <TrendingUp className="mr-2 h-3.5 w-3.5" />
                    Pricing Settings
                  </Button>
                </Link>
                <a
                  href="https://wa.me/447482527001"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-whatsapp"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start h-9 text-xs font-medium border-[#25D366]/50 text-[#25D366] dark:border-[#25D366]/40 dark:text-[#25D366]"
                  >
                    <SiWhatsapp className="mr-2 h-3.5 w-3.5" />
                    WhatsApp Support
                  </Button>
                </a>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
