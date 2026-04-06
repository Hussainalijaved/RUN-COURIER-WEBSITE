import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
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
  ClipboardCheck,
  MoreHorizontal,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Bell,
  Activity,
  Zap,
  Circle,
  Filter,
} from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';

// ─── status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  delivered:           { label: 'Delivered',  dot: 'bg-emerald-500', text: 'text-emerald-400' },
  on_the_way_delivery: { label: 'En Route',   dot: 'bg-sky-400',     text: 'text-sky-400'     },
  on_the_way_pickup:   { label: 'To Pickup',  dot: 'bg-sky-400',     text: 'text-sky-400'     },
  collected:           { label: 'Collected',  dot: 'bg-blue-400',    text: 'text-blue-400'    },
  pending:             { label: 'Pending',    dot: 'bg-amber-400',   text: 'text-amber-400'   },
  assigned:            { label: 'Assigned',   dot: 'bg-violet-400',  text: 'text-violet-400'  },
  accepted:            { label: 'Accepted',   dot: 'bg-violet-400',  text: 'text-violet-400'  },
  cancelled:           { label: 'Cancelled',  dot: 'bg-rose-500',    text: 'text-rose-400'    },
  rejected:            { label: 'Rejected',   dot: 'bg-blue-500',    text: 'text-blue-400'    },
};

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CFG[status];
  const label = cfg?.label ?? status;
  const dot   = cfg?.dot   ?? 'bg-gray-500';
  const text  = cfg?.text  ?? 'text-gray-400';
  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-medium ${text}`} data-testid={`badge-status-${status}`}>
      <span className={`inline-block h-[5px] w-[5px] rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const ALL_STATUSES = [
  { value: 'all',                 label: 'All statuses' },
  { value: 'pending',             label: 'Pending' },
  { value: 'assigned',            label: 'Assigned' },
  { value: 'accepted',            label: 'Accepted' },
  { value: 'on_the_way_pickup',   label: 'To Pickup' },
  { value: 'collected',           label: 'Collected' },
  { value: 'on_the_way_delivery', label: 'En Route' },
  { value: 'delivered',           label: 'Delivered' },
  { value: 'cancelled',           label: 'Cancelled' },
  { value: 'rejected',            label: 'Rejected' },
];

const JOBS_PER_PAGE = 10;

const formatPrice = (v: string | number | undefined | null) => {
  if (v == null) return '£0.00';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? '£0.00' : `£${n.toFixed(2)}`;
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

// ─── colour tokens (always dark) ─────────────────────────────────────────────
const BG_PAGE   = 'bg-[#0B0F14]';
const BG_PANEL  = 'bg-[#11161D]';
const BG_ROW    = 'bg-[#0F141A]';
const BORDER    = 'border-[#1F2933]';
const TEXT_HI   = 'text-[#F0F4F8]';   // headings / amounts
const TEXT_MID  = 'text-[#94A3B8]';   // body
const TEXT_DIM  = 'text-[#5A6A7A]';   // muted

// ─── panel wrapper ────────────────────────────────────────────────────────────
function Panel({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`${BG_PANEL} border ${BORDER} rounded-sm ${className}`}>
      {children}
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 border-b ${BORDER}`}>
      <span className={`text-[10px] font-bold uppercase tracking-widest ${TEXT_DIM}`}>{title}</span>
      {action}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);

  const { data: stats,        isLoading: statsLoading }   = useAdminStats();
  const { data: jobs,         isLoading: jobsLoading }    = useJobs({ limit: 100 });
  const { data: drivers }                                  = useDrivers();
  const { data: documents }                                = usePendingDocuments();
  const { data: applications }                             = useDriverApplications();

  const reviewMutation = useReviewDocument();

  const getDriver = (id: string | null) => {
    if (!id) return '—';
    const d = drivers?.find(x => x.id === id);
    if (d?.fullName) return d.fullName;
    if (d?.vehicleRegistration) return d.vehicleRegistration;
    const a = applications?.find(x => x.id === id);
    if (a?.fullName) return a.fullName;
    return id.startsWith('application-') ? 'Pending' : id.substring(0, 8);
  };

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter(job => {
      if (statusFilter !== 'all' && job.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          job.trackingNumber?.toLowerCase().includes(q) ||
          job.pickupPostcode?.toLowerCase().includes(q)  ||
          job.deliveryPostcode?.toLowerCase().includes(q) ||
          getDriver(job.driverId ?? null).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [jobs, statusFilter, search, drivers, applications]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const pagedJobs  = filteredJobs.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE);

  const pendingDocs   = documents?.filter(d => d.status === 'pending').length || 0;
  const pendingApps   = applications?.filter(a => a.status === 'pending').length || 0;
  const unverified    = drivers?.filter(d => !d.isVerified && d.isActive !== false).length || 0;

  const activeDrivers  = drivers?.filter(d => d.isActive !== false) || [];
  const deliveringIds  = new Set(
    jobs?.filter(j =>
      ['on_the_way_delivery','on_the_way_pickup','collected','assigned','accepted'].includes(j.status) && j.driverId
    ).map(j => j.driverId!)
  );
  const delivering  = activeDrivers.filter(d => deliveringIds.has(d.id));
  const available   = activeDrivers.filter(d => !deliveringIds.has(d.id));
  const offline     = drivers?.filter(d => d.isActive === false) || [];

  const alerts = [
    pendingApps  > 0 && { label: `${pendingApps} application${pendingApps>1?'s':''} pending`,   href: '/admin/applications',           color: 'text-amber-400' },
    pendingDocs  > 0 && { label: `${pendingDocs} document${pendingDocs>1?'s':''} pending`,       href: '/admin/documents',              color: 'text-amber-400' },
    unverified   > 0 && { label: `${unverified} driver${unverified>1?'s':''} unverified`,        href: '/admin/drivers?filter=unverified', color: 'text-rose-400' },
    (stats?.pendingJobs||0)>0 && { label: `${stats?.pendingJobs} job${(stats?.pendingJobs||0)>1?'s':''} unassigned`, href: '/admin/jobs?filter=pending', color: 'text-blue-400' },
  ].filter(Boolean) as { label: string; href: string; color: string }[];

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* Full-bleed dark wrapper — bleeds over layout padding */}
      <div
        className={`${BG_PAGE} -m-3 sm:-m-4 lg:-m-6 min-h-[calc(100vh-3.5rem)] flex flex-col`}
        style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif" }}
      >

        {/* ── TOP BAR ── */}
        <div className={`sticky top-0 z-20 flex items-center gap-3 px-4 h-11 border-b ${BORDER} ${BG_PAGE} flex-shrink-0`}>
          <span className={`text-sm font-semibold ${TEXT_HI} whitespace-nowrap`} data-testid="text-page-title">
            Dashboard
          </span>
          <div className="flex-1 max-w-xs hidden sm:block">
            <div className="relative">
              <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 ${TEXT_DIM}`} />
              <input
                className={`w-full h-7 pl-7 pr-3 text-[11px] ${BG_PANEL} border ${BORDER} rounded-sm ${TEXT_MID} placeholder:${TEXT_DIM} focus:outline-none focus:border-blue-500/60 transition-colors`}
                placeholder="Search tracking ID, postcode, driver…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                data-testid="input-global-search"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {alerts.length > 0 && (
              <div className="relative cursor-pointer" data-testid="alert-pending-actions">
                <Bell className={`h-4 w-4 ${TEXT_MID}`} />
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                  {alerts.length}
                </span>
              </div>
            )}
            <div className={`h-4 w-px ${BG_PANEL} border-l ${BORDER}`} />
            <Link href="/admin/jobs/create">
              <button
                className="flex items-center gap-1.5 px-3 h-7 text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-sm transition-colors"
                data-testid="button-new-job"
              >
                <Plus className="h-3 w-3" />
                New Job
              </button>
            </Link>
          </div>
        </div>

        {/* ── KPI STRIP ── */}
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-1.5 px-4 py-2 border-b ${BORDER} flex-shrink-0`}>
          {statsLoading ? (
            [1,2,3,4].map(i => <Skeleton key={i} className="h-4 w-24 bg-[#1F2933]" />)
          ) : (
            <>
              <KpiItem label="Jobs Today"    value={String(stats?.todaysJobs || 0)}                    testId="stat-card-today's-jobs" />
              <div className={`h-4 w-px border-l ${BORDER} hidden sm:block`} />
              <KpiItem
                label="Active Drivers"
                value={`${stats?.activeDrivers || 0}`}
                suffix={`/ ${stats?.totalDrivers || 0}`}
                valueClass="text-emerald-400"
                testId="stat-card-active-drivers"
              />
              <div className={`h-4 w-px border-l ${BORDER} hidden sm:block`} />
              <KpiItem label="Revenue Today" value={formatPrice(stats?.todayRevenue || 0)}             testId="stat-card-today's-revenue" />
              <div className={`h-4 w-px border-l ${BORDER} hidden sm:block`} />
              <KpiItem
                label="Pending"
                value={String(stats?.pendingJobs || 0)}
                valueClass={(stats?.pendingJobs || 0) > 0 ? 'text-amber-400' : undefined}
                testId="stat-card-pending-jobs"
              />
            </>
          )}
        </div>

        {/* ── MAIN SPLIT ── */}
        <div className="flex gap-0 flex-1 min-h-0 overflow-hidden">

          {/* ── JOBS TABLE (75%) ── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-[#1F2933]">

            {/* Filter bar */}
            <div className={`flex items-center gap-2 px-4 py-2 border-b ${BORDER} flex-shrink-0`}>
              <Filter className={`h-3 w-3 ${TEXT_DIM} flex-shrink-0`} />
              {/* status buttons */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                {ALL_STATUSES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => { setStatusFilter(s.value); setPage(1); }}
                    className={`flex-shrink-0 px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
                      statusFilter === s.value
                        ? 'bg-blue-600 text-white'
                        : `${TEXT_DIM} hover:text-[#94A3B8] border ${BORDER}`
                    }`}
                    data-testid={`filter-status-${s.value}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <span className={`ml-auto text-[10px] ${TEXT_DIM} whitespace-nowrap flex-shrink-0`}>
                {filteredJobs.length} result{filteredJobs.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead className={`sticky top-0 ${BG_PAGE} z-10`}>
                  <tr className={`border-b ${BORDER}`}>
                    {['Order ID','Route','Driver','Vehicle','Status','Time','Amount',''].map((h, i) => (
                      <th
                        key={i}
                        className={`px-3 py-2 text-left font-bold uppercase tracking-widest ${TEXT_DIM} whitespace-nowrap ${
                          h === 'Amount' ? 'text-right' : ''
                        } ${h === 'Driver' ? 'hidden lg:table-cell' : ''} ${h === 'Vehicle' ? 'hidden md:table-cell' : ''} ${h === 'Time' ? 'hidden sm:table-cell' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobsLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className={`border-b ${BORDER}`}>
                        {[1,2,3,4,5,6,7,8].map(j => (
                          <td key={j} className="px-3 py-2.5">
                            <Skeleton className="h-3 w-full bg-[#1F2933]" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : pagedJobs.length > 0 ? (
                    pagedJobs.map((job, idx) => (
                      <tr
                        key={job.id}
                        className={`border-b ${BORDER} transition-colors cursor-pointer ${
                          idx % 2 === 0 ? `${BG_PAGE}` : `${BG_ROW}`
                        } hover:bg-[#162030]`}
                        data-testid={`row-job-${job.id}`}
                      >
                        {/* Order ID */}
                        <td className="px-3 py-2.5">
                          <span className={`font-mono font-semibold ${TEXT_HI} tracking-tight`}>
                            {job.trackingNumber}
                          </span>
                        </td>
                        {/* Route */}
                        <td className="px-3 py-2.5 max-w-[150px]">
                          <div className={`flex items-center gap-1 ${TEXT_MID}`}>
                            <span className="truncate font-medium">{job.pickupPostcode}</span>
                            <ArrowRight className={`h-2.5 w-2.5 ${TEXT_DIM} flex-shrink-0`} />
                            <span className={`truncate ${TEXT_DIM}`}>{job.deliveryPostcode}</span>
                          </div>
                        </td>
                        {/* Driver */}
                        <td className={`px-3 py-2.5 hidden lg:table-cell max-w-[120px]`}>
                          <span className={`${TEXT_MID} truncate block`}>
                            {getDriver(job.driverId ?? null)}
                          </span>
                        </td>
                        {/* Vehicle */}
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <span className={TEXT_DIM}>{formatVehicle(job.vehicleType)}</span>
                        </td>
                        {/* Status */}
                        <td className="px-3 py-2.5">
                          <StatusDot status={job.status} />
                        </td>
                        {/* Time */}
                        <td className={`px-3 py-2.5 hidden sm:table-cell ${TEXT_DIM} tabular-nums whitespace-nowrap`}>
                          {formatTime((job as any).createdAt)}
                        </td>
                        {/* Amount */}
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${TEXT_HI}`}>
                          {formatPrice(job.totalPrice)}
                        </td>
                        {/* Actions */}
                        <td className="px-2 py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className={`h-5 w-5 flex items-center justify-center rounded-sm ${TEXT_DIM} hover:text-[#94A3B8] hover:bg-[#1F2933] transition-colors`}
                                data-testid={`button-job-actions-${job.id}`}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem onClick={() => window.location.href = '/admin/jobs'}>
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.location.href = '/admin/jobs'}>
                                Assign Driver
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => window.location.href = '/admin/jobs'}>
                                View on Map
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Package className={`h-8 w-8 ${TEXT_DIM}`} />
                          <p className={`text-xs ${TEXT_MID}`}>No jobs found</p>
                          {(statusFilter !== 'all' || search) && (
                            <button
                              className="text-[11px] text-blue-400 hover:underline"
                              onClick={() => { setStatusFilter('all'); setSearch(''); }}
                            >
                              Clear filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className={`flex items-center justify-between px-4 py-2 border-t ${BORDER} flex-shrink-0`}>
              <span className={`text-[10px] ${TEXT_DIM} tabular-nums`}>
                {filteredJobs.length === 0 ? '0 results' : (
                  `${(page-1)*JOBS_PER_PAGE+1}–${Math.min(page*JOBS_PER_PAGE, filteredJobs.length)} of ${filteredJobs.length}`
                )}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p-1))}
                  disabled={page === 1}
                  className={`h-6 w-6 flex items-center justify-center rounded-sm border ${BORDER} ${TEXT_DIM} disabled:opacity-30 hover:border-blue-500/50 hover:text-blue-400 transition-colors`}
                  data-testid="button-page-prev"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className={`px-2 text-[11px] font-medium ${TEXT_MID} tabular-nums`}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p+1))}
                  disabled={page === totalPages}
                  className={`h-6 w-6 flex items-center justify-center rounded-sm border ${BORDER} ${TEXT_DIM} disabled:opacity-30 hover:border-blue-500/50 hover:text-blue-400 transition-colors`}
                  data-testid="button-page-next"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL (25%) ── */}
          <div className={`hidden lg:flex flex-col w-56 xl:w-64 flex-shrink-0 ${BG_PAGE} overflow-y-auto`}>

            {/* Driver Activity */}
            <div className={`border-b ${BORDER}`}>
              <PanelHeader
                title="Driver Activity"
                action={
                  <Link href="/admin/drivers">
                    <span className={`text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer`}>All →</span>
                  </Link>
                }
              />
              {/* 3-col summary */}
              <div className={`grid grid-cols-3 divide-x ${BORDER}`}>
                <StatBox n={delivering.length} label="Active"    color="text-emerald-400" />
                <StatBox n={available.length}  label="Available" color={TEXT_HI} />
                <StatBox n={offline.length}    label="Offline"   color={TEXT_DIM} />
              </div>
              {/* driver list */}
              <div className="overflow-y-auto max-h-40">
                {activeDrivers.length === 0 ? (
                  <p className={`text-[11px] ${TEXT_DIM} px-3 py-3 text-center`}>No active drivers</p>
                ) : activeDrivers.slice(0, 12).map(d => {
                  const isDelivering = deliveringIds.has(d.id);
                  return (
                    <div key={d.id} className={`flex items-center gap-2 px-3 py-1.5 border-b ${BORDER} last:border-0 hover:bg-[#11161D] transition-colors`}>
                      <span className={`h-[5px] w-[5px] rounded-full flex-shrink-0 ${isDelivering ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                      <span className={`text-[11px] ${TEXT_MID} truncate flex-1`}>
                        {d.fullName || d.vehicleRegistration || 'Driver'}
                      </span>
                      <span className={`text-[10px] flex-shrink-0 ${isDelivering ? 'text-emerald-400' : TEXT_DIM}`}>
                        {isDelivering ? 'Active' : 'Avail'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Alerts */}
            <div className={`border-b ${BORDER}`}>
              <PanelHeader
                title="Alerts"
                action={alerts.length > 0 ? (
                  <span className="h-4 w-4 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                    {alerts.length}
                  </span>
                ) : undefined}
              />
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-4">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <p className={`text-[11px] ${TEXT_DIM}`}>All clear</p>
                </div>
              ) : alerts.map((a, i) => (
                <Link href={a.href} key={i}>
                  <div
                    className={`flex items-start gap-2 px-3 py-2 border-b ${BORDER} last:border-0 hover:bg-[#11161D] transition-colors cursor-pointer`}
                    data-testid={`alert-item-${i}`}
                  >
                    <span className={`h-[5px] w-[5px] mt-1.5 rounded-full flex-shrink-0 ${a.color === 'text-amber-400' ? 'bg-amber-400' : a.color === 'text-rose-400' ? 'bg-rose-400' : 'bg-blue-400'}`} />
                    <span className={`text-[11px] ${TEXT_MID} leading-snug`}>{a.label}</span>
                    <ArrowRight className={`h-2.5 w-2.5 ${TEXT_DIM} ml-auto mt-0.5 flex-shrink-0`} />
                  </div>
                </Link>
              ))}
            </div>

            {/* Pending Documents quick-review */}
            {pendingDocs > 0 && (
              <div className={`border-b ${BORDER}`}>
                <PanelHeader title="Pending Docs" />
                <div className="px-3 py-2 space-y-1.5">
                  {(documents?.filter(d => d.status === 'pending') || []).slice(0, 3).map(doc => (
                    <div key={doc.id} className={`flex items-center gap-2`} data-testid={`doc-${doc.id}`}>
                      <span className={`text-[10px] ${TEXT_MID} truncate flex-1`}>
                        {doc.fileName}
                      </span>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => reviewMutation.mutate({ id: doc.id, status: 'approved', reviewedBy: 'admin' })}
                          className="h-5 w-5 flex items-center justify-center text-emerald-500 hover:text-emerald-400 transition-colors"
                          disabled={reviewMutation.isPending}
                          data-testid={`button-approve-doc-${doc.id}`}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => reviewMutation.mutate({ id: doc.id, status: 'rejected', reviewedBy: 'admin', reviewNotes: 'Rejected' })}
                          className="h-5 w-5 flex items-center justify-center text-rose-500 hover:text-rose-400 transition-colors"
                          disabled={reviewMutation.isPending}
                          data-testid={`button-reject-doc-${doc.id}`}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div>
              <PanelHeader title="Quick Actions" />
              <div className="p-2 space-y-1">
                {[
                  { href: '/admin/jobs/create',          icon: Plus,          label: 'Create Job',         testId: 'button-create-job'          },
                  { href: '/admin/jobs?filter=pending',   icon: Truck,         label: 'Assign Driver',      testId: 'button-assign-driver'       },
                  { href: '/admin/applications',          icon: ClipboardCheck,label: 'Applications',       testId: 'button-driver-applications', badge: pendingApps > 0 ? pendingApps : 0 },
                  { href: '/admin/map',                   icon: MapPin,        label: 'Live Map',           testId: 'button-live-map'            },
                  { href: '/admin/documents',             icon: FileText,      label: 'Documents',          testId: 'button-review-docs',         badge: pendingDocs > 0 ? pendingDocs : 0 },
                  { href: '/admin/pricing',               icon: TrendingUp,    label: 'Pricing Settings',   testId: 'button-pricing-settings'    },
                ].map(item => (
                  <Link href={item.href} key={item.testId}>
                    <div
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-sm border ${BORDER} ${TEXT_MID} hover:bg-[#11161D] hover:text-[#F0F4F8] hover:border-blue-500/30 transition-colors cursor-pointer text-[11px] font-medium`}
                      data-testid={item.testId}
                    >
                      <item.icon className="h-3 w-3 flex-shrink-0" />
                      {item.label}
                      {(item.badge ?? 0) > 0 && (
                        <span className="ml-auto text-[9px] font-bold text-amber-400">{item.badge}</span>
                      )}
                    </div>
                  </Link>
                ))}
                <a href="https://wa.me/447482527001" target="_blank" rel="noopener noreferrer" data-testid="button-whatsapp">
                  <div className={`flex items-center gap-2 px-2 py-1.5 rounded-sm border ${BORDER} text-[#25D366] hover:bg-[#11161D] hover:border-[#25D366]/30 transition-colors cursor-pointer text-[11px] font-medium`}>
                    <SiWhatsapp className="h-3 w-3 flex-shrink-0" />
                    WhatsApp Support
                  </div>
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────
function KpiItem({
  label, value, suffix, valueClass, testId
}: { label: string; value: string; suffix?: string; valueClass?: string; testId?: string }) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0" data-testid={testId}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#5A6A7A]">{label}</span>
      <span className={`text-sm font-bold tabular-nums text-[#F0F4F8] ${valueClass || ''}`}>{value}</span>
      {suffix && <span className="text-xs text-[#5A6A7A]">{suffix}</span>}
    </div>
  );
}

function StatBox({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center py-2.5 gap-0.5">
      <span className={`text-lg font-bold tabular-nums leading-none ${color}`}>{n}</span>
      <span className="text-[9px] text-[#5A6A7A] uppercase tracking-wider">{label}</span>
    </div>
  );
}
