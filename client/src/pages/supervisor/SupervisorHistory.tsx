import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Search } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  failed: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

export default function SupervisorHistory() {
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');

  const { data: allJobs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/supervisor/history'],
  });

  const completedJobs = allJobs as any[];

  const filtered = completedJobs.filter((job: any) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || (
      (job.trackingNumber || '').toLowerCase().includes(q) ||
      (job.pickupAddress || '').toLowerCase().includes(q) ||
      (job.deliveryAddress || '').toLowerCase().includes(q) ||
      (job.customerName || '').toLowerCase().includes(q)
    );
    const matchesVehicle = vehicleFilter === 'all' || job.vehicleType === vehicleFilter;
    return matchesSearch && matchesVehicle;
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Job History</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} completed job{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tracking number, address..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-vehicle-filter">
                  <SelectValue placeholder="Vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  <SelectItem value="motorbike">Motorbike</SelectItem>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="small_van">Small Van</SelectItem>
                  <SelectItem value="medium_van">Medium Van</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 border-t animate-pulse">
                    <div className="flex-1 space-y-1">
                      <div className="h-4 w-28 bg-muted rounded" />
                      <div className="h-3 w-52 bg-muted rounded" />
                    </div>
                    <div className="h-5 w-16 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <History className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No completed jobs yet.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((job: any) => (
                  <div key={job.id} className="flex flex-wrap items-start gap-3 px-6 py-4" data-testid={`row-job-${job.id}`}>
                    <div className="flex-1 min-w-[180px] space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          #{job.trackingNumber || job.id?.slice(0, 8)}
                        </span>
                        {job.isMultiDrop && <Badge variant="secondary" className="text-xs">Multi-drop</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {job.pickupAddress} → {job.deliveryAddress}
                      </p>
                      {job.customerName && (
                        <p className="text-xs text-muted-foreground">Customer: {job.customerName}</p>
                      )}
                      {job.createdAt && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(job.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Badge className={`text-xs ${STATUS_COLORS[job.status] || ''}`}>
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </Badge>
                      {job.totalPrice && (
                        <span className="text-xs font-medium text-foreground">£{Number(job.totalPrice).toFixed(2)}</span>
                      )}
                      {job.vehicleType && (
                        <Badge variant="outline" className="text-xs capitalize">{job.vehicleType.replace('_', ' ')}</Badge>
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
