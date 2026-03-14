import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Search, MapPin, User, Truck } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  failed: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const VEHICLE_LABELS: Record<string, string> = {
  motorbike: 'Motorbike',
  car: 'Car',
  small_van: 'Small Van',
  medium_van: 'Medium Van',
  large_van: 'Large Van',
  luton: 'Luton',
};

export default function SupervisorHistory() {
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: allJobs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/supervisor/history'],
    refetchInterval: 60000,
  });

  const filtered = (allJobs as any[]).filter((job: any) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (job.trackingNumber || '').toLowerCase().includes(q) ||
      (job.jobNumber || '').toLowerCase().includes(q) ||
      (job.pickupAddress || '').toLowerCase().includes(q) ||
      (job.deliveryAddress || '').toLowerCase().includes(q) ||
      (job.customerName || '').toLowerCase().includes(q) ||
      (job.driverName || '').toLowerCase().includes(q) ||
      (job.driverCode || '').toLowerCase().includes(q);
    const matchesVehicle = vehicleFilter === 'all' || job.vehicleType === vehicleFilter;
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesVehicle && matchesStatus;
  });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Job History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} completed job{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tracking number, address, driver..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-vehicle-filter">
                  <SelectValue placeholder="Vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {Object.entries(VEHICLE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-start gap-4 px-6 py-4 border-t animate-pulse">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-28 bg-muted rounded" />
                      <div className="h-3 w-52 bg-muted rounded" />
                      <div className="h-3 w-40 bg-muted rounded" />
                    </div>
                    <div className="h-5 w-20 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <History className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No completed jobs found.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((job: any) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-start gap-4 px-6 py-4"
                    data-testid={`row-job-${job.id}`}
                  >
                    <div className="flex-1 min-w-[200px] space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          #{job.trackingNumber || job.id?.slice(0, 8)}
                        </span>
                        {job.jobNumber && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {job.jobNumber}
                          </span>
                        )}
                        {job.isMultiDrop && (
                          <Badge variant="secondary" className="text-xs">Multi-drop</Badge>
                        )}
                      </div>

                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{job.pickupAddress} → {job.deliveryAddress}</span>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {job.customerName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {job.customerName}
                          </span>
                        )}
                        {job.driverName && (
                          <span className="flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            {job.driverName}
                            {job.driverCode && (
                              <span className="font-mono text-muted-foreground/70">({job.driverCode})</span>
                            )}
                          </span>
                        )}
                      </div>

                      {job.createdAt && (
                        <p className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Badge className={`text-xs capitalize ${STATUS_COLORS[job.status] || ''}`}>
                        {job.status}
                      </Badge>
                      {job.vehicleType && (
                        <Badge variant="outline" className="text-xs">
                          {VEHICLE_LABELS[job.vehicleType] || job.vehicleType.replace('_', ' ')}
                        </Badge>
                      )}
                      {job.totalPrice && (
                        <span className="text-sm font-semibold text-foreground">
                          £{Number(job.totalPrice).toFixed(2)}
                        </span>
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
