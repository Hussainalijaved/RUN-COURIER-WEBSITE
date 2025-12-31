import { useState, useEffect, useRef, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useJobUpdates } from '@/hooks/useJobUpdates';
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
  EyeOff,
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
  Send,
  CreditCard,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Undo2,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ShippingLabel } from '@/components/ShippingLabel';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useAuth } from '@/context/AuthContext';
import { supabaseFunctions } from '@/lib/supabaseFunctions';
import type { Job, Driver, JobStatus, JobAssignment } from '@shared/schema';
import { ErrorState, LoadingTimeout } from '@/components/ErrorState';

// Type for drivers from Supabase
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

const JOB_STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'offered', label: 'Offered' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'on_the_way_pickup', label: 'On the Way to Pickup' },
  { value: 'arrived_pickup', label: 'Arrived at Pickup' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'collected', label: 'Collected' },
  { value: 'on_the_way', label: 'On the Way' },
  { value: 'on_the_way_delivery', label: 'On the Way to Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

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
  const [selectedDriverForAssign, setSelectedDriverForAssign] = useState<string>('');
  const [assignDriverPrice, setAssignDriverPrice] = useState<string>('');
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogJobId, setEmailDialogJobId] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [batchAssignDialogOpen, setBatchAssignDialogOpen] = useState(false);
  const [batchDriverId, setBatchDriverId] = useState<string>('');
  const [batchDriverPrice, setBatchDriverPrice] = useState<string>('');
  const [batchErrors, setBatchErrors] = useState<{ jobId: string; error: string }[]>([]);
  const labelRef = useRef<HTMLDivElement>(null);
  const prevJobCountRef = useRef<number>(0);
  const { toast } = useToast();
  const { user } = useAuth();
  const { playAlert, playNotification } = useNotificationSound({ enabled: soundEnabled, volume: 0.7 });

  const { data: jobs, isLoading: jobsLoading, isError: jobsError, refetch: refetchJobs } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 30000, // Poll every 30 seconds for new jobs
    retry: 2,
    retryDelay: 1000,
  });
  
  // Loading timeout detection (show message if loading takes > 10 seconds)
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (jobsLoading) {
      timer = setTimeout(() => setLoadingTooLong(true), 10000);
    } else {
      setLoadingTooLong(false);
    }
    return () => clearTimeout(timer);
  }, [jobsLoading]);

  // Real-time job updates via WebSocket
  const { isConnected: wsConnected } = useJobUpdates({
    enabled: true,
    onJobUpdate: (update) => {
      console.log('[AdminJobs] Real-time job update:', update);
      // TanStack Query cache is auto-invalidated by the hook
    },
    onJobCreated: (job) => {
      console.log('[AdminJobs] Real-time new job:', job);
      playAlert();
      toast({
        title: 'New Job Received!',
        description: `Tracking: ${job.trackingNumber}`,
      });
    },
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

  // Fetch drivers from Supabase (for names) - fallback to local when unavailable
  const { data: supabaseDrivers, isError: supabaseDriversError } = useQuery<SupabaseDriver[]>({
    queryKey: ['/api/supabase-drivers'],
    retry: false, // Don't retry on Supabase schema errors
  });

  // Fetch all job assignments for managing them
  const { data: jobAssignments } = useQuery<JobAssignment[]>({
    queryKey: ['/api/job-assignments'],
  });

  // Helper to get active assignment for a job
  const getActiveAssignment = (jobId: string): JobAssignment | undefined => {
    if (!jobAssignments) return undefined;
    return jobAssignments.find(a => 
      a.jobId === jobId && 
      ['pending', 'sent', 'accepted'].includes(a.status)
    );
  };

  const assignDriverMutation = useMutation({
    mutationFn: async ({ jobId, driverId, driverPrice, assignedBy }: { jobId: string; driverId: string; driverPrice: string; assignedBy: string }) => {
      // Use backend API for job assignment - supports reassigning same driver with new price
      const response = await fetch('/api/job-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          driverId,
          driverPrice,
          assignedBy,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to assign driver');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
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

  const batchAssignMutation = useMutation({
    mutationFn: async ({ jobIds, driverId, driverPrice }: { jobIds: string[]; driverId: string; driverPrice: string }) => {
      // Use transactional Supabase Edge Function for batch assignment
      const driverPriceNum = parseFloat(driverPrice);
      const jobs = jobIds.map(jobId => ({
        jobId,
        driverPrice: driverPriceNum,
      }));
      
      return supabaseFunctions.batchAssignDriver({
        driverId,
        jobs,
        notes: `Batch assignment of ${jobIds.length} jobs by admin`,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
      
      toast({ 
        title: 'Batch assignment complete', 
        description: `${data.totalJobs} job${data.totalJobs > 1 ? 's' : ''} assigned to the driver. Total: £${data.totalDriverPrice.toFixed(2)}` 
      });
      setBatchAssignDialogOpen(false);
      setBatchDriverId('');
      setBatchDriverPrice('');
      setBatchErrors([]);
      setSelectedJobIds(new Set());
    },
    onError: (error: any) => {
      toast({ title: 'Failed to batch assign', description: error?.message || 'Please try again', variant: 'destructive' });
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

  const cancelAssignmentMutation = useMutation({
    mutationFn: async ({ assignmentId, reason }: { assignmentId: string; reason?: string }) => {
      return apiRequest('PATCH', `/api/job-assignments/${assignmentId}/cancel`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
      toast({ title: 'Assignment cancelled', description: 'You can now reassign the job to another driver.' });
    },
    onError: () => {
      toast({ title: 'Failed to cancel assignment', variant: 'destructive' });
    },
  });

  // Unassign driver from job - works with or without assignment records
  const withdrawAssignmentMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`/api/jobs/${jobId}/unassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: user?.id, reason: 'Withdrawn by admin' }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unassign driver');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
      toast({ title: 'Driver unassigned', description: 'The job is now available for reassignment to another driver.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to unassign driver', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  // Remove assignment (for accepted/active assignments)
  const removeAssignmentMutation = useMutation({
    mutationFn: async ({ assignmentId, reason }: { assignmentId: string; reason?: string }) => {
      return apiRequest('PATCH', `/api/job-assignments/${assignmentId}/remove`, { adminUserId: user?.id, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
      toast({ title: 'Assignment removed', description: 'The job has been removed from the driver and is ready for reassignment.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to remove assignment', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  // Clean assignment (full reset for fresh reassignment)
  const cleanAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest('PATCH', `/api/job-assignments/${assignmentId}/clean`, { adminUserId: user?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
      toast({ title: 'Job cleaned', description: 'The job has been fully reset and is ready for a fresh assignment.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to clean job', description: error?.message || 'Please try again', variant: 'destructive' });
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

  const sendPaymentLinkMutation = useMutation({
    mutationFn: async ({ jobId, customerEmail, customerName }: { jobId: string; customerEmail?: string; customerName?: string }) => {
      return apiRequest('POST', '/api/admin/payment-links', { jobId, customerEmail, customerName });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payment-links'] });
      setEmailDialogOpen(false);
      setEmailDialogJobId('');
      setCustomerEmail('');
      setCustomerName('');
      toast({ 
        title: 'Payment link sent!', 
        description: data.emailSent ? 'Customer will receive an email with the payment link.' : 'Payment link created but email delivery may have failed.'
      });
    },
    onError: (error: any) => {
      // Check if the error indicates we need an email
      if (error?.requiresEmail) {
        toast({ 
          title: 'Customer email required', 
          description: 'Please provide the customer email to send the payment link.',
        });
        return;
      }
      toast({ 
        title: 'Failed to send payment link', 
        description: error?.message || 'Please try again', 
        variant: 'destructive' 
      });
    },
  });

  const handleSendPaymentLink = async (jobId: string, job?: Job) => {
    try {
      await sendPaymentLinkMutation.mutateAsync({ jobId });
    } catch (error: any) {
      // If email is required, open the dialog
      const errorMessage = error?.message || '';
      if (errorMessage.includes('requiresEmail') || errorMessage.includes('Customer email not found') || errorMessage.includes('Please provide a customer email')) {
        setEmailDialogJobId(jobId);
        setCustomerName(job?.recipientName || '');
        setEmailDialogOpen(true);
      }
    }
  };

  const handleSendPaymentLinkWithEmail = () => {
    if (!emailDialogJobId || !customerEmail) return;
    sendPaymentLinkMutation.mutate({ 
      jobId: emailDialogJobId, 
      customerEmail, 
      customerName: customerName || undefined 
    });
  };

  const toggleDriverVisibilityMutation = useMutation({
    mutationFn: async ({ jobId, hidden }: { jobId: string; hidden: boolean }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/driver-visibility`, { hidden, adminId: 'admin' });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ 
        title: variables.hidden ? 'Job hidden from driver' : 'Job visible to driver',
        description: variables.hidden 
          ? 'This job will no longer appear in the driver mobile app.' 
          : 'This job is now visible in the driver mobile app.'
      });
    },
    onError: () => {
      toast({ title: 'Failed to update job visibility', variant: 'destructive' });
    },
  });

  const resendPaymentLinkMutation = useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      const linksRes = await apiRequest('GET', `/api/admin/payment-links?jobId=${jobId}`);
      const links = Array.isArray(linksRes) ? linksRes : [];
      const activeLink = links.find((l: any) => 
        (l.status === 'pending' || l.status === 'sent' || l.status === 'opened') && 
        new Date(l.expiresAt) > new Date()
      );
      if (!activeLink) {
        throw new Error('No active payment link found. Please send a new payment link.');
      }
      return apiRequest('POST', `/api/admin/payment-links/${activeLink.id}/resend`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payment-links'] });
      toast({ 
        title: 'Payment link resent!', 
        description: data.emailSent ? 'Customer will receive another email with the payment link.' : 'Resend attempted but email delivery may have failed.'
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to resend payment link', 
        description: error?.message || 'Please try again', 
        variant: 'destructive' 
      });
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
  // IMPORTANT: Use Supabase data as primary source, fallback to local PostgreSQL when Supabase unavailable or has errors
  const allDriversWithInfo = useMemo(() => {
    // If Supabase has errors or no data, fall back to local PostgreSQL drivers immediately
    if (supabaseDriversError || !supabaseDrivers || supabaseDrivers.length === 0) {
      // Use local PostgreSQL drivers
      return (drivers || []).map(d => ({
        id: d.id,
        name: d.fullName || 'Unknown',
        email: d.email || '',
        phone: d.phone || '',
        driverCode: d.driverCode || null,
        vehicleType: d.vehicleType || 'car',
        vehicleRegistration: d.vehicleRegistration || '',
        isVerified: d.isVerified ?? false,
        isAvailable: d.isAvailable ?? false,
      }));
    }
    // Supabase drivers available, merge with local data
    return supabaseDrivers.map(sd => {
      const localDriver = drivers?.find(d => d.id === sd.id || d.userId === sd.id);
      return {
        id: sd.id,
        name: sd.fullName,
        email: sd.email,
        phone: sd.phone || localDriver?.phone || '',
        driverCode: sd.driverCode || localDriver?.driverCode || null,
        vehicleType: sd.vehicleType || localDriver?.vehicleType || 'car',
        vehicleRegistration: localDriver?.vehicleRegistration || '',
        isVerified: sd.isVerified ?? localDriver?.isVerified ?? false,
        isAvailable: sd.isAvailable ?? localDriver?.isAvailable ?? false,
      };
    });
  }, [supabaseDrivers, supabaseDriversError, drivers]);

  const availableDrivers = drivers?.filter((d) => d.isAvailable && d.isVerified) || [];
  const allDrivers = drivers || [];

  // Multi-select helpers
  const assignableJobs = filteredJobs.filter(job => 
    job.status === 'pending' && !job.driverId && !getActiveAssignment(job.id)
  );
  const allAssignableSelected = assignableJobs.length > 0 && 
    assignableJobs.every(job => selectedJobIds.has(job.id));
  
  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleAllAssignable = () => {
    if (allAssignableSelected) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(assignableJobs.map(job => job.id)));
    }
  };

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
        } catch (e) {
          console.error('Failed to convert image:', e);
        }
      }
      
      return clone.innerHTML;
    };
    
    const labelContent = await convertImagesToBase64(labelRef.current);
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Please allow popups to print labels', variant: 'destructive' });
      return;
    }
    
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
            @media print {
              body { margin: 0; padding: 0; }
              .label-container { page-break-inside: avoid; }
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
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
            .items-start { align-items: flex-start; }
            .justify-center { justify-content: center; }
            .justify-between { justify-content: space-between; }
            .flex-shrink-0 { flex-shrink: 0; }
            .gap-1 { gap: 0.25rem; }
            .gap-2 { gap: 0.5rem; }
            .gap-3 { gap: 0.75rem; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-xs { font-size: 0.75rem; }
            .text-sm { font-size: 0.875rem; }
            .text-base { font-size: 1rem; }
            .text-lg { font-size: 1.125rem; }
            .text-xl { font-size: 1.25rem; }
            .text-2xl { font-size: 1.5rem; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .font-mono { font-family: monospace; }
            .capitalize { text-transform: capitalize; }
            .italic { font-style: italic; }
            .tracking-widest { letter-spacing: 0.1em; }
            .leading-tight { line-height: 1.25; }
            .border { border: 1px solid #000; }
            .border-2 { border: 2px solid #000; }
            .border-t { border-top: 1px solid #000; }
            .border-t-2 { border-top: 2px solid #000; }
            .border-b-2 { border-bottom: 2px solid #000; }
            .border-dashed { border-style: dashed; }
            .border-black { border-color: #000; }
            .border-gray-300 { border-color: #d1d5db; }
            .border-gray-400 { border-color: #9ca3af; }
            .rounded { border-radius: 0.25rem; }
            .rounded-full { border-radius: 9999px; }
            .bg-white { background-color: #fff !important; }
            .bg-black { background-color: #000 !important; }
            .bg-gray-50 { background-color: #f9fafb !important; }
            .bg-gray-100 { background-color: #f3f4f6 !important; }
            .text-white { color: #fff !important; }
            .text-black { color: #000; }
            .text-gray-400 { color: #9ca3af; }
            .text-gray-500 { color: #6b7280; }
            .text-gray-600 { color: #4b5563; }
            .text-\\[10px\\] { font-size: 10px; }
            .p-1 { padding: 0.25rem; }
            .p-2 { padding: 0.5rem; }
            .p-3 { padding: 0.75rem; }
            .p-4 { padding: 1rem; }
            .pb-2 { padding-bottom: 0.5rem; }
            .pb-3 { padding-bottom: 0.75rem; }
            .pt-1 { padding-top: 0.25rem; }
            .pt-2 { padding-top: 0.5rem; }
            .pt-3 { padding-top: 0.75rem; }
            .mb-1 { margin-bottom: 0.25rem; }
            .mb-2 { margin-bottom: 0.5rem; }
            .mb-3 { margin-bottom: 0.75rem; }
            .mb-4 { margin-bottom: 1rem; }
            .mt-1 { margin-top: 0.25rem; }
            .mt-2 { margin-top: 0.5rem; }
            .mt-3 { margin-top: 0.75rem; }
            .space-y-2 > * + * { margin-top: 0.5rem; }
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
            img { max-width: 100%; height: auto; display: block; }
            svg { display: inline-block; vertical-align: middle; width: 0.75rem; height: 0.75rem; }
          </style>
        </head>
        <body>
          <div class="label-container">
            ${labelContent}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 100);
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
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
            {selectedJobIds.size > 0 && (
              <Button 
                onClick={() => {
                  setBatchErrors([]);
                  setBatchAssignDialogOpen(true);
                }}
                data-testid="button-batch-assign"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Assign {selectedJobIds.size} Job{selectedJobIds.size > 1 ? 's' : ''}
              </Button>
            )}
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
            {jobsError ? (
              <ErrorState 
                title="Failed to load jobs"
                message="We couldn't fetch the job list. Please check your connection and try again."
                onRetry={() => refetchJobs()}
              />
            ) : jobsLoading ? (
              <div className="space-y-4">
                {loadingTooLong && (
                  <LoadingTimeout 
                    message="Loading is taking longer than expected. Please wait or try refreshing."
                    onRetry={() => refetchJobs()}
                  />
                )}
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredJobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox 
                        checked={allAssignableSelected}
                        onCheckedChange={toggleAllAssignable}
                        disabled={assignableJobs.length === 0}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Tracking #</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pickup Time</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => {
                    const isAssignable = job.status === 'pending' && !job.driverId && !getActiveAssignment(job.id);
                    return (
                    <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedJobIds.has(job.id)}
                          onCheckedChange={() => toggleJobSelection(job.id)}
                          disabled={!isAssignable}
                          data-testid={`checkbox-job-${job.id}`}
                        />
                      </TableCell>
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
                            {job.paymentStatus !== 'paid' && job.paymentStatus !== 'awaiting_payment' && job.status !== 'cancelled' && job.status !== 'delivered' && (
                              <DropdownMenuItem 
                                onClick={() => handleSendPaymentLink(job.id, job)}
                                disabled={sendPaymentLinkMutation.isPending}
                                data-testid={`menu-send-payment-link-${job.id}`}
                              >
                                {sendPaymentLinkMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <CreditCard className="mr-2 h-4 w-4" />
                                )}
                                Send Payment Link
                              </DropdownMenuItem>
                            )}
                            {job.paymentStatus === 'awaiting_payment' && job.status !== 'cancelled' && job.status !== 'delivered' && (
                              <DropdownMenuItem 
                                onClick={() => resendPaymentLinkMutation.mutate({ jobId: job.id })}
                                disabled={resendPaymentLinkMutation.isPending}
                                data-testid={`menu-resend-payment-link-${job.id}`}
                              >
                                {resendPaymentLinkMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                Resend Payment Link
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
                            {/* Hide/Unhide from driver mobile app */}
                            <DropdownMenuItem 
                              onClick={() => toggleDriverVisibilityMutation.mutate({ 
                                jobId: job.id, 
                                hidden: !(job as any).driverHidden 
                              })}
                              disabled={toggleDriverVisibilityMutation.isPending}
                              data-testid={`menu-toggle-visibility-${job.id}`}
                            >
                              {(job as any).driverHidden ? (
                                <>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Show to Driver
                                </>
                              ) : (
                                <>
                                  <EyeOff className="mr-2 h-4 w-4" />
                                  Hide from Driver
                                </>
                              )}
                            </DropdownMenuItem>
                            {/* Withdraw Assignment - show for jobs with assigned/offered status and a driver */}
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
                    );
                  })}
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
                
                {/* Proof of Delivery Section */}
                {(selectedJob.podPhotoUrl || selectedJob.podSignatureUrl || selectedJob.podRecipientName) && (
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Proof of Delivery
                    </h4>
                    
                    {/* Recipient Name */}
                    {selectedJob.podRecipientName && (
                      <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">Received By</p>
                        <p className="font-medium text-green-700 dark:text-green-400" data-testid="text-pod-recipient">
                          {selectedJob.podRecipientName}
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      {selectedJob.podPhotoUrl && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Delivery Photo</p>
                          <a 
                            href={selectedJob.podPhotoUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img 
                              src={selectedJob.podPhotoUrl} 
                              alt="Proof of Delivery" 
                              className="rounded-lg border max-h-48 object-cover hover:opacity-90 transition-opacity cursor-pointer"
                              data-testid="img-pod-photo"
                            />
                          </a>
                        </div>
                      )}
                      {selectedJob.podSignatureUrl && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Recipient Signature</p>
                          <a 
                            href={selectedJob.podSignatureUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img 
                              src={selectedJob.podSignatureUrl} 
                              alt="Recipient Signature" 
                              className="rounded-lg border bg-white p-2 max-h-32 object-contain hover:opacity-90 transition-opacity cursor-pointer"
                              data-testid="img-pod-signature"
                            />
                          </a>
                        </div>
                      )}
                    </div>
                    {selectedJob.deliveredAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Delivered on {formatDate(selectedJob.deliveredAt)}
                      </p>
                    )}
                  </div>
                )}
                
                {/* No POD warning for delivered jobs */}
                {selectedJob.status === 'delivered' && !selectedJob.podPhotoUrl && !selectedJob.podSignatureUrl && (
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                      <AlertCircle className="h-4 w-4" />
                      <p className="text-sm">No Proof of Delivery was submitted for this job</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Assign Driver Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={(open) => {
          setAssignDialogOpen(open);
          if (!open) {
            setSelectedDriverForAssign('');
            setAssignDriverPrice('');
          }
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
                <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-md">
                  <div>
                    <p className="text-xs text-muted-foreground">Customer Price</p>
                    <p className="font-semibold">{formatPrice(jobToAssign.totalPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Route</p>
                    <p className="font-mono text-sm">{jobToAssign.pickupPostcode} → {jobToAssign.deliveryPostcode}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assign-driver-select">Select Driver</Label>
                  <Select value={selectedDriverForAssign} onValueChange={setSelectedDriverForAssign}>
                    <SelectTrigger id="assign-driver-select" data-testid="select-assign-driver">
                      <SelectValue placeholder="Choose a driver..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allDriversWithInfo.map((driver) => (
                        <SelectItem 
                          key={driver.id} 
                          value={driver.id}
                        >
                          <div className="flex items-center gap-2">
                            {driver.driverCode && (
                              <span className="font-mono font-bold text-blue-600">{driver.driverCode}</span>
                            )}
                            <span>{driver.name}</span>
                            <Badge variant="outline" className="capitalize text-xs">{driver.vehicleType?.replace('_', ' ')}</Badge>
                            {driver.isAvailable && (
                              <Badge variant="secondary" className="text-xs text-green-600">Online</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <p className="text-xs text-muted-foreground">
                    This is the amount the driver will receive for completing this job.
                  </p>
                </div>

                {selectedDriverForAssign && assignDriverPrice && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                    <p className="text-sm">
                      <span className="font-medium">Summary:</span> Assign to{' '}
                      <span className="font-semibold">
                        {allDriversWithInfo.find(d => d.id === selectedDriverForAssign)?.name}
                      </span>{' '}
                      for <span className="font-semibold">£{parseFloat(assignDriverPrice).toFixed(2)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Driver will receive a notification to accept or decline this assignment.
                    </p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAssignDialogOpen(false)}
                data-testid="button-cancel-assign"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (jobToAssign && selectedDriverForAssign && assignDriverPrice) {
                    assignDriverMutation.mutate({
                      jobId: jobToAssign.id,
                      driverId: selectedDriverForAssign,
                      driverPrice: assignDriverPrice,
                      assignedBy: 'admin', // This would be the actual admin user ID
                    });
                  }
                }}
                disabled={!selectedDriverForAssign || !assignDriverPrice || assignDriverMutation.isPending}
                data-testid="button-send-assignment"
              >
                {assignDriverMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Assignment'
                )}
              </Button>
            </DialogFooter>
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

        {/* Customer Email Dialog for Payment Link */}
        <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Customer Email Required
              </DialogTitle>
              <DialogDescription>
                Please enter the customer's email address to send the payment link.
              </DialogDescription>
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
              <Button 
                variant="outline" 
                onClick={() => {
                  setEmailDialogOpen(false);
                  setEmailDialogJobId('');
                  setCustomerEmail('');
                  setCustomerName('');
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSendPaymentLinkWithEmail} 
                disabled={!customerEmail || sendPaymentLinkMutation.isPending}
                data-testid="button-send-payment-link"
              >
                {sendPaymentLinkMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Payment Link
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Batch Assign Dialog */}
        <Dialog open={batchAssignDialogOpen} onOpenChange={(open) => {
          setBatchAssignDialogOpen(open);
          if (!open) {
            setBatchErrors([]);
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Batch Assign Jobs
              </DialogTitle>
              <DialogDescription>
                Assign {selectedJobIds.size} job{selectedJobIds.size > 1 ? 's' : ''} to a driver with the same driver payment.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {batchErrors.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Failed Assignments
                  </Label>
                  <div className="max-h-32 overflow-y-auto border border-destructive/50 rounded p-2 bg-destructive/10">
                    {batchErrors.map(({ jobId, error }) => {
                      const job = jobs?.find(j => j.id === jobId);
                      return (
                        <div key={jobId} className="text-sm py-1" data-testid={`batch-error-${jobId}`}>
                          <span className="font-mono text-destructive">{job?.trackingNumber || jobId}</span>
                          <span className="text-muted-foreground ml-2">- {error}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Selected Jobs ({selectedJobIds.size})</Label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 bg-muted/50">
                  {Array.from(selectedJobIds).map(jobId => {
                    const job = jobs?.find(j => j.id === jobId);
                    const hasError = batchErrors.some(e => e.jobId === jobId);
                    return job ? (
                      <div key={jobId} className={`text-sm py-1 flex justify-between items-center ${hasError ? 'text-destructive' : ''}`}>
                        <span className="font-mono">{job.trackingNumber}</span>
                        <span className="text-muted-foreground">{job.pickupPostcode} → {job.deliveryPostcode}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-driver">Select Driver *</Label>
                <Select value={batchDriverId} onValueChange={setBatchDriverId}>
                  <SelectTrigger id="batch-driver" data-testid="select-batch-driver">
                    <SelectValue placeholder="Choose a driver" />
                  </SelectTrigger>
                  <SelectContent>
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
              <div className="space-y-2">
                <Label htmlFor="batch-driver-price">Driver Payment per Job (£) *</Label>
                <Input
                  id="batch-driver-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 15.00"
                  value={batchDriverPrice}
                  onChange={(e) => setBatchDriverPrice(e.target.value)}
                  data-testid="input-batch-driver-price"
                />
                <p className="text-xs text-muted-foreground">
                  Total: £{((parseFloat(batchDriverPrice) || 0) * selectedJobIds.size).toFixed(2)} for {selectedJobIds.size} job{selectedJobIds.size > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setBatchAssignDialogOpen(false);
                  setBatchDriverId('');
                  setBatchDriverPrice('');
                  setBatchErrors([]);
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (!batchDriverId || !batchDriverPrice) return;
                  batchAssignMutation.mutate({
                    jobIds: Array.from(selectedJobIds),
                    driverId: batchDriverId,
                    driverPrice: batchDriverPrice,
                  });
                }}
                disabled={!batchDriverId || !batchDriverPrice || batchAssignMutation.isPending}
                data-testid="button-confirm-batch-assign"
              >
                {batchAssignMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Assign {selectedJobIds.size} Job{selectedJobIds.size > 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
