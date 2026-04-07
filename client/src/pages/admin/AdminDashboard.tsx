import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
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
  Truck,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  FileText,
  ArrowRight,
  ClipboardCheck,
  MoreHorizontal,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';

// ─── colour palette ───────────────────────────────────────────────────────────
const C = {
  pageBg:   '#0B0F14',
  panelBg:  '#111820',
  rowEven:  '#0B0F14',
  rowOdd:   '#0E1319',
  rowHover: '#132030',
  border:   '#1E2A36',
  textHi:   '#EDF2F7',
  textMid:  '#8FA3B8',
  textDim:  '#4A6070',
  teal:     '#14B8A6',
  blue:     '#3B82F6',
  emerald:  '#10B981',
  amber:    '#F59E0B',
  violet:   '#8B5CF6',
  rose:     '#F43F5E',
  sky:      '#38BDF8',
} as const;

// ─── helpers ──────────────────────────────────────────────────────────────────
const toNum = (v: string | number | null | undefined): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return isNaN(n as number) ? 0 : (n as number);
};
const fmt = (v: string | number | null | undefined) => `£${toNum(v).toFixed(2)}`;

const fmtVehicle = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';

const fmtDate = (dt?: string | Date | null) => {
  if (!dt) return '—';
  const d = new Date(dt as string);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// ─── status config ────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; color: string }> = {
  delivered:            { label: 'Delivered',  color: C.emerald },
  on_the_way_delivery:  { label: 'En Route',   color: C.sky     },
  on_the_way_pickup:    { label: 'To Pickup',  color: C.sky     },
  collected:            { label: 'Collected',  color: C.blue    },
  pending:              { label: 'Pending',    color: C.amber   },
  assigned:             { label: 'Assigned',   color: C.violet  },
  accepted:             { label: 'Accepted',   color: C.violet  },
  cancelled:            { label: 'Cancelled',  color: C.rose    },
  rejected:             { label: 'Rejected',   color: C.blue    },
};

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS[status] ?? { label: status, color: C.textDim };
  return (
    <span
      className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap"
      style={{ fontSize: 11, color: cfg.color, letterSpacing: '0.02em' }}
      data-testid={`badge-status-${status}`}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: cfg.color, flexShrink: 0, display: 'inline-block' }}
      />
      {cfg.label}
    </span>
  );
}

// ─── filter tabs ─────────────────────────────────────────────────────────────
const TABS = [
  { value: 'all',                 label: 'All'       },
  { value: 'pending',             label: 'Pending'   },
  { value: 'assigned',            label: 'Assigned'  },
  { value: 'accepted',            label: 'Accepted'  },
  { value: 'on_the_way_pickup',   label: 'To Pickup' },
  { value: 'collected',           label: 'Collected' },
  { value: 'on_the_way_delivery', label: 'En Route'  },
  { value: 'delivered',           label: 'Delivered' },
  { value: 'cancelled',           label: 'Cancelled' },
  { value: 'rejected',            label: 'Rejected'  },
];

// ─── right-panel section heading ──────────────────────────────────────────────
function PanelSection({ title, children, badge }: { title: string; children: React.ReactNode; badge?: number }) {
  return (
    <section style={{ borderBottom: `1px solid ${C.border}` }}>
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', color: C.textDim, textTransform: 'uppercase' }}>
          {title}
        </span>
        {badge != null && badge > 0 && (
          <span
            className="flex items-center justify-center rounded-full text-white"
            style={{ width: 16, height: 16, fontSize: 8, fontWeight: 800, backgroundColor: C.rose }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── pagination button ────────────────────────────────────────────────────────
function PagBtn({ onClick, disabled, children, testId }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode; testId: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded transition-all disabled:opacity-25"
      style={{ width: 26, height: 26, border: `1px solid ${C.border}`, color: C.textDim, backgroundColor: 'transparent' }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.borderColor = C.teal;
          (e.currentTarget as HTMLElement).style.color = C.teal;
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = C.border;
        (e.currentTarget as HTMLElement).style.color = C.textDim;
      }}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

const PER_PAGE = 10;

// ─── main ─────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);

  const { data: stats                 } = useAdminStats();
  const { data: jobs, isLoading: jLd  } = useJobs({ limit: 200 });
  const { data: drivers               } = useDrivers();
  const { data: applications          } = useDriverApplications();
  const { data: documents             } = usePendingDocuments();
  const reviewMut                       = useReviewDocument();

  const getDriver = (id: string | null) => {
    if (!id) return '—';
    const d = drivers?.find(x => x.id === id);
    if (d?.fullName) return d.fullName;
    if (d?.vehicleRegistration) return d.vehicleRegistration;
    const a = applications?.find(x => x.id === id);
    if (a?.fullName) return a.fullName;
    return id.length > 8 ? id.substring(0, 8) : id;
  };

  const filtered = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter(j => {
      if (filter !== 'all' && j.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (j.trackingNumber || '').toLowerCase().includes(q) ||
          (j.pickupPostcode  || '').toLowerCase().includes(q) ||
          (j.deliveryPostcode|| '').toLowerCase().includes(q) ||
          getDriver(j.driverId ?? null).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [jobs, filter, search, drivers, applications]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged      = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const pendingDocs = documents?.filter(d => d.status === 'pending').length ?? 0;
  const pendingApps = applications?.filter(a => a.status === 'pending').length ?? 0;
  const unverified  = drivers?.filter(d => !d.isVerified && d.isActive !== false).length ?? 0;
  const totalAlerts = pendingDocs + pendingApps + unverified;

  const activeDrivers = drivers?.filter(d => d.isActive !== false) ?? [];
  const deliveringIds = new Set(
    jobs?.filter(j =>
      ['on_the_way_delivery','on_the_way_pickup','collected','assigned','accepted'].includes(j.status) && j.driverId
    ).map(j => j.driverId!)
  );

  const th = (label: string, align: 'left' | 'right' = 'left', extra = '') => (
    <th
      className={`py-3 px-3 whitespace-nowrap ${extra}`}
      style={{
        textAlign: align,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: C.textDim,
        textTransform: 'uppercase',
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky',
        top: 0,
        backgroundColor: C.pageBg,
        zIndex: 5,
      }}
    >
      {label}
    </th>
  );

  return (
    <DashboardLayout>
      {/* ── Full-bleed dark shell ── */}
      <div
        className="-m-3 sm:-m-4 lg:-m-6 flex flex-col"
        style={{
          backgroundColor: C.pageBg,
          minHeight: 'calc(100vh - 3.5rem)',
        }}
      >

        {/* ══ TOOLBAR (sticky) ════════════════════════════════════════════ */}
        <div
          className="sticky top-0 z-30 flex items-center gap-4 px-5 flex-shrink-0"
          style={{
            height: 52,
            backgroundColor: C.pageBg,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {/* Page title */}
          <span
            style={{ fontSize: 14, fontWeight: 700, color: C.textHi, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}
            data-testid="text-page-title"
          >
            Dashboard
          </span>

          {/* Search */}
          <div className="relative flex-1 max-w-md hidden sm:block">
            <Search
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: C.textDim }}
            />
            <input
              style={{
                width: '100%',
                height: 34,
                paddingLeft: 32,
                paddingRight: 12,
                fontSize: 12,
                borderRadius: 6,
                outline: 'none',
                backgroundColor: C.panelBg,
                border: `1px solid ${C.border}`,
                color: C.textMid,
                fontFamily: 'inherit',
              }}
              placeholder="Search tracking ID, postcode, driver…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              data-testid="input-global-search"
              onFocus={e  => { (e.target as HTMLInputElement).style.borderColor = C.teal; (e.target as HTMLInputElement).style.boxShadow = `0 0 0 2px ${C.teal}20`; }}
              onBlur={e   => { (e.target as HTMLInputElement).style.borderColor = C.border; (e.target as HTMLInputElement).style.boxShadow = 'none'; }}
            />
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Alert badge */}
          {totalAlerts > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ backgroundColor: `${C.rose}18`, border: `1px solid ${C.rose}30` }}
              data-testid="alert-pending-actions"
            >
              <AlertCircle style={{ width: 11, height: 11, color: C.rose }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.rose }}>{totalAlerts} action{totalAlerts > 1 ? 's' : ''}</span>
            </div>
          )}

          {/* New Job */}
          <Link href="/admin/jobs/create">
            <button
              className="flex items-center gap-1.5 rounded-md font-semibold text-white transition-all hover:brightness-110 active:brightness-90"
              style={{ height: 34, paddingLeft: 14, paddingRight: 14, fontSize: 12, backgroundColor: C.blue, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              data-testid="button-new-job"
            >
              <Plus style={{ width: 13, height: 13 }} />
              New Job
            </button>
          </Link>
        </div>

        {/* ══ FILTER BAR (sticky below toolbar) ═══════════════════════════ */}
        <div
          className="sticky z-20 flex items-center flex-shrink-0 overflow-x-auto"
          style={{
            top: 52,
            height: 44,
            backgroundColor: C.pageBg,
            borderBottom: `1px solid ${C.border}`,
            paddingLeft: 4,
          }}
        >
          {TABS.map(tab => {
            const active = filter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => { setFilter(tab.value); setPage(1); }}
                className="relative flex-shrink-0 transition-colors"
                style={{
                  height: 44,
                  padding: '0 14px',
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  color: active ? C.teal : C.textDim,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = C.textMid; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = C.textDim; }}
                data-testid={`filter-status-${tab.value}`}
              >
                {tab.label}
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      backgroundColor: C.teal,
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                )}
              </button>
            );
          })}
          {/* Results count */}
          <span
            className="ml-auto pr-5 flex-shrink-0 tabular-nums"
            style={{ fontSize: 11, color: C.textDim, whiteSpace: 'nowrap' }}
          >
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ══ BODY: TABLE + RIGHT PANEL ═══════════════════════════════════ */}
        <div className="flex flex-1 min-h-0">

          {/* ── Table column ── */}
          <div
            className="flex-1 min-w-0 flex flex-col overflow-hidden"
            style={{ borderRight: `1px solid ${C.border}` }}
          >
            {/* Scrollable table body */}
            <div className="flex-1 overflow-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'inherit' }}>
                <thead>
                  <tr>
                    <th style={{ width: 16 }} />
                    {th('Order ID', 'left', 'pl-4')}
                    {th('Route')}
                    {th('Driver')}
                    {th('Vehicle', 'left', 'hidden md:table-cell')}
                    {th('Status')}
                    {th('Time', 'left', 'hidden sm:table-cell')}
                    {th('Amount', 'right', 'pr-4')}
                    <th style={{ width: 36, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, backgroundColor: C.pageBg, zIndex: 5 }} />
                  </tr>
                </thead>
                <tbody>
                  {jLd ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td />
                        {[1,2,3,4,5,6,7,8].map(j => (
                          <td key={j} className="px-3 py-4">
                            <div
                              className="h-3 rounded animate-pulse"
                              style={{ backgroundColor: C.border }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : paged.length > 0 ? (
                    paged.map((job, idx) => {
                      const even = idx % 2 === 0;
                      return (
                        <tr
                          key={job.id}
                          style={{
                            borderBottom: `1px solid ${C.border}`,
                            backgroundColor: even ? C.rowEven : C.rowOdd,
                            cursor: 'pointer',
                            transition: 'background-color 0.1s',
                          }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = C.rowHover)}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = even ? C.rowEven : C.rowOdd)}
                          data-testid={`row-job-${job.id}`}
                        >
                          {/* accent line */}
                          <td style={{ width: 3, padding: 0 }}>
                            <div style={{ width: 3, backgroundColor: (STATUS[job.status] ?? {}).color ?? 'transparent', height: '100%', minHeight: 48 }} />
                          </td>

                          {/* Order ID */}
                          <td className="pl-4 pr-3 py-4">
                            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: C.textHi, letterSpacing: '-0.01em' }}>
                              {job.trackingNumber}
                            </span>
                          </td>

                          {/* Route */}
                          <td className="px-3 py-4" style={{ maxWidth: 170 }}>
                            <div className="flex items-center gap-1.5" style={{ color: C.textMid, minWidth: 0 }}>
                              <span style={{ fontWeight: 500, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
                                {job.pickupPostcode}
                              </span>
                              <ArrowRight style={{ width: 10, height: 10, color: C.textDim, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
                                {job.deliveryPostcode}
                              </span>
                            </div>
                          </td>

                          {/* Driver */}
                          <td className="px-3 py-4" style={{ maxWidth: 130 }}>
                            <span style={{ fontSize: 12, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                              {getDriver(job.driverId ?? null)}
                            </span>
                          </td>

                          {/* Vehicle */}
                          <td className="px-3 py-4 hidden md:table-cell">
                            <span style={{ fontSize: 12, color: C.textDim, whiteSpace: 'nowrap' }}>
                              {fmtVehicle(job.vehicleType)}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-3 py-4">
                            <StatusDot status={job.status} />
                          </td>

                          {/* Time */}
                          <td className="px-3 py-4 hidden sm:table-cell">
                            <span style={{ fontSize: 12, color: C.textDim, whiteSpace: 'nowrap' }}>{fmtDate((job as any).createdAt)}</span>
                          </td>

                          {/* Amount */}
                          <td className="px-3 pr-4 py-4 text-right">
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.textHi, whiteSpace: 'nowrap' }}>{fmt(job.totalPrice)}</span>
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="flex items-center justify-center rounded opacity-0 transition-all"
                                  style={{ width: 24, height: 24, color: C.textDim, background: 'none', border: 'none', cursor: 'pointer' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = C.border; (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                                  data-testid={`button-job-actions-${job.id}`}
                                >
                                  <MoreHorizontal style={{ width: 14, height: 14 }} />
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
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9}>
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                          <Package style={{ width: 32, height: 32, color: C.textDim }} />
                          <p style={{ fontSize: 13, color: C.textMid }}>No jobs match your filter</p>
                          {(filter !== 'all' || search) && (
                            <button
                              style={{ fontSize: 12, color: C.teal, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                              onClick={() => { setFilter('all'); setSearch(''); setPage(1); }}
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

            {/* ── Pagination ── */}
            <div
              className="flex items-center justify-between flex-shrink-0"
              style={{ height: 44, padding: '0 20px', borderTop: `1px solid ${C.border}` }}
            >
              <span style={{ fontSize: 11, color: C.textDim, fontVariantNumeric: 'tabular-nums' }}>
                {filtered.length === 0 ? '0 results' : `${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE,filtered.length)} of ${filtered.length}`}
              </span>
              <div className="flex items-center gap-2">
                <PagBtn onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} testId="button-page-prev">
                  <ChevronLeft style={{ width: 13, height: 13 }} />
                </PagBtn>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textMid, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'center' }}>
                  {page}/{totalPages}
                </span>
                <PagBtn onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} testId="button-page-next">
                  <ChevronRight style={{ width: 13, height: 13 }} />
                </PagBtn>
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL ─────────────────────────────────────────────── */}
          <div
            className="hidden lg:flex flex-col flex-shrink-0 overflow-y-auto"
            style={{ width: 224, backgroundColor: C.pageBg }}
          >

            {/* Stats */}
            <PanelSection title="Overview">
              <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                {[
                  { n: stats?.todaysJobs ?? 0,    label: "Today's Jobs",   color: C.textHi },
                  { n: stats?.pendingJobs ?? 0,    label: 'Pending',        color: (stats?.pendingJobs ?? 0) > 0 ? C.amber : C.textHi },
                  { n: stats?.activeDrivers ?? 0,  label: 'Active Drivers', color: C.teal  },
                  { n: stats?.totalDrivers ?? 0,   label: 'Total Drivers',  color: C.textHi },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center justify-center py-3"
                    style={{
                      borderRight: i % 2 === 0 ? `1px solid ${C.border}` : undefined,
                      borderBottom: i < 2 ? `1px solid ${C.border}` : undefined,
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700, color: item.color, lineHeight: 1 }}>{item.n}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.09em', color: C.textDim, textTransform: 'uppercase', marginTop: 3 }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span style={{ fontSize: 11, color: C.textDim }}>Today's Revenue</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.textHi }}>{fmt(stats?.todayRevenue)}</span>
              </div>
            </PanelSection>

            {/* Driver Activity */}
            <PanelSection title="Driver Activity">
              {/* counts */}
              <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                {[
                  { n: activeDrivers.filter(d => deliveringIds.has(d.id)).length, label: 'Active', color: C.teal   },
                  { n: activeDrivers.filter(d => !deliveringIds.has(d.id)).length, label: 'Avail.',  color: C.textHi },
                  { n: (drivers?.filter(d => d.isActive === false) ?? []).length,  label: 'Offline', color: C.textDim },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center py-3"
                    style={{ borderRight: i < 2 ? `1px solid ${C.border}` : undefined }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: item.color }}>{item.n}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: C.textDim, textTransform: 'uppercase', marginTop: 3 }}>{item.label}</span>
                  </div>
                ))}
              </div>
              {/* driver list */}
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {activeDrivers.length === 0 ? (
                  <p style={{ padding: '12px 16px', fontSize: 11, color: C.textDim }}>No active drivers</p>
                ) : activeDrivers.slice(0, 12).map(d => {
                  const active = deliveringIds.has(d.id);
                  return (
                    <div
                      key={d.id}
                      className="flex items-center gap-2.5 transition-colors"
                      style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}` }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: active ? C.teal : C.textDim, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: C.textMid, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.fullName || d.vehicleRegistration || 'Driver'}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: active ? C.teal : C.textDim, flexShrink: 0 }}>
                        {active ? 'Active' : 'Avail'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </PanelSection>

            {/* Alerts */}
            <PanelSection title="Alerts" badge={totalAlerts}>
              {[
                unverified  > 0 && { label: `${unverified} driver${unverified>1?'s':''} unverified`,            href: '/admin/drivers',      color: C.rose  },
                pendingApps > 0 && { label: `${pendingApps} application${pendingApps>1?'s':''} pending`,          href: '/admin/applications', color: C.amber },
                pendingDocs > 0 && { label: `${pendingDocs} document${pendingDocs>1?'s':''} pending review`,      href: '/admin/documents',    color: C.amber },
              ].filter(Boolean).map((a: any, i) => (
                <Link href={a.href} key={i}>
                  <div
                    className="flex items-center gap-2.5 transition-colors"
                    style={{ padding: '9px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = C.panelBg)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
                    data-testid={`alert-item-${i}`}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: a.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.textMid, flex: 1, lineHeight: 1.4 }}>{a.label}</span>
                    <ArrowRight style={{ width: 10, height: 10, color: C.textDim, flexShrink: 0 }} />
                  </div>
                </Link>
              ))}
              {totalAlerts === 0 && (
                <div className="flex flex-col items-center gap-1.5 py-5">
                  <CheckCircle style={{ width: 16, height: 16, color: C.emerald }} />
                  <span style={{ fontSize: 11, color: C.textDim }}>All clear</span>
                </div>
              )}
            </PanelSection>

            {/* Pending document quick-review */}
            {pendingDocs > 0 && (
              <PanelSection title={`Pending Docs (${pendingDocs})`}>
                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(documents?.filter(d => d.status === 'pending') ?? []).slice(0, 3).map(doc => (
                    <div key={doc.id} className="flex items-center gap-2" data-testid={`doc-${doc.id}`}>
                      <span style={{ fontSize: 10, color: C.textMid, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.fileName}
                      </span>
                      <button
                        onClick={() => reviewMut.mutate({ id: doc.id, status: 'approved', reviewedBy: 'admin' })}
                        disabled={reviewMut.isPending}
                        style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: C.emerald, flexShrink: 0 }}
                        data-testid={`button-approve-doc-${doc.id}`}
                      >
                        <CheckCircle style={{ width: 13, height: 13 }} />
                      </button>
                      <button
                        onClick={() => reviewMut.mutate({ id: doc.id, status: 'rejected', reviewedBy: 'admin', reviewNotes: 'Rejected' })}
                        disabled={reviewMut.isPending}
                        style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: C.rose, flexShrink: 0 }}
                        data-testid={`button-reject-doc-${doc.id}`}
                      >
                        <XCircle style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ))}
                </div>
              </PanelSection>
            )}

            {/* Quick Actions */}
            <PanelSection title="Quick Actions">
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { href: '/admin/jobs/create',       icon: Plus,           label: 'Create Job',        badge: 0,          id: 'button-create-job'         },
                  { href: '/admin/jobs?filter=pending',icon: Truck,          label: 'Assign Driver',     badge: 0,          id: 'button-assign-driver'      },
                  { href: '/admin/applications',       icon: ClipboardCheck, label: 'Applications',      badge: pendingApps,id: 'button-driver-applications' },
                  { href: '/admin/map',                icon: MapPin,         label: 'Live Map',          badge: 0,          id: 'button-live-map'           },
                  { href: '/admin/documents',          icon: FileText,       label: 'Documents',         badge: pendingDocs,id: 'button-review-docs'        },
                  { href: '/admin/pricing',            icon: TrendingUp,     label: 'Pricing Settings',  badge: 0,          id: 'button-pricing-settings'   },
                ].map(item => (
                  <Link href={item.href} key={item.id}>
                    <div
                      className="flex items-center gap-2 rounded-md transition-colors"
                      style={{ padding: '7px 10px', border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: C.textMid }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.backgroundColor = C.panelBg;
                        el.style.borderColor = `${C.teal}55`;
                        el.style.color = C.textHi;
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.backgroundColor = 'transparent';
                        el.style.borderColor = C.border;
                        el.style.color = C.textMid;
                      }}
                      data-testid={item.id}
                    >
                      <item.icon style={{ width: 13, height: 13, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: C.amber }}>{item.badge}</span>
                      )}
                    </div>
                  </Link>
                ))}

                {/* WhatsApp */}
                <a href="https://wa.me/447482527001" target="_blank" rel="noopener noreferrer" data-testid="button-whatsapp">
                  <div
                    className="flex items-center gap-2 rounded-md transition-colors"
                    style={{ padding: '7px 10px', border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#25D366', marginTop: 4 }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = `#25D36610`;
                      (e.currentTarget as HTMLElement).style.borderColor = `#25D36640`;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      (e.currentTarget as HTMLElement).style.borderColor = C.border;
                    }}
                  >
                    <SiWhatsapp style={{ width: 13, height: 13, flexShrink: 0 }} />
                    WhatsApp Support
                  </div>
                </a>
              </div>
            </PanelSection>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
