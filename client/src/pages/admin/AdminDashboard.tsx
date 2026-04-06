import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
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
  AlertCircle,
  UserPlus,
  ClipboardCheck,
  MoreHorizontal,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Circle,
  Bell,
  RefreshCw,
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

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  delivered:            { label: 'Delivered',   dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  on_the_way_delivery:  { label: 'En Route',    dot: 'bg-sky-500',     text: 'text-sky-600 dark:text-sky-400' },
  on_the_way_pickup:    { label: 'To Pickup',   dot: 'bg-sky-500',     text: 'text-sky-600 dark:text-sky-400' },
  collected:            { label: 'Collected',   dot: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400' },
  pending:              { label: 'Pending',      dot: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400' },
  assigned:             { label: 'Assigned',    dot: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-400' },
  accepted:             { label: 'Accepted',    dot: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-400' },
  cancelled:            { label: 'Cancelled',   dot: 'bg-rose-500',    text: 'text-rose-500 dark:text-rose-400' },
  rejected:             { label: 'Rejected',    dot: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400' },
};

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`badge-status-${status}`}>
        <Circle className="h-2 w-2 fill-muted-foreground text-muted-foreground" />
        {status}
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.text}`} data-testid={`badge-status-${status}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const JOBS_PER_PAGE = 8;

export default function AdminDashboard() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: jobs, isLoading: jobsLoading } = useJobs({ limit: 50 });
  const { data: drivers } = useDrivers();
  const { data: documents } = usePendingDocuments();
  const { data: applications } = useDriverApplications();
  const { data: customers } = useCustomers(10);

  const reviewDocumentMutation = useReviewDocument();

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '—';
    const driver = drivers?.find(d => d.id === driverId);
    if (driver?.fullName) return driver.fullName;
    if (driver?.vehicleRegistration) return driver.vehicleRegistration;
    const application = applications?.find(a => a.id === driverId);
    if (application?.fullName) return application.fullName;
    if (driverId.startsWith('application-')) return 'Pending';
    return driverId.substring(0, 8);
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

  const formatTime = (dt: string | Date | undefined | null) => {
    if (!dt) return '—';
    const d = new Date(dt as string);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter(job => {
      const matchStatus = statusFilter === 'all' || job.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        job.trackingNumber?.toLowerCase().includes(q) ||
        job.pickupPostcode?.toLowerCase().includes(q) ||
        job.deliveryPostcode?.toLowerCase().includes(q) ||
        getDriverName(job.driverId ?? null).toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [jobs, statusFilter, search, drivers, applications]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const pagedJobs = filteredJobs.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE);

  const pendingDocCount = documents?.filter(d => d.status === 'pending').length || 0;
  const pendingApplications = applications?.filter(a => a.status === 'pending').length || 0;
  const unverifiedDrivers = drivers?.filter(d => !d.isVerified && d.isActive !== false).length || 0;

  // Driver activity breakdown
  const activeDrivers = drivers?.filter(d => d.isActive !== false) || [];
  const deliveringDriverIds = new Set(
    jobs?.filter(j => ['on_the_way_delivery', 'on_the_way_pickup', 'collected', 'assigned', 'accepted'].includes(j.status) && j.driverId)
      .map(j => j.driverId!)
  );
  const deliveringDrivers = activeDrivers.filter(d => deliveringDriverIds.has(d.id));
  const availableDrivers = activeDrivers.filter(d => !deliveringDriverIds.has(d.id));
  const inactiveDrivers = drivers?.filter(d => d.isActive === false) || [];

  const alertItems = [
    pendingApplications > 0 && { label: `${pendingApplications} application${pendingApplications > 1 ? 's' : ''} awaiting review`, href: '/admin/applications', icon: ClipboardCheck, color: 'text-amber-500' },
    pendingDocCount > 0 && { label: `${pendingDocCount} document${pendingDocCount > 1 ? 's' : ''} pending review`, href: '/admin/documents', icon: FileText, color: 'text-amber-500' },
    unverifiedDrivers > 0 && { label: `${unverifiedDrivers} driver${unverifiedDrivers > 1 ? 's' : ''} unverified`, href: '/admin/drivers?filter=unverified', icon: Users, color: 'text-rose-500' },
    (stats?.pendingJobs || 0) > 0 && { label: `${stats?.pendingJobs} job${(stats?.pendingJobs || 0) > 1 ? 's' : ''} unassigned`, href: '/admin/jobs?filter=pending', icon: Package, color: 'text-blue-500' },
  ].filter(Boolean) as { label: string; href: string; icon: React.ElementType; color: string }[];

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full min-h-0">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between gap-3 px-1 pb-4 border-b border-border/50">
          <h1 className="text-base font-semibold tracking-tight whitespace-nowrap" data-testid="text-page-title">
            Dashboard
          </h1>
          <div className="flex-1 max-w-sm hidden sm:block">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search jobs, drivers, postcodes…"
                className="pl-8 h-8 text-xs"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                data-testid="input-global-search"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {alertItems.length > 0 && (
              <div className="relative" data-testid="alert-pending-actions">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {alertItems.length}
                </span>
              </div>
            )}
            <Link href="/admin/jobs/create">
              <Button size="sm" className="h-8 text-xs gap-1.5" data-testid="button-new-job">
                <Plus className="h-3.5 w-3.5" />
                New Job
              </Button>
            </Link>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 border-b border-border/50 text-sm">
          {statsLoading ? (
            [1,2,3,4].map(i => <Skeleton key={i} className="h-5 w-28" />)
          ) : (
            <>
              <div className="flex items-center gap-2" data-testid="stat-card-today's-jobs">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Jobs Today</span>
                <span className="text-base font-bold tabular-nums">{stats?.todaysJobs || 0}</span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-2" data-testid="stat-card-active-drivers">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Active Drivers</span>
                <span className="text-base font-bold tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">{stats?.activeDrivers || 0}</span>
                  <span className="text-muted-foreground font-normal text-sm">/{stats?.totalDrivers || 0}</span>
                </span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-2" data-testid="stat-card-today's-revenue">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Revenue Today</span>
                <span className="text-base font-bold tabular-nums">{formatPrice(stats?.todayRevenue || 0)}</span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-2" data-testid="stat-card-pending-jobs">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pending</span>
                <span className={`text-base font-bold tabular-nums ${(stats?.pendingJobs || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                  {stats?.pendingJobs || 0}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Main split layout ── */}
        <div className="flex gap-4 mt-4 min-h-0 flex-1">

          {/* Jobs table — 70% */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="sm:hidden flex-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search…"
                    className="pl-8 h-8 text-xs"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    data-testid="input-search-mobile"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-36" data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="on_the_way_pickup">To Pickup</SelectItem>
                  <SelectItem value="collected">Collected</SelectItem>
                  <SelectItem value="on_the_way_delivery">En Route</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">
                {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''}
              </span>
              <Link href="/admin/jobs">
                <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-view-all-jobs">
                  View All <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>

            {/* Table */}
            <div className="border border-border/60 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/30 border-b border-border/60">
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pl-4 py-2.5 whitespace-nowrap">
                        Order ID
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap">
                        Route
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap hidden lg:table-cell">
                        Driver
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap hidden md:table-cell">
                        Vehicle
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap">
                        Status
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap hidden sm:table-cell">
                        Time
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right py-2.5 whitespace-nowrap">
                        Amount
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right pr-3 py-2.5 w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobsLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i} className="border-b border-border/30">
                          {[1,2,3,4,5,6,7,8].map(j => (
                            <TableCell key={j} className="py-2.5">
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : pagedJobs.length > 0 ? (
                      pagedJobs.map((job) => (
                        <TableRow
                          key={job.id}
                          className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
                          data-testid={`row-job-${job.id}`}
                        >
                          <TableCell className="pl-4 py-2.5">
                            <span className="font-mono text-[11px] font-semibold text-foreground">
                              {job.trackingNumber}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 max-w-[160px]">
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-medium truncate" title={job.pickupPostcode}>
                                {job.pickupPostcode}
                              </span>
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground truncate" title={job.deliveryPostcode}>
                                {job.deliveryPostcode}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 hidden lg:table-cell">
                            <span className="text-xs text-muted-foreground truncate max-w-24 block">
                              {getDriverName(job.driverId ?? null)}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 hidden md:table-cell">
                            <span className="text-xs text-muted-foreground">
                              {formatVehicle(job.vehicleType)}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <StatusDot status={job.status} />
                          </TableCell>
                          <TableCell className="py-2.5 hidden sm:table-cell">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatTime((job as any).createdAt)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right py-2.5">
                            <span className="text-xs font-bold tabular-nums">
                              {formatPrice(job.totalPrice)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right pr-3 py-2.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  data-testid={`button-job-actions-${job.id}`}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs">
                                <DropdownMenuItem onClick={() => window.location.href = '/admin/jobs'}>
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.location.href = '/admin/jobs'}>
                                  Assign Driver
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="py-14 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Package className="h-8 w-8 text-muted-foreground/50" />
                            <p className="text-sm font-medium text-muted-foreground">No jobs found</p>
                            {(statusFilter !== 'all' || search) && (
                              <button
                                className="text-xs text-primary underline-offset-2 hover:underline"
                                onClick={() => { setStatusFilter('all'); setSearch(''); }}
                              >
                                Clear filters
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing {(page - 1) * JOBS_PER_PAGE + 1}–{Math.min(page * JOBS_PER_PAGE, filteredJobs.length)} of {filteredJobs.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    data-testid="button-page-prev"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="px-2 font-medium">{page} / {totalPages}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    data-testid="button-page-next"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right activity panel — 30% ── */}
          <div className="hidden lg:flex flex-col gap-4 w-64 xl:w-72 flex-shrink-0">

            {/* Driver Activity */}
            <div className="border border-border/60 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-muted/20">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Driver Activity
                </span>
                <Link href="/admin/drivers">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                    View all
                  </Button>
                </Link>
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-3 divide-x divide-border/40 border-b border-border/50">
                <div className="flex flex-col items-center py-3 gap-0.5">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">
                    {deliveringDrivers.length}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Delivering</span>
                </div>
                <div className="flex flex-col items-center py-3 gap-0.5">
                  <span className="text-lg font-bold tabular-nums leading-tight">
                    {availableDrivers.length}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Available</span>
                </div>
                <div className="flex flex-col items-center py-3 gap-0.5">
                  <span className="text-lg font-bold text-muted-foreground/60 tabular-nums leading-tight">
                    {inactiveDrivers.length}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Offline</span>
                </div>
              </div>

              {/* Driver list */}
              <div className="divide-y divide-border/30 max-h-44 overflow-y-auto">
                {activeDrivers.slice(0, 8).map(driver => {
                  const delivering = deliveringDriverIds.has(driver.id);
                  return (
                    <div key={driver.id} className="flex items-center gap-2.5 px-3 py-2">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${delivering ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                      <span className="text-xs text-foreground truncate flex-1">
                        {driver.fullName || driver.vehicleRegistration || 'Driver'}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {delivering ? 'Active' : 'Avail.'}
                      </span>
                    </div>
                  );
                })}
                {activeDrivers.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-muted-foreground">No active drivers</p>
                  </div>
                )}
              </div>
            </div>

            {/* Alerts */}
            <div className="border border-border/60 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Alerts
                  </span>
                  {alertItems.length > 0 && (
                    <span className="h-4 w-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {alertItems.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border/30">
                {alertItems.length > 0 ? alertItems.map((alert, i) => (
                  <Link href={alert.href} key={i}>
                    <div className="flex items-start gap-2.5 px-3 py-2.5 hover-elevate transition-colors cursor-pointer" data-testid={`alert-item-${i}`}>
                      <alert.icon className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${alert.color}`} />
                      <span className="text-xs text-foreground leading-snug">{alert.label}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0 mt-0.5" />
                    </div>
                  </Link>
                )) : (
                  <div className="flex flex-col items-center py-5 gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <p className="text-xs text-muted-foreground">All clear</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="border border-border/60 rounded-md overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border/50 bg-muted/20">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Actions
                </span>
              </div>
              <div className="p-2 space-y-1">
                <Link href="/admin/jobs/create">
                  <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" data-testid="button-create-job">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Create Job
                  </Button>
                </Link>
                <Link href="/admin/jobs?filter=pending">
                  <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" data-testid="button-assign-driver">
                    <Truck className="mr-2 h-3.5 w-3.5" />
                    Assign Driver
                  </Button>
                </Link>
                <Link href="/admin/applications">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`w-full justify-start h-8 text-xs ${pendingApplications > 0 ? 'border-amber-400/60' : ''}`}
                    data-testid="button-driver-applications"
                  >
                    <ClipboardCheck className={`mr-2 h-3.5 w-3.5 ${pendingApplications > 0 ? 'text-amber-500' : ''}`} />
                    Applications
                    {pendingApplications > 0 && (
                      <span className="ml-auto text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        {pendingApplications}
                      </span>
                    )}
                  </Button>
                </Link>
                <Link href="/admin/map">
                  <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" data-testid="button-live-map">
                    <MapPin className="mr-2 h-3.5 w-3.5" />
                    Live Map
                  </Button>
                </Link>
                <Link href="/admin/documents">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`w-full justify-start h-8 text-xs ${pendingDocCount > 0 ? 'border-amber-400/60' : ''}`}
                    data-testid="button-review-docs"
                  >
                    <FileText className={`mr-2 h-3.5 w-3.5 ${pendingDocCount > 0 ? 'text-amber-500' : ''}`} />
                    Documents
                    {pendingDocCount > 0 && (
                      <span className="ml-auto text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        {pendingDocCount}
                      </span>
                    )}
                  </Button>
                </Link>
                <a href="https://wa.me/447482527001" target="_blank" rel="noopener noreferrer" data-testid="button-whatsapp">
                  <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs border-[#25D366]/40 text-[#25D366] dark:text-[#25D366]">
                    <SiWhatsapp className="mr-2 h-3.5 w-3.5" />
                    WhatsApp Support
                  </Button>
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
