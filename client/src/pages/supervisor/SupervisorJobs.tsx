import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Package, Plus, Search, RefreshCw, UserX, UserCheck, Loader2, AlertTriangle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/queryClient';

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

const MANAGEABLE_STATUSES = ['pending', 'assigned', 'offered', 'accepted', 'on_the_way_pickup', 'collected', 'on_the_way_delivery'];

export default function SupervisorJobs() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [manageJob, setManageJob] = useState<any>(null);
  const [newDriverId, setNewDriverId] = useState('');
  const [newDriverPrice, setNewDriverPrice] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const { data: jobs = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ['/api/supervisor/jobs'],
    refetchInterval: 30000,
  });

  const { data: drivers = [] } = useQuery<any[]>({
    queryKey: ['/api/drivers'],
  });

  const activeDrivers = (drivers as any[]).filter((d: any) => d.isActive !== false && d.isVerified);

  const withdrawMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest('PATCH', `/api/jobs/${jobId}/unassign`, {
        adminUserId: user?.id || 'supervisor',
        reason: 'Withdrawn by supervisor',
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      toast({ title: 'Driver withdrawn', description: 'The job is now available for reassignment.' });
      setConfirmWithdraw(false);
      if (manageJob) {
        setManageJob((prev: any) => ({ ...prev, driverId: null, status: 'pending' }));
      }
    },
    onError: (err: any) => {
      toast({ title: 'Failed to withdraw driver', description: err?.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ jobId, driverId, driverPrice }: { jobId: string; driverId: string; driverPrice: string }) => {
      const res = await apiRequest('PATCH', `/api/jobs/${jobId}/assign`, {
        driverId,
        driverPrice,
        dispatcherId: user?.id || null,
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      toast({ title: 'Driver assigned', description: 'The job has been assigned successfully.' });
      setManageJob(null);
      setNewDriverId('');
      setNewDriverPrice('');
    },
    onError: (err: any) => {
      toast({ title: 'Failed to assign driver', description: err?.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const openManage = (job: any) => {
    setManageJob(job);
    setNewDriverId('');
    setNewDriverPrice('');
    setConfirmWithdraw(false);
  };

  const closeManage = () => {
    setManageJob(null);
    setNewDriverId('');
    setNewDriverPrice('');
    setConfirmWithdraw(false);
  };

  const handleAssign = () => {
    if (!manageJob || !newDriverId || !newDriverPrice) return;
    const price = parseFloat(newDriverPrice);
    if (isNaN(price) || price <= 0) {
      toast({ title: 'Invalid price', description: 'Enter a valid driver price greater than 0.', variant: 'destructive' });
      return;
    }
    assignMutation.mutate({ jobId: manageJob.id, driverId: newDriverId, driverPrice: newDriverPrice });
  };

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

  const currentDriver = manageJob?.driverId
    ? activeDrivers.find((d: any) => d.id === manageJob.driverId) || null
    : null;

  const jobHasDriver = manageJob?.driverId && ['assigned', 'offered', 'accepted', 'on_the_way_pickup', 'collected', 'on_the_way_delivery'].includes(manageJob?.status);

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
                    className="flex flex-wrap items-center gap-3 px-6 py-4"
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
                      {MANAGEABLE_STATUSES.includes(job.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openManage(job)}
                          data-testid={`button-manage-${job.id}`}
                        >
                          {job.driverId ? 'Manage Driver' : 'Assign Driver'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manage Driver Dialog */}
      <Dialog open={!!manageJob} onOpenChange={(open) => { if (!open) closeManage(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Driver</DialogTitle>
            <DialogDescription>
              Job #{manageJob?.trackingNumber || manageJob?.id?.slice(0, 8)} —{' '}
              <Badge className={`text-xs ${STATUS_COLORS[manageJob?.status] || ''}`}>
                {STATUS_LABELS[manageJob?.status] || manageJob?.status}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p className="truncate">{manageJob?.pickupAddress}</p>
              <p className="truncate text-muted-foreground/60">→ {manageJob?.deliveryAddress}</p>
            </div>

            {jobHasDriver && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Current Driver</p>
                  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {currentDriver
                          ? `${currentDriver.firstName || ''} ${currentDriver.lastName || ''}`.trim() || currentDriver.driverCode
                          : manageJob?.driverId?.slice(0, 8) + '…'}
                      </p>
                      {currentDriver?.driverCode && (
                        <p className="text-xs text-muted-foreground">{currentDriver.driverCode}</p>
                      )}
                    </div>
                    {!confirmWithdraw ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmWithdraw(true)}
                        data-testid="button-confirm-withdraw"
                      >
                        <UserX className="h-4 w-4 mr-1.5" />
                        Withdraw
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => withdrawMutation.mutate(manageJob.id)}
                          disabled={withdrawMutation.isPending}
                          data-testid="button-confirm-withdraw-yes"
                        >
                          {withdrawMutation.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : 'Confirm'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmWithdraw(false)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  {confirmWithdraw && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>This will remove the driver and reset the job to Pending. The driver will be notified.</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {(!jobHasDriver || !manageJob?.driverId) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {jobHasDriver ? 'Reassign to Another Driver' : 'Assign Driver'}
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="driver-select">Driver</Label>
                    <Select value={newDriverId} onValueChange={setNewDriverId}>
                      <SelectTrigger id="driver-select" data-testid="select-driver">
                        <SelectValue placeholder="Select a driver…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeDrivers.length === 0 ? (
                          <SelectItem value="_none" disabled>No active drivers available</SelectItem>
                        ) : (
                          activeDrivers.map((d: any) => (
                            <SelectItem key={d.id} value={d.id}>
                              {`${d.firstName || ''} ${d.lastName || ''}`.trim() || d.driverCode} {d.driverCode ? `(${d.driverCode})` : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="driver-price">Driver Price (£)</Label>
                    <Input
                      id="driver-price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="e.g. 25.00"
                      value={newDriverPrice}
                      onChange={(e) => setNewDriverPrice(e.target.value)}
                      data-testid="input-driver-price"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleAssign}
                    disabled={!newDriverId || !newDriverPrice || assignMutation.isPending}
                    data-testid="button-assign-driver"
                  >
                    {assignMutation.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Assigning…</>
                      : <><UserCheck className="h-4 w-4 mr-2" />Assign Driver</>}
                  </Button>
                </div>
              </>
            )}

            {jobHasDriver && manageJob?.driverId && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Reassign to Another Driver</p>
                  <p className="text-xs text-muted-foreground">
                    First withdraw from the current driver above, then assign a new one — or assign directly to override.
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="driver-select-reassign">New Driver</Label>
                    <Select value={newDriverId} onValueChange={setNewDriverId}>
                      <SelectTrigger id="driver-select-reassign" data-testid="select-driver-reassign">
                        <SelectValue placeholder="Select a driver…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeDrivers
                          .filter((d: any) => d.id !== manageJob?.driverId)
                          .map((d: any) => (
                            <SelectItem key={d.id} value={d.id}>
                              {`${d.firstName || ''} ${d.lastName || ''}`.trim() || d.driverCode} {d.driverCode ? `(${d.driverCode})` : ''}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="driver-price-reassign">Driver Price (£)</Label>
                    <Input
                      id="driver-price-reassign"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="e.g. 25.00"
                      value={newDriverPrice}
                      onChange={(e) => setNewDriverPrice(e.target.value)}
                      data-testid="input-driver-price-reassign"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleAssign}
                    disabled={!newDriverId || !newDriverPrice || assignMutation.isPending}
                    data-testid="button-reassign-driver"
                  >
                    {assignMutation.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Reassigning…</>
                      : <><UserCheck className="h-4 w-4 mr-2" />Reassign Driver</>}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
