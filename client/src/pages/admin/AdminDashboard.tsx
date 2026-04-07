import { useState, useMemo } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
  Eye,
  AlertCircle,
  UserPlus,
  ClipboardCheck,
  Mail,
  Building,
  MoreHorizontal,
  PoundSterling,
  BarChart3,
  Minus,
  Plus,
  Activity,
} from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';

// ─── helpers ──────────────────────────────────────────────────────────────────
const toNum = (v: string | number | undefined | null): number => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
};

const fmt = (v: number) => `£${v.toFixed(2)}`;

const getWeekBounds = (offset = 0) => {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Monday=0
  const mon = new Date(now);
  mon.setDate(now.getDate() - dow + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
};

const weekLabel = (offset: number) => {
  const { start, end } = getWeekBounds(offset);
  const fmt2 = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt2(start)} – ${fmt2(end)}`;
};

const formatVehicle = (v: string | undefined | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';

const formatTime = (dt: string | Date | undefined | null) => {
  if (!dt) return '—';
  const d = new Date(dt as string);
  if (isNaN(d.getTime())) return '—';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// ─── status badges ────────────────────────────────────────────────────────────
const getStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    delivered:            'bg-emerald-500 text-white',
    on_the_way_delivery:  'bg-sky-500 text-white',
    on_the_way_pickup:    'bg-sky-500 text-white',
    collected:            'bg-blue-500 text-white',
    pending:              'bg-amber-400 text-amber-900',
    assigned:             'bg-violet-500 text-white',
    accepted:             'bg-violet-500 text-white',
    cancelled:            'bg-rose-500 text-white',
    rejected:             'bg-blue-500 text-white',
  };
  const labels: Record<string, string> = {
    delivered: 'Delivered', on_the_way_delivery: 'En Route',
    on_the_way_pickup: 'To Pickup', collected: 'Collected',
    pending: 'Pending', assigned: 'Assigned', accepted: 'Accepted',
    cancelled: 'Cancelled', rejected: 'Rejected',
  };
  return (
    <Badge
      className={`font-medium text-[11px] px-2 py-0.5 ${map[status] || 'bg-muted text-muted-foreground'}`}
      data-testid={`badge-status-${status}`}
    >
      {labels[status] ?? status}
    </Badge>
  );
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  accent: string;
  isLoading?: boolean;
  href: string;
}
function KpiCard({ title, value, icon: Icon, iconBg, iconColor, accent, isLoading, href }: KpiCardProps) {
  return (
    <Link href={href}>
      <Card className={`cursor-pointer hover-elevate overflow-hidden border-t-2 ${accent}`} data-testid={`stat-card-${title.toLowerCase().replace(/\s/g, '-')}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
              {isLoading ? <Skeleton className="h-8 w-24" /> : (
                <p className="text-2xl font-bold tabular-nums">{value}</p>
              )}
            </div>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── financial summary card ───────────────────────────────────────────────────
interface FinCardProps { title: string; value: number; icon: React.ElementType; iconBg: string; iconColor: string; accent: string; isPositive?: boolean; isLoading?: boolean }
function FinCard({ title, value, icon: Icon, iconBg, iconColor, accent, isPositive, isLoading }: FinCardProps) {
  return (
    <Card className={`overflow-hidden border-t-2 ${accent}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
            {isLoading ? <Skeleton className="h-8 w-28" /> : (
              <p className={`text-2xl font-bold tabular-nums ${isPositive != null ? (isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500') : ''}`}>
                {fmt(value)}
              </p>
            )}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: jobs,  isLoading: jobsLoading }  = useJobs({ limit: 200 });
  const { data: drivers }        = useDrivers();
  const { data: documents }      = usePendingDocuments();
  const { data: applications }   = useDriverApplications();
  const { data: customers,
          isLoading: custLoading }= useCustomers(10);

  const reviewMutation = useReviewDocument();

  const getDriverName = (id: string | null) => {
    if (!id) return '—';
    const d = drivers?.find(x => x.id === id);
    if (d?.fullName) return d.fullName;
    if (d?.vehicleRegistration) return d.vehicleRegistration;
    const a = applications?.find(x => x.id === id);
    if (a?.fullName) return a.fullName;
    return id.startsWith('application-') ? 'Pending' : id.substring(0, 8);
  };

  // ── weekly financial calculations ──────────────────────────────────────────
  const weeklyStats = useMemo(() => {
    if (!jobs) return null;
    const calc = (offset: number) => {
      const { start, end } = getWeekBounds(offset);
      const weekJobs = jobs.filter(j => {
        const d = new Date((j as any).createdAt);
        return !isNaN(d.getTime()) && d >= start && d <= end && j.status === 'delivered';
      });
      const revenue = weekJobs.reduce((s, j) => s + toNum(j.totalPrice), 0);
      const payouts = weekJobs.reduce((s, j) => s + toNum((j as any).driverPrice), 0);
      return { revenue, payouts, profit: revenue - payouts };
    };
    return { current: calc(0), prev: calc(-1) };
  }, [jobs]);

  const pendingDocCount    = documents?.filter(d => d.status === 'pending').length || 0;
  const unverifiedDrivers  = drivers?.filter(d => !d.isVerified && d.isActive !== false).length || 0;
  const pendingApplications = applications?.filter(a => a.status === 'pending').length || 0;

  const finLoading = jobsLoading;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">

        {/* page header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Activity className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight" data-testid="text-page-title">Operations Dashboard</h1>
              <p className="text-xs text-muted-foreground">Run Courier — Live overview</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-muted-foreground font-medium">Live</span>
          </div>
        </div>

        {/* action-required alert */}
        {(pendingApplications > 0 || pendingDocCount > 0 || unverifiedDrivers > 0) && (
          <Card className="border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/20" data-testid="alert-pending-actions">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">Action Required</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    {[
                      pendingApplications > 0 && `${pendingApplications} driver application${pendingApplications>1?'s':''}`,
                      pendingDocCount > 0 && `${pendingDocCount} document${pendingDocCount>1?'s':''} pending review`,
                      unverifiedDrivers > 0 && `${unverifiedDrivers} driver${unverifiedDrivers>1?'s':''} unverified`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap flex-shrink-0">
                {pendingApplications > 0 && (
                  <Button size="sm" className="bg-amber-600 text-white h-8 text-xs" asChild data-testid="button-review-applications">
                    <Link href="/admin/applications"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Applications</Link>
                  </Button>
                )}
                {pendingDocCount > 0 && (
                  <Button size="sm" variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 h-8 text-xs" asChild data-testid="button-review-docs">
                    <Link href="/admin/documents"><FileText className="mr-1.5 h-3.5 w-3.5" />Review Docs</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── KPI CARDS ── */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Today's Jobs"    value={stats?.todaysJobs || 0}               icon={Package}    iconBg="bg-blue-50 dark:bg-blue-950/50"   iconColor="text-blue-600 dark:text-blue-400"   accent="border-t-blue-500"    isLoading={statsLoading} href="/admin/jobs?filter=today" />
          <KpiCard title="Active Drivers"  value={`${stats?.activeDrivers||0}/${stats?.totalDrivers||0}`} icon={Truck} iconBg="bg-emerald-50 dark:bg-emerald-950/50" iconColor="text-emerald-600 dark:text-emerald-400" accent="border-t-emerald-500" isLoading={statsLoading} href="/admin/drivers?filter=active" />
          <KpiCard title="Today's Revenue" value={fmt(toNum(stats?.todayRevenue))}       icon={TrendingUp} iconBg="bg-primary/10"                         iconColor="text-primary"                              accent="border-t-primary"     isLoading={statsLoading} href="/admin/jobs?filter=today" />
          <KpiCard title="Pending Jobs"    value={stats?.pendingJobs || 0}               icon={Clock}      iconBg="bg-amber-50 dark:bg-amber-950/50"  iconColor="text-amber-600 dark:text-amber-400" accent="border-t-amber-400"   isLoading={statsLoading} href="/admin/jobs?filter=pending" />
        </div>

        {/* ── FINANCIAL SUMMARY ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">This Week's Financial Summary</h2>
            <span className="text-xs text-muted-foreground ml-1">({weekLabel(0)})</span>
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <FinCard
              title="Revenue This Week"
              value={weeklyStats?.current.revenue ?? 0}
              icon={PoundSterling}
              iconBg="bg-blue-50 dark:bg-blue-950/50"
              iconColor="text-blue-600 dark:text-blue-400"
              accent="border-t-blue-500"
              isLoading={finLoading}
            />
            <FinCard
              title="Driver Payouts This Week"
              value={weeklyStats?.current.payouts ?? 0}
              icon={Truck}
              iconBg="bg-violet-50 dark:bg-violet-950/50"
              iconColor="text-violet-600 dark:text-violet-400"
              accent="border-t-violet-500"
              isLoading={finLoading}
            />
            <FinCard
              title="Net Profit This Week"
              value={weeklyStats?.current.profit ?? 0}
              icon={TrendingUp}
              iconBg="bg-emerald-50 dark:bg-emerald-950/50"
              iconColor="text-emerald-600 dark:text-emerald-400"
              accent="border-t-emerald-500"
              isLoading={finLoading}
              isPositive={(weeklyStats?.current.profit ?? 0) >= 0}
            />
          </div>
        </div>

        {/* ── MAIN CONTENT: Table + Right Column ── */}
        <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-3">

          {/* Recent Jobs + Weekly Breakdown — 2/3 */}
          <div className="lg:col-span-2 space-y-4">

            {/* Recent Jobs table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                    <Package className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Recent Jobs</CardTitle>
                    <CardDescription className="text-xs">Latest delivery orders</CardDescription>
                  </div>
                </div>
                <Link href="/admin/jobs">
                  <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-view-all-jobs">
                    View All <ArrowRight className="ml-1.5 h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {jobsLoading ? (
                  <div className="space-y-0">
                    {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-11 w-full rounded-none" />)}
                  </div>
                ) : jobs && jobs.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-muted/20 border-b border-border/40">
                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pl-4 py-2.5 whitespace-nowrap">Order ID</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap">Route</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap hidden md:table-cell">Vehicle</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap">Status</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap hidden sm:table-cell">Time</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right pr-4 py-2.5 whitespace-nowrap">Amount</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.slice(0, 8).map(job => (
                        <TableRow key={job.id} className="border-b border-border/25 last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-job-${job.id}`}>
                          <TableCell className="pl-4 py-2.5">
                            <span className="font-mono text-[11px] font-semibold bg-muted/50 px-1.5 py-0.5 rounded">
                              {job.trackingNumber}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 max-w-[140px]">
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-medium truncate">{job.pickupPostcode}</span>
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground truncate">{job.deliveryPostcode}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 hidden md:table-cell">
                            <span className="text-xs text-muted-foreground">{formatVehicle(job.vehicleType)}</span>
                          </TableCell>
                          <TableCell className="py-2.5">{getStatusBadge(job.status)}</TableCell>
                          <TableCell className="py-2.5 hidden sm:table-cell">
                            <span className="text-[11px] text-muted-foreground tabular-nums">{formatTime((job as any).createdAt)}</span>
                          </TableCell>
                          <TableCell className="text-right pr-2 py-2.5">
                            <span className="text-sm font-bold tabular-nums">{fmt(toNum(job.totalPrice))}</span>
                          </TableCell>
                          <TableCell className="pr-2 py-2.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-6 w-6" data-testid={`button-job-actions-${job.id}`}>
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs">
                                <DropdownMenuItem onClick={() => window.location.href='/admin/jobs'}>View Details</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.location.href='/admin/jobs'}>Assign Driver</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => window.location.href='/admin/map'}>View on Map</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-11 w-11 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No jobs yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Jobs will appear here once bookings are made.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Weekly Profit Breakdown */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
                    <BarChart3 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Weekly Profit Breakdown</CardTitle>
                    <CardDescription className="text-xs">Revenue, payouts and net profit by week</CardDescription>
                  </div>
                </div>
                <Link href="/admin/invoices">
                  <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-view-invoices">
                    Invoices <ArrowRight className="ml-1.5 h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/20 border-b border-border/40">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pl-4 py-2.5">Week</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-2.5 text-right">Revenue</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-2.5 text-right hidden sm:table-cell">Driver Payouts</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pr-4 py-2.5 text-right">Net Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finLoading ? (
                      [1,2].map(i => (
                        <TableRow key={i} className="border-b border-border/25">
                          {[1,2,3,4].map(j => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : (
                      <>
                        {/* Current week */}
                        <TableRow className="border-b border-border/25 hover:bg-muted/20 bg-primary/[0.02]">
                          <TableCell className="pl-4 py-3">
                            <div>
                              <span className="text-xs font-semibold">{weekLabel(0)}</span>
                              <Badge className="ml-2 text-[9px] bg-primary/10 text-primary border-primary/20 font-medium">Current</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <span className="text-sm font-bold tabular-nums">{fmt(weeklyStats?.current.revenue ?? 0)}</span>
                          </TableCell>
                          <TableCell className="py-3 text-right hidden sm:table-cell">
                            <span className="text-sm tabular-nums text-muted-foreground">{fmt(weeklyStats?.current.payouts ?? 0)}</span>
                          </TableCell>
                          <TableCell className="pr-4 py-3 text-right">
                            <span className={`text-sm font-bold tabular-nums ${(weeklyStats?.current.profit??0)>=0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                              {fmt(weeklyStats?.current.profit ?? 0)}
                            </span>
                          </TableCell>
                        </TableRow>
                        {/* Previous week */}
                        <TableRow className="border-b border-border/25 last:border-0 hover:bg-muted/20">
                          <TableCell className="pl-4 py-3">
                            <span className="text-xs font-medium text-muted-foreground">{weekLabel(-1)}</span>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <span className="text-sm tabular-nums text-muted-foreground">{fmt(weeklyStats?.prev.revenue ?? 0)}</span>
                          </TableCell>
                          <TableCell className="py-3 text-right hidden sm:table-cell">
                            <span className="text-sm tabular-nums text-muted-foreground">{fmt(weeklyStats?.prev.payouts ?? 0)}</span>
                          </TableCell>
                          <TableCell className="pr-4 py-3 text-right">
                            <span className={`text-sm tabular-nums font-medium ${(weeklyStats?.prev.profit??0)>=0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                              {fmt(weeklyStats?.prev.profit ?? 0)}
                            </span>
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT COLUMN — 1/3 ── */}
          <div className="space-y-4">

            {/* Recent Customers */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Recent Customers</CardTitle>
                    <CardDescription className="text-xs">Latest accounts</CardDescription>
                  </div>
                </div>
                <Link href="/admin/customers">
                  <Button variant="ghost" size="icon" data-testid="button-view-customers"><Eye className="h-4 w-4" /></Button>
                </Link>
              </CardHeader>
              <CardContent className="px-3 pt-3 pb-3">
                {custLoading ? (
                  <div className="space-y-2.5">{[1,2,3].map(i=><Skeleton key={i} className="h-10 w-full"/>)}</div>
                ) : customers && customers.length > 0 ? (
                  <div className="space-y-0.5">
                    {customers.slice(0,5).map(c => (
                      <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover-elevate" data-testid={`row-customer-${c.id}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs truncate">{c.fullName || 'Unknown'}</p>
                            <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                              {c.companyName ? <><Building className="h-2.5 w-2.5"/>{c.companyName}</> : c.email ? <><Mail className="h-2.5 w-2.5"/>{c.email}</> : null}
                            </p>
                          </div>
                        </div>
                        {c.userType && (
                          <Badge variant={c.userType==='business'?'default':'secondary'} className="text-[10px] flex-shrink-0">{c.userType}</Badge>
                        )}
                      </div>
                    ))}
                    <Link href="/admin/customers">
                      <Button variant="ghost" size="sm" className="w-full mt-1 h-8 text-xs" data-testid="button-view-all-customers">
                        View All <ArrowRight className="ml-1.5 h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="h-9 w-9 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                      <Users className="h-4.5 w-4.5 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-medium">No customers yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
                    <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Pending Documents</CardTitle>
                </div>
                <Link href="/admin/documents">
                  <Button variant="ghost" size="icon" data-testid="button-view-documents"><Eye className="h-4 w-4" /></Button>
                </Link>
              </CardHeader>
              <CardContent className="px-3 pt-3 pb-3">
                {documents && documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.slice(0,3).map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30" data-testid={`doc-${doc.id}`}>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs truncate">{doc.fileName}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{doc.type.replace(/_/g,' ')}</p>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" data-testid={`button-approve-doc-${doc.id}`}
                            onClick={() => reviewMutation.mutate({id:doc.id,status:'approved',reviewedBy:'admin'})} disabled={reviewMutation.isPending}>
                            <CheckCircle className="h-3.5 w-3.5"/>
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" data-testid={`button-reject-doc-${doc.id}`}
                            onClick={() => reviewMutation.mutate({id:doc.id,status:'rejected',reviewedBy:'admin',reviewNotes:'Rejected by admin'})} disabled={reviewMutation.isPending}>
                            <XCircle className="h-3.5 w-3.5"/>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-5 text-center">
                    <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-2">
                      <CheckCircle className="h-4.5 w-4.5 text-emerald-500"/>
                    </div>
                    <p className="text-xs font-semibold">All documents reviewed</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">No documents pending.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center">
                    <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-3 pt-3 pb-3 space-y-1.5">
                <Link href="/admin/applications">
                  <Button variant="outline" size="sm" className={`w-full justify-start h-9 text-xs font-medium ${pendingApplications>0?'border-amber-400/50':''}`} data-testid="button-driver-applications">
                    <ClipboardCheck className={`mr-2 h-3.5 w-3.5 ${pendingApplications>0?'text-amber-500':''}`}/>
                    Driver Applications
                    {pendingApplications>0 && <Badge className="ml-auto bg-amber-500 text-white text-[10px] h-4">{pendingApplications}</Badge>}
                  </Button>
                </Link>
                <Link href="/admin/jobs">
                  <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs font-medium" data-testid="button-manage-jobs">
                    <Package className="mr-2 h-3.5 w-3.5"/>Manage Jobs
                  </Button>
                </Link>
                <Link href="/admin/drivers">
                  <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs font-medium" data-testid="button-manage-drivers">
                    <Users className="mr-2 h-3.5 w-3.5"/>Manage Drivers
                  </Button>
                </Link>
                <Link href="/admin/map">
                  <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs font-medium" data-testid="button-live-map">
                    <MapPin className="mr-2 h-3.5 w-3.5"/>Live Map
                  </Button>
                </Link>
                <Link href="/admin/pricing">
                  <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs font-medium" data-testid="button-pricing-settings">
                    <TrendingUp className="mr-2 h-3.5 w-3.5"/>Pricing Settings
                  </Button>
                </Link>
                <a href="https://wa.me/447482527001" target="_blank" rel="noopener noreferrer" data-testid="button-whatsapp">
                  <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs font-medium border-[#25D366]/40 text-[#25D366] dark:text-[#25D366]">
                    <SiWhatsapp className="mr-2 h-3.5 w-3.5"/>WhatsApp Support
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
