import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Plus, Search, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  assigned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  offered: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  accepted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  on_the_way_pickup: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  collected: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  on_the_way_delivery: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  offered: 'Offered',
  accepted: 'Accepted',
  on_the_way_pickup: 'En Route Pickup',
  collected: 'Collected',
  on_the_way_delivery: 'En Route Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export default function SupervisorJobs() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: jobs = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ['/api/supervisor/jobs'],
    refetchInterval: 30000,
  });

  const filtered = jobs.filter((job: any) => {
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || (
      (job.trackingNumber || '').toLowerCase().includes(q) ||
      (job.pickupAddress || '').toLowerCase().includes(q) ||
      (job.deliveryAddress || '').toLowerCase().includes(q) ||
      (job.customerName || '').toLowerCase().includes(q)
    );
    return matchesStatus && matchesSearch;
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
            <p className="text-sm text-muted-foreground mt-1">{filtered.length} job{filtered.length !== 1 ? 's' : ''} shown</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="default" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setLocation('/supervisor/jobs/create')} data-testid="button-create-job">
              <Plus className="h-4 w-4 mr-2" />
              Create Job
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tracking number, address, customer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 border-t animate-pulse">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="flex-1 h-4 bg-muted rounded" />
                    <div className="h-5 w-16 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Package className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No jobs found.</p>
                <Button variant="outline" onClick={() => setLocation('/supervisor/jobs/create')} data-testid="button-create-first-job">
                  <Plus className="h-4 w-4 mr-2" />
                  Create a Job
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((job: any) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-start gap-3 px-6 py-4 hover-elevate"
                    data-testid={`row-job-${job.id}`}
                  >
                    <div className="flex-1 min-w-[200px] space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          #{job.trackingNumber || job.jobNumber || job.id?.slice(0, 8)}
                        </span>
                        {job.isMultiDrop && (
                          <Badge variant="secondary" className="text-xs">Multi-drop</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {job.pickupAddress} → {job.deliveryAddress}
                      </p>
                      {job.customerName && (
                        <p className="text-xs text-muted-foreground">Customer: {job.customerName}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Badge className={`text-xs ${STATUS_COLORS[job.status] || ''}`}>
                        {STATUS_LABELS[job.status] || job.status}
                      </Badge>
                      {job.vehicleType && (
                        <Badge variant="outline" className="text-xs capitalize">{job.vehicleType.replace('_', ' ')}</Badge>
                      )}
                      {job.totalPrice && (
                        <span className="text-xs font-medium text-foreground">£{Number(job.totalPrice).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
