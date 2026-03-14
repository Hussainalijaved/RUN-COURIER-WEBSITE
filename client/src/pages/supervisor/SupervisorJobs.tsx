import { useState, useEffect, useRef, useMemo } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  EyeOff,
  UserPlus,
  MapPin,
  Package,
  Loader2,
  Plus,
  Printer,
  Send,
  CreditCard,
  RefreshCw,
  CheckCircle,
  Undo2,
  Building2,
  User,
  Check,
  X,
  Upload,
  Camera,
  Smartphone,
  PoundSterling,
  FileText,
  ChevronsUpDown,
  Route,
} from 'lucide-react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ShippingLabel } from '@/components/ShippingLabel';
import { MultiDropShippingLabels } from '@/components/MultiDropShippingLabels';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ErrorState } from '@/components/ErrorState';
import type { Job, Driver, JobStatus } from '@shared/schema';

interface SupabaseDriver {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  driverCode: string | null;
  vehicleType?: string;
  isVerified?: boolean;
  isAvailable?: boolean;
  createdAt: string;
}

interface MultiDropStop {
  id: string;
  jobId: string;
  stopOrder: number;
  address: string;
  postcode: string;
  recipientName?: string;
  recipientPhone?: string;
  instructions?: string;
  status?: string;
  deliveredAt?: string;
  podPhotoUrl?: string;
  podSignatureUrl?: string;
  podRecipientName?: string;
}

const getStatusBadge = (status: JobStatus) => {
  const statusConfig: Record<JobStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-yellow-500' },
    assigned: { label: 'Assigned', className: 'bg-blue-400' },
    offered: { label: 'Offered', className: 'bg-blue-400' },
    accepted: { label: 'Accepted', className: 'bg-blue-500' },
    on_the_way_pickup: { label: 'To Pickup', className: 'bg-indigo-500' },
    arrived_pickup: { label: 'At Pickup', className: 'bg-purple-500' },
    picked_up: { label: 'Picked Up', className: 'bg-cyan-500' },
    collected: { label: 'Collected', className: 'bg-cyan-500' },
    on_the_way: { label: 'On the Way', className: 'bg-blue-600' },
    on_the_way_delivery: { label: 'Delivering', className: 'bg-blue-600' },
    delivered: { label: 'Delivered', className: 'bg-green-500' },
    cancelled: { label: 'Cancelled', className: 'bg-red-500' },
    failed: { label: 'Failed', className: 'bg-red-700' },
  };
  const config = statusConfig[status] || { label: status, className: 'bg-gray-500' };
  return <Badge className={`${config.className} text-white`}>{config.label}</Badge>;
};

function MultiDropStopsSection({ jobId, isMultiDrop }: { jobId: string; isMultiDrop?: boolean }) {
  const { data, isLoading } = useQuery<{ stops: MultiDropStop[] }>({
    queryKey: [`/api/jobs/${jobId}/stops`],
    enabled: !!isMultiDrop && !!jobId,
  });

  if (!isMultiDrop) return null;
  if (isLoading) {
    return (
      <div className="border-t pt-4">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-600" />
          Multi-Drop Stops
        </h4>
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  const stops = data?.stops || [];
  if (stops.length === 0) {
    return (
      <div className="border-t pt-4">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-600" />
          Multi-Drop Stops
        </h4>
        <p className="text-sm text-muted-foreground">No additional stops recorded</p>
      </div>
    );
  }

  return (
    <div className="border-t pt-4">
      <h4 className="font-semibold mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-blue-600" />
        Multi-Drop Stops ({stops.length} stops)
      </h4>
      <div className="space-y-3">
        {stops.map((stop) => (
          <div key={stop.id} className="p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">Stop {stop.stopOrder}</Badge>
                  {stop.status === 'delivered' ? (
                    <Badge className="bg-green-500 text-white text-xs">Delivered</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  )}
                </div>
                <p className="text-sm font-medium">{stop.address}</p>
                <p className="text-sm font-mono text-muted-foreground">{stop.postcode}</p>
                {stop.recipientName && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Recipient: {stop.recipientName}
                    {stop.recipientPhone && ` • ${stop.recipientPhone}`}
                  </p>
                )}
                {stop.instructions && (
                  <p className="text-xs text-muted-foreground mt-1 italic">Instructions: {stop.instructions}</p>
                )}
              </div>
            </div>
            {stop.podRecipientName && (
              <p className="text-xs text-green-600 mt-2">Signed by: {stop.podRecipientName}</p>
            )}
            {(stop.podPhotoUrl || stop.podSignatureUrl) && (
              <div className="mt-3 pt-2 border-t border-dashed flex gap-3 flex-wrap">
                {stop.podPhotoUrl && (
                  <a href={stop.podPhotoUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={stop.podPhotoUrl}
                      alt={`Stop ${stop.stopOrder} POD`}
                      className="rounded-lg border max-h-32 w-auto object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </a>
                )}
                {stop.podSignatureUrl && (
                  <a href={stop.podSignatureUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={stop.podSignatureUrl}
                      alt={`Stop ${stop.stopOrder} Signature`}
                      className="max-h-32 w-auto object-contain rounded-lg border bg-white p-1"
                    />
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface DriverComboboxProps {
  drivers: any[];
  value: string;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId?: string;
}

function DriverCombobox({ drivers, value, onSelect, open, onOpenChange, testId }: DriverComboboxProps) {
  const selected = drivers.find((d) => d.id === value);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid={testId}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              {selected.driverCode && (
                <span className="font-mono font-bold text-blue-600 shrink-0">{selected.driverCode}</span>
              )}
              <span className="truncate">{selected.fullName || selected.name || selected.driverCode || 'Unknown'}</span>
              {selected.isAvailable && (
                <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-semibold shrink-0">Online</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Search driver…</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or driver ID…" />
          <CommandList>
            <CommandEmpty>No drivers found.</CommandEmpty>
            <CommandGroup>
              {drivers.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No active drivers available</div>
              ) : (
                drivers.map((d) => {
                  const name = d.fullName || d.name || d.driverCode || 'Unknown';
                  return (
                    <CommandItem
                      key={d.id}
                      value={`${d.driverCode || ''} ${name}`}
                      onSelect={() => { onSelect(d.id); onOpenChange(false); }}
                      className="flex items-center gap-2"
                    >
                      <Check className={`h-4 w-4 shrink-0 ${value === d.id ? 'opacity-100' : 'opacity-0'}`} />
                      {d.driverCode && (
                        <span className="font-mono font-bold text-blue-600 shrink-0">{d.driverCode}</span>
                      )}
                      <span className="flex-1 truncate">{name}</span>
                      {d.isAvailable && (
                        <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-semibold shrink-0">Online</span>
                      )}
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function SupervisorJobs() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
  const [assignDriverComboOpen, setAssignDriverComboOpen] = useState(false);
  const [selectedDriverForAssign, setSelectedDriverForAssign] = useState<string>('');
  const [assignDriverPrice, setAssignDriverPrice] = useState<string>('');
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [jobForLabel, setJobForLabel] = useState<Job | null>(null);
  const [multiDropStops, setMultiDropStops] = useState<any[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogJobId, setEmailDialogJobId] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [uploadingPod, setUploadingPod] = useState(false);
  const [deletingPodUrl, setDeletingPodUrl] = useState<string | null>(null);
  const podFileInputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  const { data: jobs, isLoading: jobsLoading, isError: jobsError, refetch: refetchJobs } = useQuery<Job[]>({
    queryKey: ['/api/supervisor/jobs'],
    refetchInterval: 30000,
    retry: 2,
    retryDelay: 1000,
  });

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (jobsLoading) {
      timer = setTimeout(() => setLoadingTooLong(true), 10000);
    } else {
      setLoadingTooLong(false);
    }
    return () => clearTimeout(timer);
  }, [jobsLoading]);

  const { data: drivers } = useQuery<Driver[]>({ queryKey: ['/api/drivers'] });
  const { data: supabaseDrivers, isError: supabaseDriversError } = useQuery<SupabaseDriver[]>({
    queryKey: ['/api/supabase-drivers'],
    retry: false,
  });

  const allDriversWithInfo = useMemo(() => {
    if (supabaseDriversError || !supabaseDrivers || supabaseDrivers.length === 0) {
      return (drivers || []).map(d => ({
        id: d.id, name: d.fullName || 'Unknown', email: d.email || '',
        phone: d.phone || '', driverCode: d.driverCode || null,
        vehicleType: d.vehicleType || 'car', vehicleRegistration: d.vehicleRegistration || '',
        isVerified: d.isVerified ?? false, isAvailable: d.isAvailable ?? false,
      }));
    }
    return supabaseDrivers.map(sd => {
      const ld = drivers?.find(d => d.id === sd.id || d.userId === sd.id);
      return {
        id: sd.id, name: sd.fullName, email: sd.email, phone: sd.phone || ld?.phone || '',
        driverCode: sd.driverCode || ld?.driverCode || null,
        vehicleType: sd.vehicleType || ld?.vehicleType || 'car',
        vehicleRegistration: ld?.vehicleRegistration || '',
        isVerified: sd.isVerified ?? ld?.isVerified ?? false,
        isAvailable: sd.isAvailable ?? ld?.isAvailable ?? false,
      };
    });
  }, [supabaseDrivers, supabaseDriversError, drivers]);

  const vehicleTypeOrder = ['motorbike', 'car', 'small_van', 'medium_van', 'large_van', 'luton_van', 'flatbed'];
  const activeDriversForAssign = useMemo(
    () => allDriversWithInfo.filter(d => d.isVerified),
    [allDriversWithInfo]
  );

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '—';
    const sd = supabaseDrivers?.find(d => d.id === driverId);
    if (sd) {
      const code = sd.driverCode || '';
      return code ? `${code} · ${sd.fullName}` : sd.fullName;
    }
    const d = drivers?.find(d => d.id === driverId);
    if (d) {
      const code = d.driverCode || '';
      return code ? `${code} · ${d.vehicleRegistration || 'Driver'}` : d.vehicleRegistration || 'Driver';
    }
    return driverId.substring(0, 8) + '...';
  };

  const getDriverCode = (driverId: string | null) => {
    if (!driverId) return null;
    const sd = supabaseDrivers?.find(d => d.id === driverId);
    if (sd?.driverCode) return sd.driverCode;
    return drivers?.find(d => d.id === driverId)?.driverCode || null;
  };

  const formatPrice = (price: string | number | null | undefined) => {
    if (price === null || price === undefined) return '—';
    const num = typeof price === 'string' ? parseFloat(price) : price;
    return `£${num.toFixed(2)}`;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const filteredJobs = useMemo(() => jobs?.filter((job) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      ((job as any).jobNumber || '').toLowerCase().includes(q) ||
      (job.trackingNumber || '').toLowerCase().includes(q) ||
      (job.pickupPostcode || '').toLowerCase().includes(q) ||
      (job.deliveryPostcode || '').toLowerCase().includes(q) ||
      (job.pickupContactName || '').toLowerCase().includes(q) ||
      ((job as any).recipientName || '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const matchesCustomerType = customerTypeFilter === 'all' || (job as any).customerType === customerTypeFilter;
    return matchesSearch && matchesStatus && matchesCustomerType;
  }) || [], [jobs, searchQuery, statusFilter, customerTypeFilter]);

  const financialSummary = useMemo(() => {
    if (!jobs) return { completedTotal: 0, unpaidTotal: 0, paidTotal: 0 };
    const completedTotal = jobs.filter(j => j.status === 'delivered').reduce((s, j) => s + parseFloat(String(j.totalPrice || 0)), 0);
    const paidTotal = jobs.filter(j => j.paymentStatus === 'paid').reduce((s, j) => s + parseFloat(String(j.totalPrice || 0)), 0);
    const unpaidTotal = jobs.filter(j => j.paymentStatus !== 'paid' && j.status !== 'cancelled').reduce((s, j) => s + parseFloat(String(j.totalPrice || 0)), 0);
    return { completedTotal, unpaidTotal, paidTotal };
  }, [jobs]);

  const assignDriverMutation = useMutation({
    mutationFn: async ({ jobId, driverId, driverPrice }: { jobId: string; driverId: string; driverPrice: string }) => {
      const res = await apiRequest('PATCH', `/api/jobs/${jobId}/assign`, { driverId, driverPrice, dispatcherId: user?.id || null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      toast({ title: 'Assignment sent to driver', description: 'The driver will receive a notification to accept or decline.' });
      setAssignDialogOpen(false);
      setJobToAssign(null);
      setSelectedDriverForAssign('');
      setAssignDriverPrice('');
    },
    onError: (error: any) => {
      toast({ title: 'Failed to send assignment', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  const withdrawAssignmentMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest('PATCH', `/api/jobs/${jobId}/unassign`, { adminUserId: user?.id || 'supervisor', reason: 'Withdrawn by supervisor' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      toast({ title: 'Driver unassigned', description: 'The job is now available for reassignment.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to unassign driver', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  const updatePaymentStatusMutation = useMutation({
    mutationFn: async ({ jobId, paymentStatus }: { jobId: string; paymentStatus: string }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/payment-status`, { paymentStatus });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      toast({ title: variables.paymentStatus === 'paid' ? 'Invoice marked as paid' : 'Invoice marked as unpaid' });
    },
    onError: () => { toast({ title: 'Failed to update invoice status', variant: 'destructive' }); },
  });

  const toggleDriverVisibilityMutation = useMutation({
    mutationFn: async ({ jobId, hidden }: { jobId: string; hidden: boolean }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/driver-visibility`, { hidden, adminId: user?.id });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      toast({ title: variables.hidden ? 'Job hidden from driver' : 'Job visible to driver' });
    },
    onError: () => { toast({ title: 'Failed to update job visibility', variant: 'destructive' }); },
  });

  const sendPaymentLinkMutation = useMutation({
    mutationFn: async ({ jobId, custEmail, custName }: { jobId: string; custEmail?: string; custName?: string }) => {
      return apiRequest('POST', '/api/admin/payment-links', { jobId, customerEmail: custEmail, customerName: custName });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      setEmailDialogOpen(false);
      setEmailDialogJobId('');
      setCustomerEmail('');
      setCustomerName('');
      toast({ title: 'Payment link sent!', description: data.emailSent ? 'Customer will receive an email with the payment link.' : 'Payment link created.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to send payment link', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  const resendPaymentLinkMutation = useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      const linksRes = await apiRequest('GET', `/api/admin/payment-links?jobId=${jobId}`);
      const links = await linksRes.json();
      const linksArray = Array.isArray(links) ? links : [];
      const activeLink = linksArray.find((l: any) =>
        (l.status === 'pending' || l.status === 'sent' || l.status === 'opened') && new Date(l.expiresAt) > new Date()
      );
      if (!activeLink) throw new Error('No active payment link found. Please send a new payment link.');
      return apiRequest('POST', `/api/admin/payment-links/${activeLink.id}/resend`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      toast({ title: 'Payment link resent!' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to resend payment link', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  const handleSendPaymentLink = async (jobId: string, job?: Job) => {
    try {
      await sendPaymentLinkMutation.mutateAsync({ jobId });
    } catch (error: any) {
      const errorMessage = error?.message || '';
      if (errorMessage.includes('requiresEmail') || errorMessage.includes('Customer email not found') || errorMessage.includes('Please provide a customer email')) {
        setEmailDialogJobId(jobId);
        setCustomerName(job?.recipientName || '');
        setEmailDialogOpen(true);
      }
    }
  };

  const handlePodUpload = async (event: React.ChangeEvent<HTMLInputElement>, jobId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload JPEG, PNG, GIF, or WebP', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return;
    }
    setUploadingPod(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Authentication required');
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/jobs/${jobId}/pod/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });
      if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Upload failed'); }
      const result = await response.json();
      toast({ title: 'POD uploaded successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
      if (selectedJob?.id === jobId) {
        setSelectedJob({ ...selectedJob, podPhotoUrl: result.podPhotoUrl, podPhotos: result.podPhotos });
      }
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message || 'Failed to upload POD', variant: 'destructive' });
    } finally {
      setUploadingPod(false);
      if (podFileInputRef.current) podFileInputRef.current.value = '';
    }
  };

  const openLabelDialog = async (job: Job) => {
    setJobForLabel(job);
    setMultiDropStops([]);
    setLabelDialogOpen(true);
    if (job.isMultiDrop) {
      setLoadingStops(true);
      try {
        const response = await apiRequest('GET', `/api/jobs/${job.id}/stops`);
        const data = await response.json();
        setMultiDropStops(data.stops || []);
      } catch (error) {
        console.error('Failed to fetch multi-drop stops:', error);
      } finally {
        setLoadingStops(false);
      }
    }
  };

  const handlePrintLabel = async () => {
    if (!labelRef.current) return;
    const convertImagesToBase64 = async (element: HTMLElement): Promise<string> => {
      const clone = element.cloneNode(true) as HTMLElement;
      const images = clone.querySelectorAll('img');
      for (const img of Array.from(images)) {
        try {
          const response = await fetch(img.src);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          img.src = base64;
        } catch (e) { console.error('Failed to convert image:', e); }
      }
      return clone.outerHTML;
    };
    const labelContent = await convertImagesToBase64(labelRef.current);
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast({ title: 'Please allow popups to print labels', variant: 'destructive' }); return; }
    const isMultiLabel = jobForLabel?.isMultiDrop && multiDropStops.length > 0;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Shipping Label - ${jobForLabel?.trackingNumber}</title><style>@page{size:4in 6in;margin:0;}*,*::before,*::after{box-sizing:border-box;}html,body{width:4in;margin:0!important;padding:0!important;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;background:white;color:black;${isMultiLabel?'':'height:6in;max-height:6in;overflow:hidden!important;'}}@media print{@page{size:4in 6in;margin:0;}html,body{width:4in!important;margin:0!important;padding:0!important;${isMultiLabel?'':'height:6in!important;max-height:6in!important;overflow:hidden!important;'}}.label-page{width:4in!important;height:6in!important;max-height:6in!important;margin:0!important;page-break-after:always!important;break-after:page!important;overflow:hidden!important;}}img{display:block;max-width:100%;}svg{display:inline-block;vertical-align:middle;}</style></head><body>${labelContent}<script>window.onload=function(){setTimeout(function(){window.print();window.close();},100);};</script></body></html>`);
    printWindow.document.close();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Jobs</h1>
            <p className="text-muted-foreground">View and manage all delivery jobs</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetchJobs()} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Link href="/supervisor/jobs/create">
              <Button data-testid="button-create-job">
                <Plus className="h-4 w-4 mr-2" />
                Create Job
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Jobs Total</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                £{financialSummary.completedTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">{jobs?.filter(j => j.status === 'delivered').length || 0} delivered jobs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Invoices Not Paid</CardTitle>
              <FileText className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                £{financialSummary.unpaidTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">{jobs?.filter(j => j.paymentStatus !== 'paid' && j.status !== 'cancelled').length || 0} unpaid jobs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <PoundSterling className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                £{financialSummary.paidTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">{jobs?.filter(j => j.paymentStatus === 'paid').length || 0} paid jobs</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by job number, tracking, or postcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-jobs"
                />
              </div>
              <Select value={customerTypeFilter} onValueChange={setCustomerTypeFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-customer-type-filter">
                  <SelectValue placeholder="Customer type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
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
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {jobsError ? (
              <ErrorState
                title="Failed to load jobs"
                message="We couldn't fetch the job list. Please check your connection and try again."
                onRetry={() => refetchJobs()}
              />
            ) : jobsLoading ? (
              <div className="space-y-4">
                {loadingTooLong && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md text-sm text-yellow-700 dark:text-yellow-400">
                    Loading is taking longer than expected. Please wait or try refreshing.
                    <Button variant="link" size="sm" onClick={() => refetchJobs()} className="ml-2 p-0 h-auto">Retry</Button>
                  </div>
                )}
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredJobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job No.</TableHead>
                    <TableHead>Tracking #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pickup Time</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Driver Pay</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                      <TableCell className="font-mono text-sm font-semibold">{(job as any).jobNumber || '—'}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{job.trackingNumber}</TableCell>
                      <TableCell>
                        {(job as any).customerType === 'business' ? (
                          <Badge variant="outline" className="gap-1">
                            <Building2 className="h-3 w-3" />
                            Business
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <User className="h-3 w-3" />
                            Individual
                          </Badge>
                        )}
                      </TableCell>
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
                      <TableCell className="text-sm">{getDriverName(job.driverId)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getStatusBadge(job.status)}
                          {job.driverId && !(job as any).driverHidden && !['delivered', 'cancelled', 'failed'].includes(job.status) && (
                            <Smartphone className="h-3.5 w-3.5 text-green-500" />
                          )}
                          {(job as any).driverHidden && (
                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(job.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-medium">{formatPrice(job.totalPrice)}</span>
                          {job.status !== 'cancelled' && (
                            <Badge
                              variant="default"
                              className={`text-xs cursor-pointer ${job.paymentStatus === 'paid' ? 'bg-green-600' : 'bg-orange-500'}`}
                              onClick={() => updatePaymentStatusMutation.mutate({
                                jobId: job.id,
                                paymentStatus: job.paymentStatus === 'paid' ? 'pending' : 'paid'
                              })}
                              data-testid={`badge-invoice-${job.id}`}
                            >
                              {job.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {job.driverPrice ? (
                          <span className="font-medium text-green-600">{formatPrice(job.driverPrice)}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
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
                            <DropdownMenuItem onClick={() => openLabelDialog(job)} data-testid={`menu-print-label-${job.id}`}>
                              <Printer className="mr-2 h-4 w-4" />
                              Print Label
                            </DropdownMenuItem>
                            {!job.driverId && job.status === 'pending' && (
                              <DropdownMenuItem
                                onClick={() => { setJobToAssign(job); setAssignDriverPrice(''); setAssignDialogOpen(true); }}
                                data-testid={`menu-assign-${job.id}`}
                              >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Assign Driver
                              </DropdownMenuItem>
                            )}
                            {job.driverId && job.status !== 'delivered' && job.status !== 'cancelled' && (
                              <DropdownMenuItem
                                onClick={() => { setJobToAssign(job); setAssignDriverPrice(job.driverPrice?.toString() || ''); setAssignDialogOpen(true); }}
                                data-testid={`menu-reassign-${job.id}`}
                              >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Reassign Driver
                              </DropdownMenuItem>
                            )}
                            {job.paymentStatus !== 'paid' && job.paymentStatus !== 'awaiting_payment' && job.status !== 'cancelled' && job.status !== 'delivered' && (
                              <DropdownMenuItem
                                onClick={() => handleSendPaymentLink(job.id, job)}
                                disabled={sendPaymentLinkMutation.isPending}
                                data-testid={`menu-send-payment-link-${job.id}`}
                              >
                                <CreditCard className="mr-2 h-4 w-4" />
                                Send Payment Link
                              </DropdownMenuItem>
                            )}
                            {job.paymentStatus === 'awaiting_payment' && job.status !== 'cancelled' && job.status !== 'delivered' && (
                              <DropdownMenuItem
                                onClick={() => resendPaymentLinkMutation.mutate({ jobId: job.id })}
                                disabled={resendPaymentLinkMutation.isPending}
                                data-testid={`menu-resend-payment-link-${job.id}`}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Resend Payment Link
                              </DropdownMenuItem>
                            )}
                            {job.status !== 'cancelled' && (
                              job.paymentStatus !== 'paid' ? (
                                <DropdownMenuItem
                                  onClick={() => updatePaymentStatusMutation.mutate({ jobId: job.id, paymentStatus: 'paid' })}
                                  data-testid={`menu-mark-invoice-paid-${job.id}`}
                                >
                                  <PoundSterling className="mr-2 h-4 w-4" />
                                  Mark Invoice Paid
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => updatePaymentStatusMutation.mutate({ jobId: job.id, paymentStatus: 'pending' })}
                                  data-testid={`menu-mark-invoice-unpaid-${job.id}`}
                                >
                                  <PoundSterling className="mr-2 h-4 w-4" />
                                  Mark Invoice Unpaid
                                </DropdownMenuItem>
                              )
                            )}
                            <DropdownMenuItem
                              onClick={() => toggleDriverVisibilityMutation.mutate({ jobId: job.id, hidden: !(job as any).driverHidden })}
                              disabled={toggleDriverVisibilityMutation.isPending}
                              data-testid={`menu-toggle-visibility-${job.id}`}
                            >
                              {(job as any).driverHidden ? (
                                <><Eye className="mr-2 h-4 w-4" />Show to Driver</>
                              ) : (
                                <><EyeOff className="mr-2 h-4 w-4" />Hide from Driver</>
                              )}
                            </DropdownMenuItem>
                            {job.driverId && ['assigned', 'offered', 'accepted'].includes(job.status) && (
                              <DropdownMenuItem
                                onClick={() => withdrawAssignmentMutation.mutate(job.id)}
                                disabled={withdrawAssignmentMutation.isPending}
                                className="text-orange-600"
                                data-testid={`menu-withdraw-${job.id}`}
                              >
                                <Undo2 className="mr-2 h-4 w-4" />
                                Withdraw from Driver
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

        {/* View Details Dialog */}
        <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Job Details — {(selectedJob as any)?.jobNumber || selectedJob?.trackingNumber}</DialogTitle>
              <DialogDescription>Created on {selectedJob && formatDate(selectedJob.createdAt)}</DialogDescription>
            </DialogHeader>
            {selectedJob && (
              <div className="space-y-6 overflow-y-auto flex-1 pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <h4 className="font-semibold mb-2">Pickup</h4>
                    {selectedJob.pickupBuildingName && <p className="text-sm font-medium">{selectedJob.pickupBuildingName}</p>}
                    <p className="text-sm">{selectedJob.pickupAddress}</p>
                    <p className="text-sm font-mono text-muted-foreground">{selectedJob.pickupPostcode}</p>
                    {selectedJob.pickupContactName && (
                      <div className="pt-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{selectedJob.pickupContactName}</span>
                        {selectedJob.pickupContactPhone && <span className="ml-2">{selectedJob.pickupContactPhone}</span>}
                      </div>
                    )}
                    {selectedJob.pickupInstructions && (
                      <p className="text-xs text-muted-foreground italic pt-1">{selectedJob.pickupInstructions}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold mb-2">Delivery</h4>
                    {selectedJob.deliveryBuildingName && <p className="text-sm font-medium">{selectedJob.deliveryBuildingName}</p>}
                    <p className="text-sm">{selectedJob.deliveryAddress}</p>
                    <p className="text-sm font-mono text-muted-foreground">{selectedJob.deliveryPostcode}</p>
                    {selectedJob.recipientName && (
                      <div className="pt-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{selectedJob.recipientName}</span>
                        {selectedJob.recipientPhone && <span className="ml-2">{selectedJob.recipientPhone}</span>}
                      </div>
                    )}
                    {selectedJob.deliveryInstructions && (
                      <p className="text-xs text-muted-foreground italic pt-1">{selectedJob.deliveryInstructions}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Vehicle</p>
                    <p className="font-medium capitalize">{selectedJob.vehicleType?.replace('_', ' ')}</p>
                  </div>
                  {selectedJob.weight && Number(selectedJob.weight) > 0 ? (
                    <div>
                      <p className="text-sm text-muted-foreground">Weight</p>
                      <p className="font-medium">{selectedJob.weight} kg</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-sm text-muted-foreground">Distance</p>
                    <p className="font-medium">{selectedJob.distance || '—'} miles</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Customer Amount</p>
                    <p className="font-medium">{formatPrice(selectedJob.totalPrice)}</p>
                  </div>
                  {selectedJob.serviceType && (
                    <div>
                      <p className="text-sm text-muted-foreground">Service Level</p>
                      <p className="font-medium capitalize">{selectedJob.serviceType}</p>
                    </div>
                  )}
                </div>

                {selectedJob.serviceType && selectedJob.serviceTypePercent !== undefined && selectedJob.serviceTypeAmount !== undefined && (
                  <div className="p-3 bg-muted/30 rounded-md space-y-1.5 text-sm">
                    <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">Pricing Breakdown</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base delivery price</span>
                      <span className="font-medium">£{(parseFloat(String(selectedJob.totalPrice || 0)) - parseFloat(String(selectedJob.serviceTypeAmount || 0))).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{selectedJob.serviceType} service ({selectedJob.serviceTypePercent}%)</span>
                      <span className="font-medium">+£{parseFloat(String(selectedJob.serviceTypeAmount)).toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>{formatPrice(selectedJob.totalPrice)}</span>
                    </div>
                  </div>
                )}

                {selectedJob.status !== 'cancelled' && (
                  <div className="p-3 bg-muted/50 rounded-md space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Invoice Status</p>
                      <Badge
                        variant="default"
                        className={`cursor-pointer ${selectedJob.paymentStatus === 'paid' ? 'bg-green-600' : 'bg-orange-500'}`}
                        onClick={() => updatePaymentStatusMutation.mutate({
                          jobId: selectedJob.id,
                          paymentStatus: selectedJob.paymentStatus === 'paid' ? 'pending' : 'paid'
                        })}
                      >
                        {selectedJob.paymentStatus === 'paid' ? 'PAID' : selectedJob.paymentStatus === 'awaiting_payment' ? 'AWAITING PAYMENT' : 'UNPAID'}
                      </Badge>
                    </div>
                    <div className="flex gap-2 pt-1">
                      {selectedJob.paymentStatus !== 'paid' ? (
                        <Button size="sm" variant="default" className="bg-green-600"
                          onClick={() => updatePaymentStatusMutation.mutate({ jobId: selectedJob.id, paymentStatus: 'paid' })}
                          disabled={updatePaymentStatusMutation.isPending}
                        >
                          {updatePaymentStatusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PoundSterling className="h-4 w-4 mr-1" />}
                          Mark Invoice Paid
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline"
                          onClick={() => updatePaymentStatusMutation.mutate({ jobId: selectedJob.id, paymentStatus: 'pending' })}
                          disabled={updatePaymentStatusMutation.isPending}
                        >
                          {updatePaymentStatusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Mark Invoice Unpaid
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {getStatusBadge(selectedJob.status)}
                  {selectedJob.driverId && (
                    <Badge variant="outline">Driver: {getDriverName(selectedJob.driverId)}</Badge>
                  )}
                  {selectedJob.isCentralLondon && <Badge variant="outline">Central London</Badge>}
                  {selectedJob.isMultiDrop && <Badge variant="outline">Multi-Drop</Badge>}
                  {selectedJob.isReturnTrip && <Badge variant="outline">Return Trip</Badge>}
                </div>

                <MultiDropStopsSection jobId={selectedJob.id} isMultiDrop={selectedJob.isMultiDrop ?? false} />

                {/* Proof of Delivery */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      {(selectedJob.podPhotoUrl || selectedJob.podSignatureUrl) ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Camera className="h-4 w-4 text-muted-foreground" />
                      )}
                      Proof of Delivery
                    </h4>
                    <div>
                      <input
                        type="file"
                        ref={podFileInputRef}
                        className="hidden"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={(e) => handlePodUpload(e, selectedJob.id)}
                      />
                      <Button size="sm" variant="outline" onClick={() => podFileInputRef.current?.click()} disabled={uploadingPod}>
                        {uploadingPod ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                        {(selectedJob.podPhotos?.length || selectedJob.podPhotoUrl) ? 'Add Photo' : 'Upload Photo'}
                      </Button>
                    </div>
                  </div>
                  {(() => {
                    const allPhotos: string[] = [];
                    if (selectedJob.podPhotos?.length) allPhotos.push(...selectedJob.podPhotos);
                    if (selectedJob.podPhotoUrl && !allPhotos.includes(selectedJob.podPhotoUrl)) allPhotos.push(selectedJob.podPhotoUrl);
                    const hasContent = allPhotos.length > 0 || selectedJob.podSignatureUrl || selectedJob.podRecipientName;
                    if (!hasContent) {
                      return (
                        <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 p-4 rounded-lg">
                          <Camera className="h-5 w-5" />
                          <p className="text-sm">{selectedJob.isMultiDrop ? 'For multi-drop jobs, POD is managed per stop above.' : 'No proof of delivery uploaded yet.'}</p>
                        </div>
                      );
                    }
                    return (
                      <>
                        {allPhotos.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                            {allPhotos.map((photoUrl, index) => (
                              <div key={photoUrl} className="relative group">
                                <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="block">
                                  <img
                                    src={photoUrl}
                                    alt={`Proof of Delivery ${index + 1}`}
                                    className="rounded-lg border max-h-48 w-full object-cover hover:opacity-90 transition-opacity cursor-pointer"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                </a>
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ visibility: 'visible' }}
                                  disabled={deletingPodUrl === photoUrl}
                                  onClick={async (e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    setDeletingPodUrl(photoUrl);
                                    try {
                                      const { data: { session } } = await supabase.auth.getSession();
                                      if (!session?.access_token) return;
                                      const resp = await fetch(`/api/jobs/${selectedJob.id}/pod/photo`, {
                                        method: 'DELETE',
                                        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ photoUrl }),
                                      });
                                      if (resp.ok) {
                                        const result = await resp.json();
                                        setSelectedJob({ ...selectedJob, podPhotoUrl: result.podPhotoUrl, podPhotos: result.podPhotos });
                                        queryClient.invalidateQueries({ queryKey: ['/api/supervisor/jobs'] });
                                        toast({ title: 'Photo removed' });
                                      } else {
                                        toast({ title: 'Error', description: 'Failed to remove photo', variant: 'destructive' });
                                      }
                                    } catch { toast({ title: 'Error', description: 'Failed to remove photo', variant: 'destructive' }); }
                                    finally { setDeletingPodUrl(null); }
                                  }}
                                >
                                  {deletingPodUrl === photoUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-start gap-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                          <div className="flex-1 space-y-2">
                            <div>
                              <p className="text-xs text-muted-foreground">Received By</p>
                              <p className="font-semibold text-base text-green-700 dark:text-green-400">
                                {selectedJob.podRecipientName || selectedJob.recipientName || 'Not recorded'}
                              </p>
                            </div>
                            {selectedJob.podNotes && (
                              <div>
                                <p className="text-xs text-muted-foreground">Driver Notes</p>
                                <p className="text-sm">{selectedJob.podNotes}</p>
                              </div>
                            )}
                            {selectedJob.deliveredAt && (
                              <div>
                                <p className="text-xs text-muted-foreground">Delivered</p>
                                <p className="text-sm font-medium">{formatDate(selectedJob.deliveredAt)}</p>
                              </div>
                            )}
                          </div>
                          {selectedJob.podSignatureUrl && (
                            <div className="flex-shrink-0">
                              <p className="text-xs text-muted-foreground mb-1">Signature</p>
                              <a href={selectedJob.podSignatureUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={selectedJob.podSignatureUrl}
                                  alt="Recipient Signature"
                                  className="rounded-md border bg-white p-1 h-16 w-28 object-contain hover:opacity-90 cursor-pointer"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </a>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Assign / Reassign Driver Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={(open) => {
          setAssignDialogOpen(open);
          if (!open) { setJobToAssign(null); setSelectedDriverForAssign(''); setAssignDriverPrice(''); setAssignDriverComboOpen(false); }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{jobToAssign?.driverId ? 'Reassign Driver' : 'Assign Driver'}</DialogTitle>
              <DialogDescription>
                {jobToAssign?.driverId ? (
                  <>Currently assigned to: <span className="font-medium">{getDriverName(jobToAssign.driverId)}</span>. Select a new driver for job {jobToAssign?.trackingNumber}</>
                ) : (
                  <>Select a driver and set the driver payment for job {jobToAssign?.trackingNumber}</>
                )}
              </DialogDescription>
            </DialogHeader>
            {jobToAssign && (
              <div className="space-y-4">
                <div className={`grid gap-4 p-3 bg-muted/50 rounded-md ${jobToAssign.driverPrice ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <div>
                    <p className="text-xs text-muted-foreground">Customer Price</p>
                    <p className="font-semibold">{formatPrice(jobToAssign.totalPrice)}</p>
                  </div>
                  {jobToAssign.driverPrice && (
                    <div>
                      <p className="text-xs text-muted-foreground">Current Driver Pay</p>
                      <p className="font-semibold text-green-600">{formatPrice(jobToAssign.driverPrice)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Route</p>
                    <p className="font-mono text-sm">{jobToAssign.pickupPostcode} → {jobToAssign.deliveryPostcode}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Select Driver</Label>
                  <DriverCombobox
                    drivers={activeDriversForAssign}
                    value={selectedDriverForAssign}
                    onSelect={setSelectedDriverForAssign}
                    open={assignDriverComboOpen}
                    onOpenChange={setAssignDriverComboOpen}
                    testId="select-assign-driver"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assign-driver-price">Driver Payment (£)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
                    <Input
                      id="assign-driver-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={assignDriverPrice}
                      onChange={(e) => setAssignDriverPrice(e.target.value)}
                      className="pl-7"
                      data-testid="input-assign-driver-price"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">This is the amount the driver will receive for completing this job.</p>
                </div>
                {selectedDriverForAssign && assignDriverPrice && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800 text-sm">
                    <span className="font-medium">Summary:</span> Assign to{' '}
                    <span className="font-semibold">
                      {(() => {
                        const d = activeDriversForAssign.find(d => d.id === selectedDriverForAssign);
                        return d?.driverCode ? `${d.driverCode} · ${d.name}` : d?.name;
                      })()}
                    </span>{' '}
                    for <span className="font-semibold">£{parseFloat(assignDriverPrice).toFixed(2)}</span>
                    <p className="text-xs text-muted-foreground mt-1">Driver will receive a notification to accept or decline.</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)} data-testid="button-cancel-assign">Cancel</Button>
              <Button
                onClick={() => {
                  if (jobToAssign && selectedDriverForAssign && assignDriverPrice) {
                    assignDriverMutation.mutate({ jobId: jobToAssign.id, driverId: selectedDriverForAssign, driverPrice: assignDriverPrice });
                  }
                }}
                disabled={!selectedDriverForAssign || !assignDriverPrice || assignDriverMutation.isPending}
                data-testid="button-send-assignment"
              >
                {assignDriverMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" />{jobToAssign?.driverId ? 'Reassign Driver' : 'Send Assignment'}</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print Label Dialog */}
        <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
          <DialogContent className={jobForLabel?.isMultiDrop && multiDropStops.length > 0 ? "max-w-2xl max-h-[80vh]" : "max-w-lg"}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Print Shipping Label{jobForLabel?.isMultiDrop && multiDropStops.length > 0 ? 's' : ''}
              </DialogTitle>
              <DialogDescription>
                {jobForLabel?.isMultiDrop && multiDropStops.length > 0
                  ? `${multiDropStops.length + 1} labels for multi-drop job ${jobForLabel?.trackingNumber}`
                  : `4" x 6" Shipping Label for ${jobForLabel?.trackingNumber}`}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-auto" style={{ maxHeight: '55vh' }}>
              {loadingStops ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading multi-drop stops...</span>
                </div>
              ) : jobForLabel && jobForLabel.isMultiDrop && multiDropStops.length > 0 ? (
                <div className="flex justify-center">
                  <div style={{ transform: 'scale(0.5)', transformOrigin: 'top center', width: '4in' }}>
                    <MultiDropShippingLabels ref={labelRef} job={jobForLabel} stops={multiDropStops} driverCode={getDriverCode(jobForLabel.driverId)} />
                  </div>
                </div>
              ) : jobForLabel ? (
                <div className="flex justify-center">
                  <div style={{ transform: 'scale(0.65)', transformOrigin: 'top center', marginBottom: '-35%' }}>
                    <ShippingLabel ref={labelRef} job={jobForLabel} driverCode={getDriverCode(jobForLabel.driverId)} />
                  </div>
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setLabelDialogOpen(false)}>Cancel</Button>
              <Button onClick={handlePrintLabel} className="gap-2" disabled={loadingStops} data-testid="button-print-label">
                <Printer className="h-4 w-4" />
                Print {jobForLabel?.isMultiDrop && multiDropStops.length > 0 ? `${multiDropStops.length + 1} Labels` : 'Label'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customer Email Dialog for Payment Link */}
        <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Customer Email Required
              </DialogTitle>
              <DialogDescription>Please enter the customer's email address to send the payment link.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="customer-email">Customer Email *</Label>
                <Input
                  id="customer-email"
                  type="email"
                  placeholder="customer@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  data-testid="input-customer-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-name">Customer Name (optional)</Label>
                <Input
                  id="customer-name"
                  type="text"
                  placeholder="John Smith"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  data-testid="input-customer-name"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setEmailDialogOpen(false); setEmailDialogJobId(''); setCustomerEmail(''); setCustomerName(''); }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!emailDialogJobId || !customerEmail) return;
                  sendPaymentLinkMutation.mutate({ jobId: emailDialogJobId, custEmail: customerEmail, custName: customerName || undefined });
                }}
                disabled={!customerEmail || sendPaymentLinkMutation.isPending}
                data-testid="button-send-payment-link"
              >
                {sendPaymentLinkMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" />Send Payment Link</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
