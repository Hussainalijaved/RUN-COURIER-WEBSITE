import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  UserPlus,
  XCircle,
  MapPin,
  Package,
  Loader2,
  Plus,
  Edit3,
  Save,
  Printer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ShippingLabel } from '@/components/ShippingLabel';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import type { Job, Driver, JobStatus } from '@shared/schema';

// Type for drivers from Supabase
interface SupabaseDriver {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  driverCode: string | null;
  createdAt: string;
}

const JOB_STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'on_the_way_pickup', label: 'On the Way to Pickup' },
  { value: 'arrived_pickup', label: 'Arrived at Pickup' },
  { value: 'collected', label: 'Collected' },
  { value: 'on_the_way_delivery', label: 'On the Way to Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const getStatusBadge = (status: JobStatus) => {
  const statusConfig: Record<JobStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-yellow-500' },
    assigned: { label: 'Assigned', className: 'bg-blue-400' },
    accepted: { label: 'Accepted', className: 'bg-blue-500' },
    on_the_way_pickup: { label: 'To Pickup', className: 'bg-indigo-500' },
    arrived_pickup: { label: 'At Pickup', className: 'bg-purple-500' },
    collected: { label: 'Collected', className: 'bg-cyan-500' },
    on_the_way_delivery: { label: 'Delivering', className: 'bg-blue-600' },
    delivered: { label: 'Delivered', className: 'bg-green-500' },
    cancelled: { label: 'Cancelled', className: 'bg-red-500' },
  };
  const config = statusConfig[status] || { label: status, className: 'bg-gray-500' };
  return <Badge className={`${config.className} text-white`} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
};

export default function AdminJobs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [jobToEdit, setJobToEdit] = useState<Job | null>(null);
  const [editStatus, setEditStatus] = useState<JobStatus>('pending');
  const [editDriverId, setEditDriverId] = useState<string>('');
  const [editTotalPrice, setEditTotalPrice] = useState<string>('');
  const [editDriverPrice, setEditDriverPrice] = useState<string>('');
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [jobForLabel, setJobForLabel] = useState<Job | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const labelRef = useRef<HTMLDivElement>(null);
  const prevJobCountRef = useRef<number>(0);
  const { toast } = useToast();
  const { playAlert, playNotification } = useNotificationSound({ enabled: soundEnabled, volume: 0.7 });

  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 30000, // Poll every 30 seconds for new jobs
  });

  // Detect new jobs and play sound
  useEffect(() => {
    if (!jobs) return;
    
    const currentCount = jobs.length;
    const prevCount = prevJobCountRef.current;
    
    // Only play sound if this isn't the initial load and we have more jobs
    if (prevCount > 0 && currentCount > prevCount) {
      const newJobCount = currentCount - prevCount;
      playAlert();
      toast({
        title: `${newJobCount} New Job${newJobCount > 1 ? 's' : ''} Received!`,
        description: 'A new delivery request has come in.',
      });
    }
    
    prevJobCountRef.current = currentCount;
  }, [jobs, playAlert, toast]);

  // Fetch drivers from local storage (for vehicle info)
  const { data: drivers } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  // Fetch drivers from Supabase (for names)
  const { data: supabaseDrivers } = useQuery<SupabaseDriver[]>({
    queryKey: ['/api/supabase-drivers'],
  });

  const assignDriverMutation = useMutation({
    mutationFn: async ({ jobId, driverId }: { jobId: string; driverId: string }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/assign`, { driverId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ title: 'Driver assigned successfully' });
      setAssignDialogOpen(false);
      setJobToAssign(null);
    },
    onError: () => {
      toast({ title: 'Failed to assign driver', variant: 'destructive' });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/status`, { status: 'cancelled' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ title: 'Job cancelled' });
    },
    onError: () => {
      toast({ title: 'Failed to cancel job', variant: 'destructive' });
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: async ({ jobId, updates }: { jobId: string; updates: Partial<Job> }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ title: 'Job updated successfully' });
      setEditDialogOpen(false);
      setJobToEdit(null);
    },
    onError: () => {
      toast({ title: 'Failed to update job', variant: 'destructive' });
    },
  });

  const openEditDialog = (job: Job) => {
    setJobToEdit(job);
    setEditStatus(job.status);
    setEditDriverId(job.driverId || 'unassigned');
    setEditTotalPrice(job.totalPrice?.toString() || '0');
    setEditDriverPrice(job.driverPrice?.toString() || '');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!jobToEdit) return;

    const updates: Partial<Job> = {
      status: editStatus,
      totalPrice: editTotalPrice,
      driverPrice: editDriverPrice || null,
    };

    if (editDriverId !== 'unassigned' && editDriverId !== jobToEdit.driverId) {
      updates.driverId = editDriverId;
      if (editStatus === 'pending') {
        updates.status = 'assigned';
      }
    } else if (editDriverId === 'unassigned' && jobToEdit.driverId) {
      updates.driverId = null;
      if (editStatus === 'assigned') {
        updates.status = 'pending';
      }
    }

    updateJobMutation.mutate({ jobId: jobToEdit.id, updates });
  };

  const filteredJobs = jobs?.filter((job) => {
    const matchesSearch =
      job.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.pickupPostcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.deliveryPostcode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '—';
    // First try Supabase drivers for the code and name
    const supabaseDriver = supabaseDrivers?.find((d) => d.id === driverId);
    if (supabaseDriver) {
      const code = supabaseDriver.driverCode || '';
      const name = supabaseDriver.fullName || 'Unknown';
      return code ? `${code} · ${name}` : name;
    }
    // Fall back to local drivers
    const driver = drivers?.find((d) => d.id === driverId);
    if (driver) {
      const code = driver.driverCode || '';
      return code ? `${code} · ${driver.vehicleRegistration || 'Driver'}` : driver.vehicleRegistration || 'Driver';
    }
    return driverId.substring(0, 8) + '...';
  };

  // Get driver code only
  const getDriverCode = (driverId: string | null) => {
    if (!driverId) return null;
    const supabaseDriver = supabaseDrivers?.find((d) => d.id === driverId);
    if (supabaseDriver?.driverCode) return supabaseDriver.driverCode;
    const driver = drivers?.find((d) => d.id === driverId);
    return driver?.driverCode || null;
  };

  // Get driver info combining Supabase (name) and local (vehicle) data
  const getDriverInfo = (driverId: string) => {
    const supabaseDriver = supabaseDrivers?.find((d) => d.id === driverId);
    const localDriver = drivers?.find((d) => d.id === driverId);
    return {
      name: supabaseDriver?.fullName || 'Unknown',
      email: supabaseDriver?.email || '',
      phone: supabaseDriver?.phone || localDriver?.phone || '',
      driverCode: supabaseDriver?.driverCode || localDriver?.driverCode || null,
      vehicleType: localDriver?.vehicleType || 'car',
      vehicleRegistration: localDriver?.vehicleRegistration || '',
      isVerified: localDriver?.isVerified || false,
      isAvailable: localDriver?.isAvailable || false,
    };
  };

  // Combine Supabase drivers with local driver data
  const allDriversWithInfo = supabaseDrivers?.map(sd => {
    const localInfo = getDriverInfo(sd.id);
    return {
      id: sd.id,
      name: sd.fullName,
      email: sd.email,
      phone: sd.phone || localInfo.phone,
      driverCode: sd.driverCode || localInfo.driverCode,
      vehicleType: localInfo.vehicleType,
      vehicleRegistration: localInfo.vehicleRegistration,
      isVerified: localInfo.isVerified,
      isAvailable: localInfo.isAvailable,
    };
  }) || [];

  const availableDrivers = drivers?.filter((d) => d.isAvailable && d.isVerified) || [];
  const allDrivers = drivers || [];

  const formatPrice = (price: string | number | null | undefined) => {
    if (price === null || price === undefined) return '—';
    const num = typeof price === 'string' ? parseFloat(price) : price;
    return `£${num.toFixed(2)}`;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openLabelDialog = (job: Job) => {
    setJobForLabel(job);
    setLabelDialogOpen(true);
  };

  const handlePrintLabel = () => {
    if (!labelRef.current) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Please allow popups to print labels', variant: 'destructive' });
      return;
    }

    const labelContent = labelRef.current.innerHTML;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shipping Label - ${jobForLabel?.trackingNumber}</title>
          <style>
            @page {
              size: 4in 6in;
              margin: 0;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .label-container {
              width: 4in;
              height: 6in;
              padding: 0.25in;
              background: white;
            }
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .items-center { align-items: center; }
            .justify-center { justify-content: center; }
            .justify-between { justify-content: space-between; }
            .gap-1 { gap: 0.25rem; }
            .gap-2 { gap: 0.5rem; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-xs { font-size: 0.75rem; }
            .text-sm { font-size: 0.875rem; }
            .text-lg { font-size: 1.125rem; }
            .text-2xl { font-size: 1.5rem; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .font-mono { font-family: monospace; }
            .capitalize { text-transform: capitalize; }
            .italic { font-style: italic; }
            .tracking-widest { letter-spacing: 0.1em; }
            .leading-tight { line-height: 1.25; }
            .border-2 { border: 2px solid; }
            .border-t-2 { border-top: 2px solid; }
            .border-t { border-top: 1px solid; }
            .border-b-2 { border-bottom: 2px solid; }
            .border-dashed { border-style: dashed; }
            .border-black { border-color: #000; }
            .border-gray-300 { border-color: #d1d5db; }
            .border-gray-400 { border-color: #9ca3af; }
            .rounded { border-radius: 0.25rem; }
            .rounded-full { border-radius: 9999px; }
            .bg-white { background-color: #fff; }
            .bg-gray-50 { background-color: #f9fafb; }
            .bg-gray-100 { background-color: #f3f4f6; }
            .text-white { color: #fff; }
            .text-black { color: #000; }
            .text-gray-500 { color: #6b7280; }
            .text-gray-600 { color: #4b5563; }
            .text-\\[\\#0077B6\\] { color: #0077B6; }
            .p-1 { padding: 0.25rem; }
            .p-3 { padding: 0.75rem; }
            .pb-3 { padding-bottom: 0.75rem; }
            .pt-2 { padding-top: 0.5rem; }
            .pt-3 { padding-top: 0.75rem; }
            .mb-1 { margin-bottom: 0.25rem; }
            .mb-2 { margin-bottom: 0.5rem; }
            .mb-3 { margin-bottom: 0.75rem; }
            .mb-4 { margin-bottom: 1rem; }
            .mt-1 { margin-top: 0.25rem; }
            .mt-2 { margin-top: 0.5rem; }
            .mt-3 { margin-top: 0.75rem; }
            .space-y-3 > * + * { margin-top: 0.75rem; }
            .grid { display: grid; }
            .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .flex-1 { flex: 1 1 0%; }
            .h-full { height: 100%; }
            .h-3 { height: 0.75rem; }
            .h-12 { height: 3rem; }
            .w-3 { width: 0.75rem; }
            .w-auto { width: auto; }
            .object-contain { object-fit: contain; }
            .uppercase { text-transform: uppercase; }
            img { max-width: 100%; height: auto; }
            svg { display: inline-block; vertical-align: middle; }
          </style>
        </head>
        <body>
          <div class="label-container">
            ${labelContent}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Jobs Management</h1>
            <p className="text-muted-foreground">View and manage all delivery jobs</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Disable notification sounds' : 'Enable notification sounds'}
              data-testid="button-toggle-sound"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                playAlert();
                toast({ title: 'Sound Test', description: 'Alert sound played!' });
              }}
              data-testid="button-test-sound"
            >
              Test Sound
            </Button>
            <Link href="/admin/jobs/create">
              <Button data-testid="button-create-job">
                <Plus className="h-4 w-4 mr-2" />
                Create Job
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tracking number or postcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-jobs"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="on_the_way_pickup">To Pickup</SelectItem>
                  <SelectItem value="arrived_pickup">At Pickup</SelectItem>
                  <SelectItem value="collected">Collected</SelectItem>
                  <SelectItem value="on_the_way_delivery">Delivering</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredJobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tracking #</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                      <TableCell className="font-mono text-sm">{job.trackingNumber}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-green-500" />
                            {job.pickupPostcode}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3 text-red-500" />
                            {job.deliveryPostcode}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{job.vehicleType?.replace('_', ' ')}</TableCell>
                      <TableCell>{getDriverName(job.driverId)}</TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(job.createdAt)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPrice(job.totalPrice)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-job-actions-${job.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedJob(job)} data-testid={`menu-view-${job.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(job)} data-testid={`menu-edit-${job.id}`}>
                              <Edit3 className="mr-2 h-4 w-4" />
                              Edit Job
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openLabelDialog(job)} data-testid={`menu-print-label-${job.id}`}>
                              <Printer className="mr-2 h-4 w-4" />
                              Print Label
                            </DropdownMenuItem>
                            {!job.driverId && job.status === 'pending' && (
                              <DropdownMenuItem 
                                onClick={() => { setJobToAssign(job); setAssignDialogOpen(true); }}
                                data-testid={`menu-assign-${job.id}`}
                              >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Assign Driver
                              </DropdownMenuItem>
                            )}
                            {job.driverId && job.status !== 'delivered' && job.status !== 'cancelled' && (
                              <DropdownMenuItem 
                                onClick={() => { setJobToAssign(job); setAssignDialogOpen(true); }}
                                data-testid={`menu-reassign-${job.id}`}
                              >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Reassign Driver
                              </DropdownMenuItem>
                            )}
                            {job.status !== 'delivered' && job.status !== 'cancelled' && (
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => cancelJobMutation.mutate(job.id)}
                                data-testid={`menu-cancel-${job.id}`}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel Job
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No jobs found</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Job Details Dialog */}
        <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Job Details - {selectedJob?.trackingNumber}</DialogTitle>
              <DialogDescription>
                Created on {selectedJob && formatDate(selectedJob.createdAt)}
              </DialogDescription>
            </DialogHeader>
            {selectedJob && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Pickup</h4>
                    <p className="text-sm">{selectedJob.pickupAddress}</p>
                    <p className="text-sm font-mono text-muted-foreground">{selectedJob.pickupPostcode}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Delivery</h4>
                    <p className="text-sm">{selectedJob.deliveryAddress}</p>
                    <p className="text-sm font-mono text-muted-foreground">{selectedJob.deliveryPostcode}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Vehicle</p>
                    <p className="font-medium capitalize">{selectedJob.vehicleType?.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Weight</p>
                    <p className="font-medium">{selectedJob.weight} kg</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Distance</p>
                    <p className="font-medium">{selectedJob.distance || '—'} miles</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Customer Amount</p>
                    <p className="font-medium">{formatPrice(selectedJob.totalPrice)}</p>
                  </div>
                </div>
                {selectedJob.driverPrice && (
                  <div>
                    <p className="text-sm text-muted-foreground">Driver Payment</p>
                    <p className="font-medium text-green-600">{formatPrice(selectedJob.driverPrice)}</p>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {getStatusBadge(selectedJob.status)}
                  {selectedJob.driverId && (
                    <Badge variant="outline">Driver: {getDriverName(selectedJob.driverId)}</Badge>
                  )}
                  {selectedJob.isCentralLondon && (
                    <Badge variant="outline">Central London</Badge>
                  )}
                  {selectedJob.isMultiDrop && (
                    <Badge variant="outline">Multi-Drop</Badge>
                  )}
                  {selectedJob.isReturnTrip && (
                    <Badge variant="outline">Return Trip</Badge>
                  )}
                </div>
                {selectedJob.recipientName && (
                  <div>
                    <h4 className="font-semibold mb-2">Recipient</h4>
                    <p className="text-sm">{selectedJob.recipientName}</p>
                    <p className="text-sm text-muted-foreground">{selectedJob.recipientPhone}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Assign Driver Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{jobToAssign?.driverId ? 'Reassign Driver' : 'Assign Driver'}</DialogTitle>
              <DialogDescription>
                {jobToAssign?.driverId ? (
                  <>Currently assigned to: <span className="font-medium">{getDriverName(jobToAssign.driverId)}</span>. Select a new driver for job {jobToAssign?.trackingNumber}</>
                ) : (
                  <>Select a driver for job {jobToAssign?.trackingNumber}</>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {allDriversWithInfo.length > 0 ? (
                allDriversWithInfo.map((driver) => (
                  <Button
                    key={driver.id}
                    variant={driver.id === jobToAssign?.driverId ? "default" : "outline"}
                    className="w-full justify-between h-auto py-3"
                    onClick={() => jobToAssign && assignDriverMutation.mutate({ jobId: jobToAssign.id, driverId: driver.id })}
                    disabled={assignDriverMutation.isPending || driver.id === jobToAssign?.driverId}
                    data-testid={`button-assign-driver-${driver.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {driver.driverCode && (
                        <Badge className="bg-blue-600 text-white font-mono text-sm px-2">{driver.driverCode}</Badge>
                      )}
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="font-medium">{driver.name}</span>
                        <span className="text-xs text-muted-foreground">{driver.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{driver.vehicleType?.replace('_', ' ')}</Badge>
                      {driver.isAvailable && <Badge variant="outline" className="text-green-600 border-green-600">Online</Badge>}
                      {driver.id === jobToAssign?.driverId && <Badge>Current</Badge>}
                    </div>
                    {assignDriverMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  </Button>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">No drivers found in Supabase</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Job Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Job</DialogTitle>
              <DialogDescription>
                Update job {jobToEdit?.trackingNumber}
              </DialogDescription>
            </DialogHeader>
            {jobToEdit && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Pickup</p>
                    <p className="font-mono">{jobToEdit.pickupPostcode}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Delivery</p>
                    <p className="font-mono">{jobToEdit.deliveryPostcode}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-status">Job Status</Label>
                    <Select value={editStatus} onValueChange={(val) => setEditStatus(val as JobStatus)}>
                      <SelectTrigger id="edit-status" data-testid="select-edit-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-driver">Assigned Driver</Label>
                    <Select value={editDriverId} onValueChange={setEditDriverId}>
                      <SelectTrigger id="edit-driver" data-testid="select-edit-driver">
                        <SelectValue placeholder="Select driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">No Driver (Unassigned)</SelectItem>
                        {allDriversWithInfo.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            <div className="flex items-center gap-2">
                              {driver.driverCode && (
                                <span className="font-mono font-bold text-blue-600">{driver.driverCode}</span>
                              )}
                              <span>{driver.name}</span>
                              {driver.isAvailable && (
                                <Badge variant="secondary" className="text-xs">Online</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-total-price">Customer Price (£)</Label>
                      <Input
                        id="edit-total-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editTotalPrice}
                        onChange={(e) => setEditTotalPrice(e.target.value)}
                        data-testid="input-edit-total-price"
                      />
                      <p className="text-xs text-muted-foreground">Total amount customer pays</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-driver-price">Driver Payment (£)</Label>
                      <Input
                        id="edit-driver-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editDriverPrice}
                        onChange={(e) => setEditDriverPrice(e.target.value)}
                        placeholder="Optional"
                        data-testid="input-edit-driver-price"
                      />
                      <p className="text-xs text-muted-foreground">Amount driver receives</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveEdit} 
                disabled={updateJobMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print Label Dialog */}
        <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Print Shipping Label
              </DialogTitle>
              <DialogDescription>
                4" x 6" Professional Shipping Label for {jobForLabel?.trackingNumber}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-auto">
              {jobForLabel && (
                <div className="transform origin-top" style={{ transform: 'scale(0.6)' }}>
                  <ShippingLabel 
                    ref={labelRef} 
                    job={jobForLabel} 
                    driverName={getDriverName(jobForLabel.driverId)} 
                  />
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setLabelDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePrintLabel} className="gap-2" data-testid="button-print-label">
                <Printer className="h-4 w-4" />
                Print Label
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
