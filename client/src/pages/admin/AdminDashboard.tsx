import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Link, useLocation } from 'wouter';
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
  ExternalLink,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Users,
  PoundSterling,
  Activity,
  LayoutGrid,
  Calendar,
} from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';
import { Card, CardContent } from '@/components/ui/card';

const STATUS_COLORS: Record<string, string> = {
  delivered:            '#10B981',
  on_the_way_delivery:  '#38BDF8',
  on_the_way_pickup:    '#38BDF8',
  collected:            '#3B82F6',
  pending:              '#F59E0B',
  assigned:             '#8B5CF6',
  accepted:             '#8B5CF6',
  cancelled:            '#F43F5E',
  rejected:             '#F43F5E',
};

const STATUS_LABELS: Record<string, string> = {
  delivered:            'Delivered',
  on_the_way_delivery:  'En Route',
  on_the_way_pickup:    'To Pickup',
  collected:            'Collected',
  pending:              'Pending',
  assigned:             'Assigned',
  accepted:             'Accepted',
  cancelled:            'Cancelled',
  rejected:             'Rejected',
};

const toNum = (v: string | number | null | undefined): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return isNaN(n as number) ? 0 : (n as number);
};
const fmt  = (v: string | number | null | undefined) => `£${toNum(v).toFixed(2)}`;
const fmtK = (v: string | number | null | undefined) => {
  const n = toNum(v);
  return n >= 1000 ? `£${(n / 1000).toFixed(1)}k` : `£${n.toFixed(2)}`;
};

const fmtVehicle = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';

const fmtDate = (dt?: string | Date | null, includeTime = false) => {
  if (!dt) return '—';
  const d = new Date(dt as string);
  if (isNaN(d.getTime())) return '—';
  
  const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (!includeTime) return dateStr;
  
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
};

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'hsl(var(--muted-foreground))';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap"
      style={{ fontSize: 11, color, letterSpacing: '0.02em' }}
      data-testid={`badge-status-${status}`}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, flexShrink: 0, display: 'inline-block' }} />
      {label}
    </span>
  );
}

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

function PanelSection({ title, children, badge }: { title: string; children: React.ReactNode; badge?: number }) {
  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-muted-foreground/80 uppercase tracking-widest" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.13em' }}>
          {title}
        </span>
        {badge != null && badge > 0 && (
          <span
            className="flex items-center justify-center rounded-full text-white"
            style={{ width: 16, height: 16, fontSize: 8, fontWeight: 800, backgroundColor: '#F43F5E' }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function PagBtn({ onClick, disabled, children, testId }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode; testId: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded border border-border text-muted-foreground transition-all disabled:opacity-25 hover:border-primary hover:text-primary"
      style={{ width: 26, height: 26, backgroundColor: 'transparent' }}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  testId?: string;
}

function KpiCard({ icon: Icon, label, value, sub, accent, testId }: KpiCardProps) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-muted-foreground uppercase tracking-wider" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
              {label}
            </span>
            <span
              className="font-bold leading-none tabular-nums"
              style={{ fontSize: 26, color: accent ?? 'hsl(var(--foreground))' }}
            >
              {value}
            </span>
            {sub && (
              <span className="text-muted-foreground/80" style={{ fontSize: 11 }}>{sub}</span>
            )}
          </div>
          <div
            className="flex items-center justify-center rounded-lg flex-shrink-0"
            style={{
              width: 38,
              height: 38,
              background: accent ? `${accent}18` : 'hsl(var(--muted))',
            }}
          >
            <Icon style={{ width: 17, height: 17, color: accent ?? 'hsl(var(--muted-foreground))' }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PER_PAGE = 10;

export default function AdminDashboard() {
  const [, navigate] = useLocation();
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

  const activeDrivers  = drivers?.filter(d => d.isActive !== false) ?? [];
  const deliveringIds  = new Set(
    jobs?.filter(j =>
      ['on_the_way_delivery','on_the_way_pickup','collected','assigned','accepted'].includes(j.status) && j.driverId
    ).map(j => j.driverId!)
  );
  const onJobCount  = activeDrivers.filter(d => deliveringIds.has(d.id)).length;
  const availCount  = activeDrivers.filter(d => !deliveringIds.has(d.id)).length;

  return (
    <DashboardLayout>
      <div className="-m-3 sm:-m-4 lg:-m-6 flex flex-col bg-background" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>

        {/* ══ KPI CARDS ══════════════════════════════════════════════════════ */}
        <div className="px-5 pt-5 pb-4 border-b border-border bg-background">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-foreground" style={{ fontSize: 14 }} data-testid="text-page-title">
                Overview
              </span>
            </div>
            <div className="flex items-center gap-2">
              {totalAlerts > 0 && (
                <div
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{ backgroundColor: 'rgb(244 63 94 / 0.1)', border: '1px solid rgb(244 63 94 / 0.25)' }}
                  data-testid="alert-pending-actions"
                >
                  <AlertCircle style={{ width: 11, height: 11, color: '#F43F5E' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#F43F5E' }}>{totalAlerts} action{totalAlerts > 1 ? 's' : ''} needed</span>
                </div>
              )}
              <Link href="/admin/jobs/create">
                <button
                  className="flex items-center gap-1.5 rounded-md font-semibold text-primary-foreground bg-primary hover:brightness-110 active:brightness-90 transition-all"
                  style={{ height: 34, paddingLeft: 14, paddingRight: 14, fontSize: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  data-testid="button-new-job"
                >
                  <Plus style={{ width: 13, height: 13 }} />
                  New Job
                </button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={Package}
              label="Today's Jobs"
              value={stats?.todaysJobs ?? 0}
              sub={`${jobs?.filter(j => j.status === 'pending').length ?? 0} pending`}
              accent="hsl(var(--primary))"
              testId="kpi-todays-jobs"
            />
            <KpiCard
              icon={Users}
              label="Active Drivers"
              value={stats?.activeDrivers ?? 0}
              sub={`${onJobCount} on job · ${availCount} available`}
              accent="#10B981"
              testId="kpi-active-drivers"
            />
            <KpiCard
              icon={PoundSterling}
              label="Today's Revenue"
              value={fmtK(stats?.todayRevenue)}
              sub="customer price total"
              accent="#8B5CF6"
              testId="kpi-today-revenue"
            />
            <KpiCard
              icon={Activity}
              label="Pending Actions"
              value={totalAlerts}
              sub={[
                pendingApps > 0 && `${pendingApps} application${pendingApps > 1 ? 's' : ''}`,
                pendingDocs > 0 && `${pendingDocs} doc${pendingDocs > 1 ? 's' : ''}`,
                unverified  > 0 && `${unverified} unverified`,
              ].filter(Boolean).join(' · ') || 'All clear'}
              accent={totalAlerts > 0 ? '#F43F5E' : '#10B981'}
              testId="kpi-pending-actions"
            />
          </div>
        </div>

        {/* ══ TOOLBAR ════════════════════════════════════════════════════════ */}
        <div className="sticky top-0 z-30 flex items-center gap-4 px-5 flex-shrink-0 bg-background border-b border-border" style={{ height: 48 }}>
          <span className="text-foreground whitespace-nowrap" style={{ fontSize: 13, fontWeight: 600 }}>
            Jobs
          </span>
          <div className="relative flex-1 max-w-sm hidden sm:block">
            <Search className="absolute text-muted-foreground/80" style={{ left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13 }} />
            <input
              className="w-full bg-card border border-border text-muted-foreground rounded-md outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
              style={{ height: 32, paddingLeft: 32, paddingRight: 12, fontSize: 12, fontFamily: 'inherit' }}
              placeholder="Search tracking ID, postcode, driver…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              data-testid="input-global-search"
            />
          </div>
          <div className="flex-1" />
        </div>

        {/* ══ FILTER BAR ═════════════════════════════════════════════════════ */}
        <div
          className="sticky z-20 flex items-center flex-shrink-0 overflow-x-auto bg-background border-b border-border"
          style={{ top: 48, height: 44, paddingLeft: 4 }}
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
                  color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.8)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
                data-testid={`filter-status-${tab.value}`}
              >
                {tab.label}
                {active && (
                  <span
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 2, backgroundColor: 'hsl(var(--primary))', borderRadius: '2px 2px 0 0' }}
                  />
                )}
              </button>
            );
          })}
          <span
            className="ml-auto pr-5 flex-shrink-0 tabular-nums text-muted-foreground/80"
            style={{ fontSize: 11, whiteSpace: 'nowrap' }}
          >
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ══ BODY: TABLE + RIGHT PANEL ══════════════════════════════════════ */}
        <div className="flex flex-1 min-h-0">

          {/* ── Table column ── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-border">
            <div className="flex-1 overflow-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'inherit' }}>
                <thead>
                  <tr>
                    <th style={{ width: 3 }} />
                    {(['Order ID', 'Route', 'Driver', 'Vehicle', 'Status', 'Date', 'Amount'] as const).map((label) => (
                      <th
                        key={label}
                        className={`py-3 px-3 whitespace-nowrap text-muted-foreground/80 uppercase bg-background border-b border-border sticky top-0 z-[5] ${label === 'Vehicle' ? 'hidden md:table-cell' : ''} ${label === 'Date' ? 'hidden sm:table-cell' : ''} ${label === 'Amount' ? 'pr-4' : ''} ${label === 'Order ID' ? 'pl-4' : ''}`}
                        style={{ textAlign: label === 'Amount' ? 'right' : 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}
                      >
                        {label}
                      </th>
                    ))}
                    <th className="border-b border-border bg-background sticky top-0 z-[5]" style={{ width: 36 }} />
                  </tr>
                </thead>
                <tbody>
                  {jLd ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td />
                        {[1,2,3,4,5,6,7,8].map(j => (
                          <td key={j} className="px-3 py-4">
                            <div className="h-3 rounded animate-pulse bg-border" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : paged.length > 0 ? (
                    paged.map((job) => {
                      const statusColor = STATUS_COLORS[job.status] ?? 'transparent';
                      return (
                        <tr
                          key={job.id}
                          className="border-b border-border hover:bg-card cursor-pointer transition-colors"
                          onClick={() => navigate(`/admin/jobs?track=${encodeURIComponent(job.trackingNumber)}`)}
                          data-testid={`row-job-${job.id}`}
                        >
                          <td style={{ width: 3, padding: 0 }}>
                            <div style={{ width: 3, backgroundColor: statusColor, height: '100%', minHeight: 48 }} />
                          </td>

                          <td className="pl-4 pr-3 py-4">
                            <span className="text-foreground font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.01em' }}>
                              {job.trackingNumber}
                            </span>
                          </td>

                          <td className="px-3 py-4" style={{ maxWidth: 170 }}>
                            <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                              <span className="font-medium truncate flex-shrink" style={{ fontSize: 12 }}>{job.pickupPostcode}</span>
                              <ArrowRight className="text-muted-foreground/60 flex-shrink-0" style={{ width: 10, height: 10 }} />
                              <span className="text-muted-foreground/80 truncate flex-shrink" style={{ fontSize: 12 }}>{job.deliveryPostcode}</span>
                            </div>
                          </td>

                          <td className="px-3 py-4" style={{ maxWidth: 130 }}>
                            <span className="text-muted-foreground block truncate" style={{ fontSize: 12 }}>
                              {getDriver(job.driverId ?? null)}
                            </span>
                          </td>

                          <td className="px-3 py-4 hidden md:table-cell">
                            <span className="text-muted-foreground/80 whitespace-nowrap" style={{ fontSize: 12 }}>
                              {fmtVehicle(job.vehicleType)}
                            </span>
                          </td>

                          <td className="px-3 py-4">
                            <StatusDot status={job.status} />
                          </td>

                          <td className="px-3 py-4 hidden sm:table-cell">
                            {job.isScheduled && job.scheduledPickupTime ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-cyan-600 font-bold flex items-center gap-1" style={{ fontSize: 11 }}>
                                  <Calendar style={{ width: 10, height: 10 }} />
                                  {fmtDate(job.scheduledPickupTime, true)}
                                </span>
                                <span className="text-muted-foreground/60" style={{ fontSize: 9 }}>Created {fmtDate(job.createdAt)}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/80 whitespace-nowrap" style={{ fontSize: 12 }}>{fmtDate(job.createdAt)}</span>
                            )}
                          </td>

                          <td className="px-3 pr-4 py-4 text-right">
                            <span className="text-foreground whitespace-nowrap" style={{ fontSize: 13, fontWeight: 700 }}>{fmt(job.totalPrice)}</span>
                          </td>

                          <td className="px-2 py-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/jobs?track=${encodeURIComponent(job.trackingNumber)}`);
                              }}
                              className="flex items-center justify-center rounded border border-transparent text-muted-foreground/60 hover:border-border hover:text-primary hover:bg-primary/10 transition-all"
                              style={{ width: 28, height: 28, background: 'none', cursor: 'pointer' }}
                              title="View job details"
                              data-testid={`button-job-actions-${job.id}`}
                            >
                              <ExternalLink style={{ width: 13, height: 13 }} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9}>
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                          <Package className="text-muted-foreground/60" style={{ width: 32, height: 32 }} />
                          <p className="text-muted-foreground" style={{ fontSize: 13 }}>No jobs match your filter</p>
                          {(filter !== 'all' || search) && (
                            <button
                              className="text-primary hover:underline underline-offset-2"
                              style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}
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
            <div className="flex items-center justify-between flex-shrink-0 border-t border-border" style={{ height: 44, padding: '0 20px' }}>
              <span className="text-muted-foreground/80 tabular-nums" style={{ fontSize: 11 }}>
                {filtered.length === 0 ? '0 results' : `${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE,filtered.length)} of ${filtered.length}`}
              </span>
              <div className="flex items-center gap-2">
                <PagBtn onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} testId="button-page-prev">
                  <ChevronLeft style={{ width: 13, height: 13 }} />
                </PagBtn>
                <span className="text-muted-foreground tabular-nums text-center" style={{ fontSize: 12, fontWeight: 600, minWidth: 28 }}>
                  {page}/{totalPages}
                </span>
                <PagBtn onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} testId="button-page-next">
                  <ChevronRight style={{ width: 13, height: 13 }} />
                </PagBtn>
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
          <div className="hidden lg:flex flex-col flex-shrink-0 overflow-y-auto bg-background" style={{ width: 220 }}>

            {/* Driver Activity */}
            <PanelSection title="Driver Activity">
              <div className="grid grid-cols-3 border-b border-border">
                {[
                  { n: onJobCount,                                                    label: 'Active',  accent: 'hsl(var(--primary))' },
                  { n: availCount,                                                    label: 'Avail.',  accent: 'hsl(var(--foreground))' },
                  { n: (drivers?.filter(d => d.isActive === false) ?? []).length,     label: 'Offline', accent: 'hsl(var(--muted-foreground) / 0.6)' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`flex flex-col items-center py-3 ${i < 2 ? 'border-r border-border' : ''}`}
                  >
                    <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: item.accent }}>{item.n}</span>
                    <span className="text-muted-foreground/70 uppercase" style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', marginTop: 3 }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {activeDrivers.length === 0 ? (
                  <p className="text-muted-foreground/70" style={{ padding: '12px 16px', fontSize: 11 }}>No active drivers</p>
                ) : activeDrivers.slice(0, 12).map(d => {
                  const active = deliveringIds.has(d.id);
                  return (
                    <div
                      key={d.id}
                      className="flex items-center gap-2.5 border-b border-border"
                      style={{ padding: '7px 16px' }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.5)', flexShrink: 0 }} />
                      <span className="text-muted-foreground flex-1 truncate" style={{ fontSize: 11 }}>
                        {d.fullName || d.vehicleRegistration || 'Driver'}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.6)', flexShrink: 0 }}>
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
                unverified  > 0 && { label: `${unverified} driver${unverified>1?'s':''} unverified`,       href: '/admin/drivers',      color: '#F43F5E' },
                pendingApps > 0 && { label: `${pendingApps} application${pendingApps>1?'s':''} pending`,    href: '/admin/applications', color: '#F59E0B' },
                pendingDocs > 0 && { label: `${pendingDocs} document${pendingDocs>1?'s':''} pending review`,href: '/admin/documents',    color: '#F59E0B' },
              ].filter(Boolean).map((a: any, i) => (
                <Link href={a.href} key={i}>
                  <div
                    className="flex items-center gap-2.5 border-b border-border hover:bg-card transition-colors cursor-pointer"
                    style={{ padding: '9px 16px' }}
                    data-testid={`alert-item-${i}`}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: a.color, flexShrink: 0 }} />
                    <span className="text-muted-foreground flex-1" style={{ fontSize: 11, lineHeight: 1.4 }}>{a.label}</span>
                    <ArrowRight className="text-muted-foreground/60 flex-shrink-0" style={{ width: 10, height: 10 }} />
                  </div>
                </Link>
              ))}
              {totalAlerts === 0 && (
                <div className="flex flex-col items-center gap-1.5 py-5">
                  <CheckCircle style={{ width: 16, height: 16, color: '#10B981' }} />
                  <span className="text-muted-foreground/70" style={{ fontSize: 11 }}>All clear</span>
                </div>
              )}
            </PanelSection>

            {/* Pending document quick-review */}
            {pendingDocs > 0 && (
              <PanelSection title={`Pending Docs (${pendingDocs})`}>
                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(documents?.filter(d => d.status === 'pending') ?? []).slice(0, 3).map(doc => (
                    <div key={doc.id} className="flex items-center gap-2" data-testid={`doc-${doc.id}`}>
                      <span className="text-muted-foreground flex-1 truncate" style={{ fontSize: 10 }}>
                        {doc.fileName}
                      </span>
                      <button
                        onClick={() => reviewMut.mutate({ id: doc.id, status: 'approved', reviewedBy: 'admin' })}
                        disabled={reviewMut.isPending}
                        style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#10B981', flexShrink: 0 }}
                        data-testid={`button-approve-doc-${doc.id}`}
                      >
                        <CheckCircle style={{ width: 13, height: 13 }} />
                      </button>
                      <button
                        onClick={() => reviewMut.mutate({ id: doc.id, status: 'rejected', reviewedBy: 'admin', reviewNotes: 'Rejected' })}
                        disabled={reviewMut.isPending}
                        style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#F43F5E', flexShrink: 0 }}
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
                  { href: '/admin/jobs/create',         icon: Plus,           label: 'Create Job',       badge: 0,           id: 'button-create-job'          },
                  { href: '/admin/jobs?filter=pending',  icon: Truck,          label: 'Assign Driver',    badge: 0,           id: 'button-assign-driver'       },
                  { href: '/admin/applications',         icon: ClipboardCheck, label: 'Applications',     badge: pendingApps, id: 'button-driver-applications' },
                  { href: '/admin/map',                  icon: MapPin,         label: 'Live Map',         badge: 0,           id: 'button-live-map'            },
                  { href: '/admin/documents',            icon: FileText,       label: 'Documents',        badge: pendingDocs, id: 'button-review-docs'         },
                  { href: '/admin/pricing',              icon: TrendingUp,     label: 'Pricing Settings', badge: 0,           id: 'button-pricing-settings'    },
                ].map(item => (
                  <Link href={item.href} key={item.id}>
                    <div
                      className="flex items-center gap-2 rounded-md border border-border text-muted-foreground hover:bg-card hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer"
                      style={{ padding: '7px 10px', fontSize: 12, fontWeight: 500 }}
                      data-testid={item.id}
                    >
                      <item.icon style={{ width: 13, height: 13, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#F59E0B' }}>{item.badge}</span>
                      )}
                    </div>
                  </Link>
                ))}

                <a href="https://wa.me/447482527001" target="_blank" rel="noopener noreferrer" data-testid="button-whatsapp" style={{ marginTop: 4 }}>
                  <div
                    className="flex items-center gap-2 rounded-md border border-border transition-colors cursor-pointer hover:bg-[#25D366]/10 hover:border-[#25D366]/40"
                    style={{ padding: '7px 10px', fontSize: 12, fontWeight: 500, color: '#25D366' }}
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
