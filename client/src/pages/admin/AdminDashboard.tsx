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
import { Link } from 'wouter';
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
  AlertCircle,
  ClipboardCheck,
  MoreHorizontal,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Bell,
  Activity,
} from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';

// ─── colour tokens (always dark — override theme) ─────────────────────────────
const C = {
  pageBg:   '#0B0F14',
  panelBg:  '#111820',
  rowAlt:   '#0E1319',
  rowHover: '#152032',
  border:   '#1E2A36',
  borderHi: '#2A3F54',
  textHi:   '#EDF2F7',
  textMid:  '#8FA3B8',
  textDim:  '#4A6070',
  blue:     '#3B82F6',
  teal:     '#14B8A6',
  emerald:  '#10B981',
  amber:    '#F59E0B',
  violet:   '#8B5CF6',
  rose:     '#F43F5E',
  sky:      '#38BDF8',
} as const;

const s = {
  pageBg:   `bg-[${C.pageBg}]`,
  panelBg:  `bg-[${C.panelBg}]`,
  border:   `border-[${C.border}]`,
  borderHi: `border-[${C.borderHi}]`,
  textHi:   `text-[${C.textHi}]`,
  textMid:  `text-[${C.textMid}]`,
  textDim:  `text-[${C.textDim}]`,
} as const;

// ─── helpers ──────────────────────────────────────────────────────────────────
const toNum = (v: string | number | undefined | null) => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
};
const fmt = (v: number | string | null | undefined) => `£${toNum(v).toFixed(2)}`;

const formatVehicle = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';

const formatTime = (dt?: string | Date | null) => {
  if (!dt) return '—';
  const d = new Date(dt as string);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// ─── status config ────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  delivered:            { label: 'Delivered',  dot: C.emerald, text: C.emerald },
  on_the_way_delivery:  { label: 'En Route',   dot: C.sky,     text: C.sky     },
  on_the_way_pickup:    { label: 'To Pickup',  dot: C.sky,     text: C.sky     },
  collected:            { label: 'Collected',  dot: C.blue,    text: C.blue    },
  pending:              { label: 'Pending',    dot: C.amber,   text: C.amber   },
  assigned:             { label: 'Assigned',   dot: C.violet,  text: C.violet  },
  accepted:             { label: 'Accepted',   dot: C.violet,  text: C.violet  },
  cancelled:            { label: 'Cancelled',  dot: C.rose,    text: C.rose    },
  rejected:             { label: 'Rejected',   dot: C.blue,    text: C.blue    },
};

function StatusCell({ status }: { status: string }) {
  const cfg = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap"
      style={{ color: cfg?.text ?? C.textMid }}
      data-testid={`badge-status-${status}`}
    >
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 6, height: 6, backgroundColor: cfg?.dot ?? C.textDim }}
      />
      {cfg?.label ?? status}
    </span>
  );
}

// ─── filter tabs ─────────────────────────────────────────────────────────────
const ALL_STATUSES = [
  { value: 'all',                 label: 'All' },
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

// ─── sub-components ───────────────────────────────────────────────────────────
function PanelHead({ title, extra }: { title: string; extra?: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{ borderBottom: `1px solid ${C.border}` }}
    >
      <span
        className="text-[9px] font-bold uppercase tracking-[0.12em]"
        style={{ color: C.textDim }}
      >
        {title}
      </span>
      {extra}
    </div>
  );
}

function KpiItem({
  label, value, suffix, color, testId,
}: { label: string; value: string; suffix?: string; color?: string; testId?: string }) {
  return (
    <div className="flex items-center gap-2.5 flex-shrink-0" data-testid={testId}>
      <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: C.textDim }}>
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums" style={{ color: color ?? C.textHi }}>
        {value}
      </span>
      {suffix && (
        <span className="text-xs" style={{ color: C.textDim }}>{suffix}</span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px flex-shrink-0" style={{ backgroundColor: C.border }} />;
}

const JOBS_PER_PAGE = 10;

// ─── main component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);

  const { data: stats,      isLoading: statsLoading } = useAdminStats();
  const { data: jobs,       isLoading: jobsLoading }  = useJobs({ limit: 200 });
  const { data: drivers }                              = useDrivers();
  const { data: documents }                            = usePendingDocuments();
  const { data: applications }                         = useDriverApplications();

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

  const pendingDocs  = documents?.filter(d => d.status === 'pending').length || 0;
  const pendingApps  = applications?.filter(a => a.status === 'pending').length || 0;
  const unverified   = drivers?.filter(d => !d.isVerified && d.isActive !== false).length || 0;

  const activeDrivers = drivers?.filter(d => d.isActive !== false) || [];
  const deliveringIds = new Set(
    jobs?.filter(j =>
      ['on_the_way_delivery','on_the_way_pickup','collected','assigned','accepted'].includes(j.status) && j.driverId
    ).map(j => j.driverId!)
  );
  const delivering = activeDrivers.filter(d => deliveringIds.has(d.id));
  const available  = activeDrivers.filter(d => !deliveringIds.has(d.id));
  const offline    = drivers?.filter(d => d.isActive === false) || [];

  const alerts = [
    unverified   > 0 && { label: `${unverified} driver${unverified>1?'s':''} unverified`,          href: '/admin/drivers?filter=unverified', color: C.rose  },
    pendingApps  > 0 && { label: `${pendingApps} application${pendingApps>1?'s':''} pending`,       href: '/admin/applications',              color: C.amber },
    pendingDocs  > 0 && { label: `${pendingDocs} document${pendingDocs>1?'s':''} pending review`,   href: '/admin/documents',                 color: C.amber },
    (stats?.pendingJobs||0)>0 && { label: `${stats?.pendingJobs} job${(stats?.pendingJobs||0)>1?'s':''} unassigned`, href: '/admin/jobs?filter=pending', color: C.blue },
  ].filter(Boolean) as { label: string; href: string; color: string }[];

  const totalAlerts = pendingDocs + pendingApps + unverified;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* Full-bleed dark shell */}
      <div
        className="-m-3 sm:-m-4 lg:-m-6 flex flex-col"
        style={{
          backgroundColor: C.pageBg,
          minHeight: 'calc(100vh - 3.5rem)',
          fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
        }}
      >
        {/* ══ TOP BAR ══════════════════════════════════════════════════════ */}
        <div
          className="sticky top-0 z-20 flex items-center gap-4 px-5 flex-shrink-0"
          style={{
            height: 48,
            backgroundColor: C.pageBg,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {/* Title */}
          <span
            className="text-sm font-bold whitespace-nowrap tracking-tight"
            style={{ color: C.textHi }}
            data-testid="text-page-title"
          >
            Dashboard
          </span>

          {/* Search */}
          <div className="relative flex-1 max-w-sm hidden sm:block">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
              style={{ color: C.textDim }}
            />
            <input
              className="w-full h-8 pl-8 pr-3 text-[12px] rounded-md outline-none transition-colors focus:ring-1"
              style={{
                backgroundColor: C.panelBg,
                border: `1px solid ${C.border}`,
                color: C.textMid,
              }}
              placeholder="Search tracking ID, postcode, driver…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              data-testid="input-global-search"
              onFocus={e => (e.target.style.borderColor = C.teal)}
              onBlur={e  => (e.target.style.borderColor = C.border)}
            />
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3 ml-auto">
            {totalAlerts > 0 && (
              <div className="relative cursor-pointer" data-testid="alert-pending-actions">
                <Bell className="h-4 w-4" style={{ color: C.textMid }} />
                <span
                  className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center leading-none"
                  style={{ backgroundColor: C.rose }}
                >
                  {totalAlerts}
                </span>
              </div>
            )}
            <div className="h-4 w-px" style={{ backgroundColor: C.border }} />
            <Link href="/admin/jobs/create">
              <button
                className="flex items-center gap-1.5 px-3.5 h-8 text-[12px] font-semibold rounded-md text-white transition-colors hover:brightness-110"
                style={{ backgroundColor: C.blue }}
                data-testid="button-new-job"
              >
                <Plus className="h-3.5 w-3.5" />
                New Job
              </button>
            </Link>
          </div>
        </div>

        {/* ══ KPI STRIP ════════════════════════════════════════════════════ */}
        <div
          className="flex flex-wrap items-center gap-x-7 gap-y-2 px-5 flex-shrink-0"
          style={{
            height: 44,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {statsLoading ? (
            [1,2,3,4].map(i => (
              <div key={i} className="h-3 w-24 rounded animate-pulse" style={{ backgroundColor: C.border }} />
            ))
          ) : (
            <>
              <KpiItem label="Jobs Today"    value={String(stats?.todaysJobs || 0)}                         testId="stat-card-today's-jobs" />
              <Divider />
              <KpiItem
                label="Active Drivers"
                value={String(stats?.activeDrivers || 0)}
                suffix={`/ ${stats?.totalDrivers || 0}`}
                color={C.teal}
                testId="stat-card-active-drivers"
              />
              <Divider />
              <KpiItem label="Revenue Today" value={fmt(stats?.todayRevenue)}                               testId="stat-card-today's-revenue" />
              <Divider />
              <KpiItem
                label="Pending"
                value={String(stats?.pendingJobs || 0)}
                color={(stats?.pendingJobs || 0) > 0 ? C.amber : undefined}
                testId="stat-card-pending-jobs"
              />
            </>
          )}
        </div>

        {/* ══ MAIN SPLIT ══════════════════════════════════════════════════ */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── TABLE COLUMN (flex-1) ── */}
          <div
            className="flex-1 min-w-0 flex flex-col overflow-hidden"
            style={{ borderRight: `1px solid ${C.border}` }}
          >
            {/* Filter tabs */}
            <div
              className="flex items-center gap-0 px-4 flex-shrink-0 overflow-x-auto scrollbar-none"
              style={{
                height: 40,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              {ALL_STATUSES.map(opt => {
                const active = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                    className="relative flex-shrink-0 px-3 h-full text-[11px] font-semibold transition-colors"
                    style={{ color: active ? C.teal : C.textDim }}
                    data-testid={`filter-status-${opt.value}`}
                  >
                    {opt.label}
                    {active && (
                      <span
                        className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                        style={{ backgroundColor: C.teal }}
                      />
                    )}
                  </button>
                );
              })}
              <span className="ml-auto pl-4 text-[11px] flex-shrink-0 whitespace-nowrap" style={{ color: C.textDim }}>
                {filteredJobs.length} result{filteredJobs.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                <thead
                  className="sticky top-0 z-10"
                  style={{ backgroundColor: C.pageBg }}
                >
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {[
                      { label: 'Order ID',  cls: 'pl-5 w-40' },
                      { label: 'Route',     cls: '' },
                      { label: 'Driver',    cls: 'hidden lg:table-cell' },
                      { label: 'Vehicle',   cls: 'hidden md:table-cell' },
                      { label: 'Status',    cls: '' },
                      { label: 'Time',      cls: 'hidden sm:table-cell' },
                      { label: 'Amount',    cls: 'text-right pr-4' },
                      { label: '',          cls: 'w-10' },
                    ].map((h, i) => (
                      <th
                        key={i}
                        className={`py-2.5 px-3 text-left font-bold uppercase whitespace-nowrap ${h.cls}`}
                        style={{ color: C.textDim, letterSpacing: '0.1em', fontSize: 10 }}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobsLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        {[1,2,3,4,5,6,7,8].map(j => (
                          <td key={j} className="px-3 py-3">
                            <div className="h-3 rounded animate-pulse" style={{ backgroundColor: C.border }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : pagedJobs.length > 0 ? (
                    pagedJobs.map((job, idx) => (
                      <tr
                        key={job.id}
                        className="transition-colors cursor-pointer group"
                        style={{
                          borderBottom: `1px solid ${C.border}`,
                          backgroundColor: idx % 2 === 0 ? C.pageBg : C.rowAlt,
                        }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = C.rowHover)}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = idx % 2 === 0 ? C.pageBg : C.rowAlt)}
                        data-testid={`row-job-${job.id}`}
                      >
                        {/* Order ID */}
                        <td className="pl-5 pr-3 py-3">
                          <span
                            className="font-mono font-bold tracking-tight"
                            style={{ fontSize: 11, color: C.textHi }}
                          >
                            {job.trackingNumber}
                          </span>
                        </td>

                        {/* Route */}
                        <td className="px-3 py-3 max-w-[160px]">
                          <div className="flex items-center gap-1.5" style={{ color: C.textMid }}>
                            <span className="font-medium truncate" style={{ fontSize: 12 }}>
                              {job.pickupPostcode}
                            </span>
                            <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" style={{ color: C.textDim }} />
                            <span className="truncate" style={{ fontSize: 12, color: C.textDim }}>
                              {job.deliveryPostcode}
                            </span>
                          </div>
                        </td>

                        {/* Driver */}
                        <td className="px-3 py-3 hidden lg:table-cell max-w-[130px]">
                          <span className="truncate block" style={{ fontSize: 12, color: C.textMid }}>
                            {getDriver(job.driverId ?? null)}
                          </span>
                        </td>

                        {/* Vehicle */}
                        <td className="px-3 py-3 hidden md:table-cell whitespace-nowrap">
                          <span style={{ fontSize: 12, color: C.textDim }}>
                            {formatVehicle(job.vehicleType)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3">
                          <StatusCell status={job.status} />
                        </td>

                        {/* Time */}
                        <td className="px-3 py-3 hidden sm:table-cell whitespace-nowrap">
                          <span className="tabular-nums" style={{ fontSize: 12, color: C.textDim }}>
                            {formatTime((job as any).createdAt)}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="px-3 pr-4 py-3 text-right">
                          <span className="font-bold tabular-nums" style={{ fontSize: 13, color: C.textHi }}>
                            {fmt(job.totalPrice)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-2 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="h-6 w-6 flex items-center justify-center rounded transition-colors opacity-0 group-hover:opacity-100"
                                style={{ color: C.textDim }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = C.border; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                                data-testid={`button-job-actions-${job.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" style={{ fontSize: 12 }}>
                              <DropdownMenuItem onClick={() => window.location.href = '/admin/jobs'}>View Details</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.location.href = '/admin/jobs'}>Assign Driver</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => window.location.href = '/admin/map'}>View on Map</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Package className="h-8 w-8" style={{ color: C.textDim }} />
                          <p style={{ fontSize: 13, color: C.textMid }}>No jobs found</p>
                          {(statusFilter !== 'all' || search) && (
                            <button
                              className="underline underline-offset-2"
                              style={{ fontSize: 12, color: C.teal }}
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
            <div
              className="flex items-center justify-between px-5 flex-shrink-0"
              style={{ height: 40, borderTop: `1px solid ${C.border}` }}
            >
              <span className="tabular-nums" style={{ fontSize: 11, color: C.textDim }}>
                {filteredJobs.length === 0
                  ? '0 results'
                  : `${(page-1)*JOBS_PER_PAGE+1}–${Math.min(page*JOBS_PER_PAGE, filteredJobs.length)} of ${filteredJobs.length}`
                }
              </span>
              <div className="flex items-center gap-1">
                <PagBtn onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} testId="button-page-prev">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </PagBtn>
                <span className="px-2 font-semibold tabular-nums" style={{ fontSize: 12, color: C.textMid }}>
                  {page} / {totalPages}
                </span>
                <PagBtn onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} testId="button-page-next">
                  <ChevronRight className="h-3.5 w-3.5" />
                </PagBtn>
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div
            className="hidden lg:flex flex-col w-60 xl:w-68 flex-shrink-0 overflow-y-auto"
            style={{ backgroundColor: C.pageBg }}
          >

            {/* Driver Activity */}
            <section style={{ borderBottom: `1px solid ${C.border}` }}>
              <PanelHead
                title="Driver Activity"
                extra={
                  <Link href="/admin/drivers">
                    <span className="text-[10px] font-semibold cursor-pointer transition-colors hover:brightness-125" style={{ color: C.teal }}>
                      View all →
                    </span>
                  </Link>
                }
              />
              {/* Stats row */}
              <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                {[
                  { n: delivering.length, label: 'Active',    color: C.teal   },
                  { n: available.length,  label: 'Available', color: C.textHi },
                  { n: offline.length,    label: 'Offline',   color: C.textDim },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center py-3 gap-0.5"
                    style={{ borderRight: i < 2 ? `1px solid ${C.border}` : undefined }}
                  >
                    <span className="text-lg font-bold tabular-nums leading-none" style={{ color: item.color }}>{item.n}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: C.textDim }}>{item.label}</span>
                  </div>
                ))}
              </div>
              {/* Driver list */}
              <div className="overflow-y-auto max-h-40">
                {activeDrivers.length === 0 ? (
                  <p className="py-4 text-center text-[11px]" style={{ color: C.textDim }}>No active drivers</p>
                ) : activeDrivers.slice(0, 10).map(d => {
                  const isDelivering = deliveringIds.has(d.id);
                  return (
                    <div
                      key={d.id}
                      className="flex items-center gap-2.5 px-3 py-2 transition-colors"
                      style={{ borderBottom: `1px solid ${C.border}` }}
                    >
                      <span
                        className="rounded-full flex-shrink-0"
                        style={{ width: 6, height: 6, backgroundColor: isDelivering ? C.teal : C.blue }}
                      />
                      <span className="text-[11px] truncate flex-1" style={{ color: C.textMid }}>
                        {d.fullName || d.vehicleRegistration || 'Driver'}
                      </span>
                      <span
                        className="text-[10px] font-medium flex-shrink-0"
                        style={{ color: isDelivering ? C.teal : C.textDim }}
                      >
                        {isDelivering ? 'Active' : 'Avail'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Alerts */}
            <section style={{ borderBottom: `1px solid ${C.border}` }}>
              <PanelHead
                title="Alerts"
                extra={alerts.length > 0 ? (
                  <span
                    className="h-4 w-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center leading-none"
                    style={{ backgroundColor: C.rose }}
                  >
                    {alerts.length}
                  </span>
                ) : undefined}
              />
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-5">
                  <CheckCircle className="h-4 w-4" style={{ color: C.emerald }} />
                  <p className="text-[11px]" style={{ color: C.textDim }}>All clear</p>
                </div>
              ) : alerts.map((a, i) => (
                <Link href={a.href} key={i}>
                  <div
                    className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
                    style={{ borderBottom: i < alerts.length - 1 ? `1px solid ${C.border}` : undefined }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = C.panelBg)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
                    data-testid={`alert-item-${i}`}
                  >
                    <span
                      className="rounded-full flex-shrink-0 mt-1.5"
                      style={{ width: 5, height: 5, backgroundColor: a.color }}
                    />
                    <span className="text-[11px] leading-snug flex-1" style={{ color: C.textMid }}>{a.label}</span>
                    <ArrowRight className="h-2.5 w-2.5 flex-shrink-0 mt-0.5" style={{ color: C.textDim }} />
                  </div>
                </Link>
              ))}
            </section>

            {/* Pending Documents inline review */}
            {pendingDocs > 0 && (
              <section style={{ borderBottom: `1px solid ${C.border}` }}>
                <PanelHead title={`Pending Docs (${pendingDocs})`} />
                <div className="px-3 py-2 space-y-2">
                  {(documents?.filter(d => d.status === 'pending') || []).slice(0, 3).map(doc => (
                    <div key={doc.id} className="flex items-center gap-2" data-testid={`doc-${doc.id}`}>
                      <span className="text-[10px] flex-1 truncate" style={{ color: C.textMid }}>{doc.fileName}</span>
                      <button
                        onClick={() => reviewMutation.mutate({ id: doc.id, status: 'approved', reviewedBy: 'admin' })}
                        disabled={reviewMutation.isPending}
                        className="h-5 w-5 flex items-center justify-center rounded transition-colors"
                        style={{ color: C.emerald }}
                        data-testid={`button-approve-doc-${doc.id}`}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => reviewMutation.mutate({ id: doc.id, status: 'rejected', reviewedBy: 'admin', reviewNotes: 'Rejected' })}
                        disabled={reviewMutation.isPending}
                        className="h-5 w-5 flex items-center justify-center rounded transition-colors"
                        style={{ color: C.rose }}
                        data-testid={`button-reject-doc-${doc.id}`}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Quick Actions */}
            <section>
              <PanelHead title="Quick Actions" />
              <div className="p-2 space-y-1">
                {[
                  { href: '/admin/jobs/create',         icon: Plus,           label: 'Create Job',       badge: 0,          testId: 'button-create-job'         },
                  { href: '/admin/jobs?filter=pending',  icon: Truck,          label: 'Assign Driver',    badge: 0,          testId: 'button-assign-driver'      },
                  { href: '/admin/applications',         icon: ClipboardCheck, label: 'Applications',     badge: pendingApps,testId: 'button-driver-applications' },
                  { href: '/admin/map',                  icon: MapPin,         label: 'Live Map',         badge: 0,          testId: 'button-live-map'           },
                  { href: '/admin/documents',            icon: FileText,       label: 'Documents',        badge: pendingDocs,testId: 'button-review-docs'        },
                  { href: '/admin/pricing',              icon: TrendingUp,     label: 'Pricing Settings', badge: 0,          testId: 'button-pricing-settings'   },
                ].map(item => (
                  <Link href={item.href} key={item.testId}>
                    <div
                      className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors"
                      style={{ border: `1px solid ${C.border}`, color: C.textMid, fontSize: 12, fontWeight: 500 }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.backgroundColor = C.panelBg;
                        el.style.borderColor = C.teal + '50';
                        el.style.color = C.textHi;
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.backgroundColor = 'transparent';
                        el.style.borderColor = C.border;
                        el.style.color = C.textMid;
                      }}
                      data-testid={item.testId}
                    >
                      <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge > 0 && (
                        <span className="text-[9px] font-bold ml-auto" style={{ color: C.amber }}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}

                {/* WhatsApp */}
                <a href="https://wa.me/447482527001" target="_blank" rel="noopener noreferrer" data-testid="button-whatsapp">
                  <div
                    className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors"
                    style={{ border: `1px solid ${C.border}`, color: '#25D366', fontSize: 12, fontWeight: 500 }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = C.panelBg;
                      (e.currentTarget as HTMLElement).style.borderColor = '#25D36650';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      (e.currentTarget as HTMLElement).style.borderColor = C.border;
                    }}
                  >
                    <SiWhatsapp className="h-3.5 w-3.5 flex-shrink-0" />
                    WhatsApp Support
                  </div>
                </a>
              </div>
            </section>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// ─── pagination button ────────────────────────────────────────────────────────
function PagBtn({ onClick, disabled, testId, children }: { onClick: () => void; disabled: boolean; testId: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-6 w-6 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
      style={{ border: `1px solid #1E2A36`, color: '#4A6070' }}
      onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.borderColor = '#14B8A6'; (e.currentTarget as HTMLElement).style.color = '#14B8A6'; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1E2A36'; (e.currentTarget as HTMLElement).style.color = '#4A6070'; }}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
