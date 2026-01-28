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
import { Textarea } from '@/components/ui/textarea';
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
  Building2,
  User,
  Check,
} from 'lucide-react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ShippingLabel } from '@/components/ShippingLabel';
import { MultiDropShippingLabels } from '@/components/MultiDropShippingLabels';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useAuth } from '@/context/AuthContext';
import { supabaseFunctions } from '@/lib/supabaseFunctions';
import type { Job, Driver, JobStatus, JobAssignment, CustomerType, VehicleType } from '@shared/schema';
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
  { value: 'failed', label: 'Failed' },
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
    failed: { label: 'Failed', className: 'bg-red-700' },
  };
  const config = statusConfig[status] || { label: status, className: 'bg-gray-500' };
  return <Badge className={`${config.className} text-white`} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
};

// Type for multi-drop stop
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

// Component to display multi-drop stops for a job with status update capability
function MultiDropStopsSection({ jobId, isMultiDrop }: { jobId: string; isMultiDrop?: boolean }) {
  const { toast } = useToast();
  const [updatingStopId, setUpdatingStopId] = useState<string | null>(null);
  const { data, isLoading } = useQuery<{ stops: MultiDropStop[] }>({
    queryKey: [`/api/jobs/${jobId}/stops`],
    enabled: !!isMultiDrop && !!jobId,
  });

  const updateStopStatusMutation = useMutation({
    mutationFn: async ({ stopId, status }: { stopId: string; status: string }) => {
      setUpdatingStopId(stopId);
      const response = await apiRequest('PATCH', `/api/jobs/${jobId}/stops/${stopId}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}/stops`] });
      toast({ title: 'Stop status updated' });
      setUpdatingStopId(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update stop', description: error?.message, variant: 'destructive' });
      setUpdatingStopId(null);
    },
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
        {stops.map((stop, index) => (
          <div 
            key={stop.id} 
            className="p-3 bg-muted/50 rounded-lg border"
            data-testid={`stop-${stop.stopOrder}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">Stop {stop.stopOrder}</Badge>
                  {stop.status === 'delivered' ? (
                    <Badge className="bg-green-500 text-white text-xs">Delivered</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatingStopId === stop.id}
                    onClick={() => updateStopStatusMutation.mutate({
                      stopId: stop.id,
                      status: stop.status === 'delivered' ? 'pending' : 'delivered'
                    })}
                    data-testid={`button-toggle-stop-${stop.stopOrder}`}
                  >
                    {updatingStopId === stop.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : stop.status === 'delivered' ? (
                      <>
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Mark Pending
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Mark Delivered
                      </>
                    )}
                  </Button>
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
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    Instructions: {stop.instructions}
                  </p>
                )}
              </div>
              {/* POD for this stop */}
              {(stop.podPhotoUrl || stop.podSignatureUrl) && (
                <div className="flex gap-2">
                  {stop.podPhotoUrl && (
                    <a href={stop.podPhotoUrl} target="_blank" rel="noopener noreferrer">
                      <img 
                        src={stop.podPhotoUrl} 
                        alt={`Stop ${stop.stopOrder} POD`}
                        className="w-16 h-16 object-cover rounded border"
                      />
                    </a>
                  )}
                  {stop.podSignatureUrl && (
                    <a href={stop.podSignatureUrl} target="_blank" rel="noopener noreferrer">
                      <img 
                        src={stop.podSignatureUrl} 
                        alt={`Stop ${stop.stopOrder} Signature`}
                        className="w-16 h-16 object-contain rounded border bg-white p-1"
                      />
                    </a>
                  )}
                </div>
              )}
            </div>
            {stop.podRecipientName && (
              <p className="text-xs text-green-600 mt-2">
                Signed by: {stop.podRecipientName}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminJobs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [jobToEdit, setJobToEdit] = useState<Job | null>(null);
  const [editStatus, setEditStatus] = useState<JobStatus>('pending');
  const [editDriverId, setEditDriverId] = useState<string>('');
  const [editTotalPrice, setEditTotalPrice] = useState<string>('');
  const [editDriverPrice, setEditDriverPrice] = useState<string>('');
  // Extended edit fields
  const [editPickupAddress, setEditPickupAddress] = useState<string>('');
  const [editPickupPostcode, setEditPickupPostcode] = useState<string>('');
  const [editPickupBuildingName, setEditPickupBuildingName] = useState<string>('');
  const [editPickupContactName, setEditPickupContactName] = useState<string>('');
  const [editPickupContactPhone, setEditPickupContactPhone] = useState<string>('');
  const [editPickupInstructions, setEditPickupInstructions] = useState<string>('');
  const [editDeliveryAddress, setEditDeliveryAddress] = useState<string>('');
  const [editDeliveryPostcode, setEditDeliveryPostcode] = useState<string>('');
  const [editDeliveryBuildingName, setEditDeliveryBuildingName] = useState<string>('');
  const [editRecipientName, setEditRecipientName] = useState<string>('');
  const [editRecipientPhone, setEditRecipientPhone] = useState<string>('');
  const [editDeliveryInstructions, setEditDeliveryInstructions] = useState<string>('');
  const [editVehicleType, setEditVehicleType] = useState<string>('car');
  const [editWeight, setEditWeight] = useState<string>('1');
  const [editDistance, setEditDistance] = useState<string>('0');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [jobForLabel, setJobForLabel] = useState<Job | null>(null);
  const [multiDropStops, setMultiDropStops] = useState<{ id: number; address: string; postcode: string; stopOrder: number; recipientName?: string; recipientPhone?: string; deliveryInstructions?: string; }[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [jobToCancel, setJobToCancel] = useState<Job | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
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
      const response = await apiRequest('POST', '/api/job-assignments', {
        jobId,
        driverId,
        driverPrice,
        assignedBy,
      });
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
      // Use local backend API for batch assignment with auth headers
      const response = await apiRequest('POST', '/api/job-assignments/batch', {
        jobIds,
        driverId,
        assignedBy: user?.id,
        driverPrice,
      });
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
      
      const successCount = data.successCount || data.assignments?.length || 0;
      const driverPriceNum = parseFloat(batchDriverPrice) || 0;
      const totalPrice = successCount * driverPriceNum;
      
      toast({ 
        title: 'Batch assignment complete', 
        description: `${successCount} job${successCount > 1 ? 's' : ''} assigned to the driver. Total: £${totalPrice.toFixed(2)}` 
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
    mutationFn: async ({ jobId, cancellationReason }: { jobId: string; cancellationReason?: string }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/status`, { status: 'cancelled', cancellationReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ title: 'Job cancelled', description: 'Cancellation email sent to customer.' });
      setCancelDialogOpen(false);
      setJobToCancel(null);
      setCancellationReason('');
    },
    onError: () => {
      toast({ title: 'Failed to cancel job', variant: 'destructive' });
    },
  });

  const updateDriverPaymentMutation = useMutation({
    mutationFn: async ({ jobId, driverPaymentStatus }: { jobId: string; driverPaymentStatus: 'unpaid' | 'paid' }) => {
      return apiRequest('PATCH', `/api/jobs/${jobId}/driver-payment`, { driverPaymentStatus });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ 
        title: variables.driverPaymentStatus === 'paid' ? 'Driver marked as paid' : 'Payment status updated',
        description: variables.driverPaymentStatus === 'paid' ? 'Driver payment has been recorded.' : 'Status set to unpaid.' 
      });
    },
    onError: () => {
      toast({ title: 'Failed to update payment status', variant: 'destructive' });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest('DELETE', `/api/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
      toast({ title: 'Job deleted', description: 'The job has been permanently removed.' });
      setDeleteDialogOpen(false);
      setJobToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete job', description: error?.message || 'Please try again', variant: 'destructive' });
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
    // Extended fields
    setEditPickupAddress(job.pickupAddress || '');
    setEditPickupPostcode(job.pickupPostcode || '');
    setEditPickupBuildingName((job as any).pickupBuildingName || '');
    setEditPickupContactName((job as any).pickupContactName || '');
    setEditPickupContactPhone((job as any).pickupContactPhone || '');
    setEditPickupInstructions((job as any).pickupInstructions || '');
    setEditDeliveryAddress(job.deliveryAddress || '');
    setEditDeliveryPostcode(job.deliveryPostcode || '');
    setEditDeliveryBuildingName((job as any).deliveryBuildingName || '');
    setEditRecipientName((job as any).recipientName || '');
    setEditRecipientPhone((job as any).recipientPhone || '');
    setEditDeliveryInstructions((job as any).deliveryInstructions || '');
    setEditVehicleType(job.vehicleType || 'car');
    setEditWeight(job.weight?.toString() || '1');
    setEditDistance(job.distance?.toString() || '0');
    setEditDialogOpen(true);
  };

  // Recalculate quote when postcodes, vehicle type, or weight change
  const recalculateQuote = async () => {
    if (!editPickupPostcode || !editDeliveryPostcode) {
      toast({ title: 'Missing postcodes', description: 'Please enter both pickup and delivery postcodes.', variant: 'destructive' });
      return;
    }
    
    setIsRecalculating(true);
    try {
      // Get distance from API - use GET with query params
      const origin = encodeURIComponent(editPickupPostcode + ', UK');
      const drops = encodeURIComponent(editDeliveryPostcode + ', UK');
      const response = await fetch(`/api/maps/optimized-route?origin=${origin}&drops=${drops}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Route API error:', errorText);
        throw new Error('Failed to calculate route');
      }
      
      const data = await response.json();
      const distance = data.legs?.[0]?.distance || data.totalDistance || 0;
      setEditDistance(distance.toFixed(1));
      
      // Import pricing calculation
      const { calculateQuote } = await import('@/lib/pricing');
      const weight = parseFloat(editWeight) || 1;
      const vehicleType = editVehicleType as any;
      
      const quote = calculateQuote(vehicleType, distance, weight, {
        pickupPostcode: editPickupPostcode,
        deliveryPostcode: editDeliveryPostcode,
      });
      
      setEditTotalPrice(quote.totalPrice.toFixed(2));
      toast({ title: 'Quote recalculated', description: `New price: £${quote.totalPrice.toFixed(2)} (${distance.toFixed(1)} miles)` });
    } catch (error: any) {
      console.error('Quote recalculation error:', error);
      toast({ title: 'Failed to recalculate quote', description: error?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSaveEdit = () => {
    if (!jobToEdit) return;

    const updates: Partial<Job> & Record<string, any> = {
      status: editStatus,
      totalPrice: editTotalPrice,
      driverPrice: editDriverPrice || null,
      // Extended fields
      pickupAddress: editPickupAddress,
      pickupPostcode: editPickupPostcode,
      pickupBuildingName: editPickupBuildingName || null,
      pickupContactName: editPickupContactName || null,
      pickupContactPhone: editPickupContactPhone || null,
      pickupInstructions: editPickupInstructions || null,
      deliveryAddress: editDeliveryAddress,
      deliveryPostcode: editDeliveryPostcode,
      deliveryBuildingName: editDeliveryBuildingName || null,
      recipientName: editRecipientName || null,
      recipientPhone: editRecipientPhone || null,
      deliveryInstructions: editDeliveryInstructions || null,
      vehicleType: editVehicleType as VehicleType,
      weight: editWeight,
      distance: editDistance,
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
    const matchesCustomerType = customerTypeFilter === 'all' || (job as any).customerType === customerTypeFilter;
    return matchesSearch && matchesStatus && matchesCustomerType;
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

  // Multi-select helpers - allow selecting jobs that are pending or have been offered but not yet picked up
  const assignableJobs = filteredJobs.filter(job => 
    ['pending', 'offered', 'assigned'].includes(job.status) && 
    !['picked_up', 'on_the_way_delivery', 'delivered', 'cancelled'].includes(job.status)
  );
  const allAssignableSelected = assignableJobs.length > 0 && 
    assignableJobs.every(job => selectedJobIds.has(String(job.id)));
  
  const toggleJobSelection = (jobId: string | number) => {
    const idStr = String(jobId);
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(idStr)) {
        next.delete(idStr);
      } else {
        next.add(idStr);
      }
      return next;
    });
  };

  const toggleAllAssignable = () => {
    if (allAssignableSelected) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(assignableJobs.map(job => String(job.id))));
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
                  {filteredJobs.map((job) => {
                    const isAssignable = ['pending', 'offered', 'assigned'].includes(job.status) && 
                      !['picked_up', 'on_the_way_delivery', 'delivered', 'cancelled'].includes(job.status);
                    return (
                    <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedJobIds.has(String(job.id))}
                          onCheckedChange={() => toggleJobSelection(job.id)}
                          disabled={!isAssignable}
                          data-testid={`checkbox-job-${job.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{job.trackingNumber}</TableCell>
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
                      <TableCell>{getDriverName(job.driverId)}</TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(job.createdAt)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPrice(job.totalPrice)}</TableCell>
                      <TableCell className="text-right">
                        {job.driverPrice ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-medium text-green-600">{formatPrice(job.driverPrice)}</span>
                            <Badge 
                              variant="default"
                              className={`text-xs cursor-pointer ${job.driverPaymentStatus === 'paid' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                              onClick={() => updateDriverPaymentMutation.mutate({ 
                                jobId: job.id, 
                                driverPaymentStatus: job.driverPaymentStatus === 'paid' ? 'unpaid' : 'paid' 
                              })}
                              data-testid={`badge-payment-${job.id}`}
                            >
                              {job.driverPaymentStatus === 'paid' ? 'PAID' : 'UNPAID'}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
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
                                onClick={() => { setJobToCancel(job); setCancelDialogOpen(true); }}
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
                            {/* Delete Job - permanent deletion */}
                            <DropdownMenuItem 
                              onClick={() => { setJobToDelete(job); setDeleteDialogOpen(true); }}
                              className="text-destructive"
                              data-testid={`menu-delete-${job.id}`}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Job
                            </DropdownMenuItem>
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
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Job Details - {selectedJob?.trackingNumber}</DialogTitle>
              <DialogDescription>
                Created on {selectedJob && formatDate(selectedJob.createdAt)}
              </DialogDescription>
            </DialogHeader>
            {selectedJob && (
              <div className="space-y-6 overflow-y-auto flex-1 pr-2">
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
                  <div className="p-3 bg-muted/50 rounded-md space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Driver Payment</p>
                      <Badge 
                        variant="default"
                        className={`cursor-pointer ${selectedJob.driverPaymentStatus === 'paid' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                        onClick={() => updateDriverPaymentMutation.mutate({ 
                          jobId: selectedJob.id, 
                          driverPaymentStatus: selectedJob.driverPaymentStatus === 'paid' ? 'unpaid' : 'paid' 
                        })}
                        data-testid="badge-driver-payment-status"
                      >
                        {selectedJob.driverPaymentStatus === 'paid' ? 'PAID' : 'UNPAID'}
                      </Badge>
                    </div>
                    <p className="font-semibold text-lg text-green-600">{formatPrice(selectedJob.driverPrice)}</p>
                    {selectedJob.driverPaymentStatus === 'paid' && selectedJob.driverPaidAt && (
                      <p className="text-xs text-muted-foreground">
                        Paid on {new Date(selectedJob.driverPaidAt).toLocaleDateString('en-GB', { 
                          day: 'numeric', month: 'short', year: 'numeric' 
                        })}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      {selectedJob.driverPaymentStatus !== 'paid' ? (
                        <Button 
                          size="sm" 
                          variant="default"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => updateDriverPaymentMutation.mutate({ 
                            jobId: selectedJob.id, 
                            driverPaymentStatus: 'paid' 
                          })}
                          disabled={updateDriverPaymentMutation.isPending}
                          data-testid="button-mark-paid"
                        >
                          {updateDriverPaymentMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Mark as Paid
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => updateDriverPaymentMutation.mutate({ 
                            jobId: selectedJob.id, 
                            driverPaymentStatus: 'unpaid' 
                          })}
                          disabled={updateDriverPaymentMutation.isPending}
                          data-testid="button-mark-unpaid"
                        >
                          {updateDriverPaymentMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          Mark as Unpaid
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
                
                {/* Multi-Drop Stops Section */}
                <MultiDropStopsSection jobId={selectedJob.id} isMultiDrop={selectedJob.isMultiDrop ?? false} />
                
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
                        {(() => {
                          const d = allDriversWithInfo.find(d => d.id === selectedDriverForAssign);
                          return d?.driverCode ? `${d.driverCode} · ${d.name}` : d?.name;
                        })()}
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
                  if (jobToAssign && selectedDriverForAssign && assignDriverPrice && user?.id) {
                    assignDriverMutation.mutate({
                      jobId: jobToAssign.id,
                      driverId: selectedDriverForAssign,
                      driverPrice: assignDriverPrice,
                      assignedBy: user.id,
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

        {/* Edit Job Dialog - Full Edit */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Edit3 className="h-5 w-5" />
                Edit Job
              </DialogTitle>
              <DialogDescription>
                <span className="font-mono font-bold text-foreground">{jobToEdit?.trackingNumber}</span>
                <span className="text-muted-foreground ml-2">(Job number will not change)</span>
              </DialogDescription>
            </DialogHeader>
            {jobToEdit && (
              <div className="space-y-6 overflow-y-auto flex-1 pr-2">
                {/* Pickup Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-green-500" />
                    Pickup Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="edit-pickup-address">Pickup Address</Label>
                      <Input
                        id="edit-pickup-address"
                        value={editPickupAddress}
                        onChange={(e) => setEditPickupAddress(e.target.value)}
                        placeholder="Full pickup address"
                        data-testid="input-edit-pickup-address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-pickup-postcode">Pickup Postcode</Label>
                      <Input
                        id="edit-pickup-postcode"
                        value={editPickupPostcode}
                        onChange={(e) => setEditPickupPostcode(e.target.value.toUpperCase())}
                        placeholder="e.g. SW1A 1AA"
                        className="font-mono"
                        data-testid="input-edit-pickup-postcode"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-pickup-building">Building Name</Label>
                      <Input
                        id="edit-pickup-building"
                        value={editPickupBuildingName}
                        onChange={(e) => setEditPickupBuildingName(e.target.value)}
                        placeholder="Optional"
                        data-testid="input-edit-pickup-building"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-pickup-contact-name">Contact Name</Label>
                      <Input
                        id="edit-pickup-contact-name"
                        value={editPickupContactName}
                        onChange={(e) => setEditPickupContactName(e.target.value)}
                        placeholder="Sender name"
                        data-testid="input-edit-pickup-contact-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-pickup-contact-phone">Contact Phone</Label>
                      <Input
                        id="edit-pickup-contact-phone"
                        value={editPickupContactPhone}
                        onChange={(e) => setEditPickupContactPhone(e.target.value)}
                        placeholder="Phone number"
                        data-testid="input-edit-pickup-contact-phone"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="edit-pickup-instructions">Pickup Instructions</Label>
                      <Textarea
                        id="edit-pickup-instructions"
                        value={editPickupInstructions}
                        onChange={(e) => setEditPickupInstructions(e.target.value)}
                        placeholder="Special instructions for pickup..."
                        className="resize-none"
                        rows={2}
                        data-testid="input-edit-pickup-instructions"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Delivery Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-red-500" />
                    Delivery Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="edit-delivery-address">Delivery Address</Label>
                      <Input
                        id="edit-delivery-address"
                        value={editDeliveryAddress}
                        onChange={(e) => setEditDeliveryAddress(e.target.value)}
                        placeholder="Full delivery address"
                        data-testid="input-edit-delivery-address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-delivery-postcode">Delivery Postcode</Label>
                      <Input
                        id="edit-delivery-postcode"
                        value={editDeliveryPostcode}
                        onChange={(e) => setEditDeliveryPostcode(e.target.value.toUpperCase())}
                        placeholder="e.g. EC1A 1BB"
                        className="font-mono"
                        data-testid="input-edit-delivery-postcode"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-delivery-building">Building Name</Label>
                      <Input
                        id="edit-delivery-building"
                        value={editDeliveryBuildingName}
                        onChange={(e) => setEditDeliveryBuildingName(e.target.value)}
                        placeholder="Optional"
                        data-testid="input-edit-delivery-building"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-recipient-name">Recipient Name</Label>
                      <Input
                        id="edit-recipient-name"
                        value={editRecipientName}
                        onChange={(e) => setEditRecipientName(e.target.value)}
                        placeholder="Recipient name"
                        data-testid="input-edit-recipient-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-recipient-phone">Recipient Phone</Label>
                      <Input
                        id="edit-recipient-phone"
                        value={editRecipientPhone}
                        onChange={(e) => setEditRecipientPhone(e.target.value)}
                        placeholder="Phone number"
                        data-testid="input-edit-recipient-phone"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="edit-delivery-instructions">Delivery Instructions</Label>
                      <Textarea
                        id="edit-delivery-instructions"
                        value={editDeliveryInstructions}
                        onChange={(e) => setEditDeliveryInstructions(e.target.value)}
                        placeholder="Special instructions for delivery..."
                        className="resize-none"
                        rows={2}
                        data-testid="input-edit-delivery-instructions"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Vehicle & Package Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Vehicle & Package
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-vehicle-type">Vehicle Type</Label>
                      <Select value={editVehicleType} onValueChange={setEditVehicleType}>
                        <SelectTrigger id="edit-vehicle-type" data-testid="select-edit-vehicle-type">
                          <SelectValue placeholder="Select vehicle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="motorbike">Motorbike</SelectItem>
                          <SelectItem value="car">Car</SelectItem>
                          <SelectItem value="small_van">Small Van</SelectItem>
                          <SelectItem value="medium_van">Medium Van</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-weight">Weight (kg)</Label>
                      <Input
                        id="edit-weight"
                        type="number"
                        step="0.1"
                        min="0"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        data-testid="input-edit-weight"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-distance">Distance (miles)</Label>
                      <Input
                        id="edit-distance"
                        type="number"
                        step="0.1"
                        min="0"
                        value={editDistance}
                        onChange={(e) => setEditDistance(e.target.value)}
                        data-testid="input-edit-distance"
                      />
                    </div>
                  </div>
                  
                  {/* Recalculate Quote Button */}
                  <Button
                    variant="outline"
                    onClick={recalculateQuote}
                    disabled={isRecalculating}
                    className="w-full"
                    data-testid="button-recalculate-quote"
                  >
                    {isRecalculating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Recalculating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Recalculate Quote from Postcodes
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Click to recalculate distance and price based on the current postcodes
                  </p>
                </div>

                <Separator />

                {/* Status & Assignment Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Status & Assignment</h3>
                  <div className="grid grid-cols-2 gap-4">
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
                  </div>
                </div>

                <Separator />

                {/* Pricing Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Pricing</h3>
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
            <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t">
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
          <DialogContent className={jobForLabel?.isMultiDrop && multiDropStops.length > 0 ? "max-w-2xl max-h-[80vh]" : "max-w-lg"}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Print Shipping Label{jobForLabel?.isMultiDrop && multiDropStops.length > 0 ? 's' : ''}
              </DialogTitle>
              <DialogDescription>
                {jobForLabel?.isMultiDrop && multiDropStops.length > 0 
                  ? `${multiDropStops.length + 1} labels for multi-drop job ${jobForLabel?.trackingNumber}`
                  : `4" x 6" Professional Shipping Label for ${jobForLabel?.trackingNumber}`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-auto" style={{ maxHeight: '50vh' }}>
              {loadingStops ? (
                <div className="flex items-center gap-2 py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading multi-drop stops...</span>
                </div>
              ) : jobForLabel && jobForLabel.isMultiDrop && multiDropStops.length > 0 ? (
                <div className="transform origin-top" style={{ transform: 'scale(0.5)' }}>
                  <MultiDropShippingLabels 
                    ref={labelRef} 
                    job={jobForLabel} 
                    stops={multiDropStops}
                    driverName={getDriverName(jobForLabel.driverId)} 
                  />
                </div>
              ) : jobForLabel ? (
                <div className="transform origin-top" style={{ transform: 'scale(0.6)' }}>
                  <ShippingLabel 
                    ref={labelRef} 
                    job={jobForLabel} 
                    driverName={getDriverName(jobForLabel.driverId)} 
                  />
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setLabelDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePrintLabel} className="gap-2" data-testid="button-print-label" disabled={loadingStops}>
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

        {/* Cancel Job Dialog */}
        <Dialog open={cancelDialogOpen} onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) {
            setJobToCancel(null);
            setCancellationReason('');
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive">Cancel Job</DialogTitle>
              <DialogDescription>
                Please provide a reason for cancelling this job. The customer will receive an email notification.
              </DialogDescription>
            </DialogHeader>
            {jobToCancel && (
              <div className="space-y-4 py-4">
                <div className="p-3 bg-muted rounded-md space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tracking #</span>
                    <span className="font-mono font-medium">{jobToCancel.trackingNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Route</span>
                    <span className="font-mono text-sm">{jobToCancel.pickupPostcode} → {jobToCancel.deliveryPostcode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Customer</span>
                    <span className="text-sm">{jobToCancel.pickupContactName || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cancellation-reason">Cancellation Reason</Label>
                  <Textarea
                    id="cancellation-reason"
                    placeholder="Enter the reason for cancellation (e.g., Customer request, Unable to fulfil order, etc.)"
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    rows={3}
                    data-testid="input-cancellation-reason"
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setCancelDialogOpen(false);
                  setJobToCancel(null);
                  setCancellationReason('');
                }}
                data-testid="button-cancel-dialog-close"
              >
                Go Back
              </Button>
              <Button 
                variant="destructive"
                onClick={() => jobToCancel && cancelJobMutation.mutate({ 
                  jobId: jobToCancel.id, 
                  cancellationReason: cancellationReason.trim() || undefined 
                })}
                disabled={cancelJobMutation.isPending}
                data-testid="button-confirm-cancel"
              >
                {cancelJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel Job
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Job Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setJobToDelete(null);
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive">Delete Job</DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete this job? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {jobToDelete && (
              <div className="space-y-3 py-4">
                <div className="p-3 bg-muted rounded-md space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tracking #</span>
                    <span className="font-mono font-medium">{jobToDelete.trackingNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Route</span>
                    <span className="font-mono text-sm">{jobToDelete.pickupPostcode} → {jobToDelete.deliveryPostcode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    {getStatusBadge(jobToDelete.status)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="font-medium">{formatPrice(jobToDelete.totalPrice)}</span>
                  </div>
                </div>
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive">
                    This will permanently remove the job and all associated data including assignments and payment records.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setJobToDelete(null);
                }}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={() => jobToDelete && deleteJobMutation.mutate(jobToDelete.id)}
                disabled={deleteJobMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Job
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
