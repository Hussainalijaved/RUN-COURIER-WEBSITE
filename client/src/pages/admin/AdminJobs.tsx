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
import { Switch } from '@/components/ui/switch';
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
  Route,
  X,
  Upload,
  Camera,
} from 'lucide-react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ShippingLabel } from '@/components/ShippingLabel';
import { MultiDropShippingLabels } from '@/components/MultiDropShippingLabels';
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useAuth } from '@/context/AuthContext';
import { supabaseFunctions } from '@/lib/supabaseFunctions';
import { supabase } from '@/lib/supabase';
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
  const [uploadingStopId, setUploadingStopId] = useState<string | null>(null);
  const [deletingStopPodId, setDeletingStopPodId] = useState<string | null>(null);
  const stopPodFileInputRef = useRef<HTMLInputElement>(null);
  const [activeStopIdForUpload, setActiveStopIdForUpload] = useState<string | null>(null);
  const activeStopIdRef = useRef<string | null>(null);
  const { data, isLoading } = useQuery<{ stops: MultiDropStop[] }>({
    queryKey: [`/api/jobs/${jobId}/stops`],
    enabled: !!isMultiDrop && !!jobId,
  });

  const updateStopStatusMutation = useMutation({
    mutationFn: async ({ stopId, status }: { stopId: string; status: string }) => {
      setUpdatingStopId(stopId);
      const response = await apiRequest('PATCH', `/api/jobs/${jobId}/stops/${stopId}`, { status });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to update stop status');
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}/stops`] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({ title: `Stop ${result.stop?.stopOrder || ''} marked as ${result.stop?.status || 'updated'}` });
      setUpdatingStopId(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update stop', description: error?.message, variant: 'destructive' });
      setUpdatingStopId(null);
    },
  });

  const handleStopPodUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const stopId = activeStopIdRef.current || activeStopIdForUpload;
    if (!file || !stopId) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload an image file (JPEG, PNG, GIF, or WebP)', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return;
    }

    setUploadingStopId(stopId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Authentication required');

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/jobs/${jobId}/stops/${stopId}/pod/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      toast({ title: 'Stop POD uploaded', description: 'Proof of Delivery photo uploaded for this stop' });
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}/stops`] });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message || 'Failed to upload POD photo', variant: 'destructive' });
    } finally {
      setUploadingStopId(null);
      setActiveStopIdForUpload(null);
      activeStopIdRef.current = null;
      if (stopPodFileInputRef.current) stopPodFileInputRef.current.value = '';
    }
  };

  const handleDeleteStopPod = async (stopId: string) => {
    setDeletingStopPodId(stopId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Authentication required');

      const response = await fetch(`/api/jobs/${jobId}/stops/${stopId}/pod`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }

      toast({ title: 'POD removed', description: 'Stop POD photo has been removed' });
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}/stops`] });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message || 'Failed to remove POD photo', variant: 'destructive' });
    } finally {
      setDeletingStopPodId(null);
    }
  };

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
      <input
        type="file"
        ref={stopPodFileInputRef}
        className="hidden"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleStopPodUpload}
        data-testid="input-stop-pod-upload"
      />
      <div className="space-y-3">
        {stops.map((stop) => (
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
            </div>
            {stop.podRecipientName && (
              <p className="text-xs text-green-600 mt-2">
                Signed by: {stop.podRecipientName}
              </p>
            )}
            {/* Per-stop POD section */}
            <div className="mt-3 pt-2 border-t border-dashed">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Camera className="h-3 w-3" />
                  Stop POD
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploadingStopId === stop.id}
                  onClick={() => {
                    activeStopIdRef.current = stop.id;
                    setActiveStopIdForUpload(stop.id);
                    stopPodFileInputRef.current?.click();
                  }}
                  data-testid={`button-upload-stop-pod-${stop.stopOrder}`}
                >
                  {uploadingStopId === stop.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Camera className="h-3 w-3 mr-1" />
                  )}
                  {stop.podPhotoUrl ? 'Re-upload' : 'Upload POD'}
                </Button>
              </div>
              <div className="flex gap-3 flex-wrap">
                {stop.podPhotoUrl && (
                  <div className="relative group">
                    <a href={stop.podPhotoUrl} target="_blank" rel="noopener noreferrer" className="block">
                      <img 
                        src={stop.podPhotoUrl} 
                        alt={`Stop ${stop.stopOrder} POD`}
                        className="rounded-lg border max-h-32 w-auto object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        data-testid={`img-stop-pod-${stop.stopOrder}`}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </a>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ visibility: 'visible' }}
                      disabled={deletingStopPodId === stop.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteStopPod(stop.id);
                      }}
                      data-testid={`button-delete-stop-pod-${stop.stopOrder}`}
                    >
                      {deletingStopPodId === stop.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}
                {stop.podSignatureUrl && (
                  <a href={stop.podSignatureUrl} target="_blank" rel="noopener noreferrer">
                    <img 
                      src={stop.podSignatureUrl} 
                      alt={`Stop ${stop.stopOrder} Signature`}
                      className="max-h-32 w-auto object-contain rounded-lg border bg-white p-1"
                      data-testid={`img-stop-signature-${stop.stopOrder}`}
                    />
                  </a>
                )}
                {!stop.podPhotoUrl && !stop.podSignatureUrl && (
                  <p className="text-xs text-muted-foreground italic">No POD uploaded for this stop</p>
                )}
              </div>
            </div>
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
  const [editIsMultiDrop, setEditIsMultiDrop] = useState(false);
  const [editIsReturnTrip, setEditIsReturnTrip] = useState(false);
  const [editMultiDropStops, setEditMultiDropStops] = useState<{ address: string; postcode: string; recipientName?: string; recipientPhone?: string; deliveryInstructions?: string; }[]>([]);
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
  
  // POD upload state
  const [uploadingPod, setUploadingPod] = useState(false);
  const [deletingPodUrl, setDeletingPodUrl] = useState<string | null>(null);
  const podFileInputRef = useRef<HTMLInputElement>(null);
  
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

  const handlePodUpload = async (event: React.ChangeEvent<HTMLInputElement>, jobId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload an image file (JPEG, PNG, GIF, or WebP)', variant: 'destructive' });
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return;
    }
    
    setUploadingPod(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Authentication required');
      }
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/jobs/${jobId}/pod/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      const result = await response.json();
      toast({ title: 'POD uploaded', description: 'Proof of Delivery photo has been uploaded successfully' });
      
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      
      if (selectedJob?.id === jobId) {
        setSelectedJob({ ...selectedJob, podPhotoUrl: result.podPhotoUrl, podPhotos: result.podPhotos });
      }
    } catch (error: any) {
      console.error('[POD Upload] Error:', error);
      toast({ title: 'Upload failed', description: error.message || 'Failed to upload POD photo', variant: 'destructive' });
    } finally {
      setUploadingPod(false);
      if (podFileInputRef.current) {
        podFileInputRef.current.value = '';
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
      const links = await linksRes.json();
      const linksArray = Array.isArray(links) ? links : [];
      console.log('[ResendPayment] Links for job', jobId, ':', linksArray);
      const activeLink = linksArray.find((l: any) => 
        (l.status === 'pending' || l.status === 'sent' || l.status === 'opened') && 
        new Date(l.expiresAt) > new Date()
      );
      console.log('[ResendPayment] Active link:', activeLink);
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
    setEditIsMultiDrop(job.isMultiDrop || false);
    setEditIsReturnTrip(job.isReturnTrip || false);
    setEditMultiDropStops([]);
    if (job.isMultiDrop) {
      // Fetch stops with auth token
      const fetchStops = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const headers: HeadersInit = {};
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
          const res = await fetch(`/api/jobs/${job.id}/stops`, { headers });
          if (res.ok) {
            const data = await res.json();
            console.log(`[EditDialog] Fetched ${data.stops?.length || 0} stops for job ${job.id}:`, data.stops);
            setEditMultiDropStops((data.stops || []).map((s: any) => ({
              address: s.address || '',
              postcode: s.postcode || '',
              recipientName: s.recipientName || '',
              recipientPhone: s.recipientPhone || '',
              deliveryInstructions: s.instructions || '',
            })));
          } else {
            console.error('[EditDialog] Failed to fetch stops:', res.status);
            setEditMultiDropStops([]);
          }
        } catch (err) {
          console.error('[EditDialog] Error fetching stops:', err);
          setEditMultiDropStops([]);
        }
      };
      fetchStops();
    }
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
      // Build all drop postcodes (first delivery + multi-drop stops)
      const allDropPostcodes = [editDeliveryPostcode];
      if (editIsMultiDrop && editMultiDropStops.length > 0) {
        editMultiDropStops.forEach(stop => {
          if (stop.postcode) allDropPostcodes.push(stop.postcode);
        });
      }
      
      // Get distance from API - use GET with query params
      const origin = encodeURIComponent(editPickupPostcode + ', UK');
      const drops = allDropPostcodes.map(p => encodeURIComponent(p + ', UK')).join(',');
      const response = await fetch(`/api/maps/optimized-route?origin=${origin}&drops=${drops}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Route API error:', errorText);
        throw new Error('Failed to calculate route');
      }
      
      const data = await response.json();
      
      // Extract distances from response legs
      const legs = data.legs || [];
      const baseDistance = legs.length > 0 ? legs[0].distance : (data.totalDistance || 0);
      const multiDropDistances = legs.length > 1 ? legs.slice(1).map((leg: any) => leg.distance || 0) : [];
      const totalDistance = data.totalDistance || baseDistance;
      
      setEditDistance(totalDistance.toFixed(1));
      
      // Calculate return distance if needed (same as base distance for return trip)
      const returnDistance = editIsReturnTrip ? baseDistance : 0;
      
      // Import pricing calculation
      const { calculateQuote } = await import('@/lib/pricing');
      const weight = parseFloat(editWeight) || 1;
      const vehicleType = editVehicleType as any;
      
      const quote = calculateQuote(vehicleType, baseDistance, weight, {
        pickupPostcode: editPickupPostcode,
        deliveryPostcode: editDeliveryPostcode,
        allDropPostcodes: editIsMultiDrop ? allDropPostcodes : undefined,
        isMultiDrop: editIsMultiDrop,
        multiDropCount: editMultiDropStops.length,
        multiDropDistances: editIsMultiDrop ? multiDropDistances : undefined,
        isReturnTrip: editIsReturnTrip,
        returnDistance: editIsReturnTrip ? returnDistance : undefined,
        returnToSameLocation: editIsReturnTrip,
      });
      
      setEditTotalPrice(quote.totalPrice.toFixed(2));
      const extras = [];
      if (editIsMultiDrop && editMultiDropStops.length > 0) extras.push(`${editMultiDropStops.length} extra stops`);
      if (editIsReturnTrip) extras.push('return trip');
      const extrasText = extras.length > 0 ? ` (includes ${extras.join(', ')})` : '';
      toast({ title: 'Quote recalculated', description: `New price: £${quote.totalPrice.toFixed(2)} (${totalDistance.toFixed(1)} miles)${extrasText}` });
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
      isMultiDrop: editIsMultiDrop,
      isReturnTrip: editIsReturnTrip,
      multiDropStops: editIsMultiDrop ? editMultiDropStops : [],
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
      ((job as any).jobNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
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
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 4in !important;
                height: 6in !important;
                overflow: hidden !important;
              }
              .label-page { page-break-after: always; }
              .label-page:last-child { page-break-after: auto; }
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              width: 4in;
              height: 6in;
              margin: 0;
              padding: 0;
              overflow: hidden;
            }
            body {
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
              background: white;
              color: black;
            }
            img {
              display: block;
              max-width: 100%;
            }
            svg {
              display: inline-block;
              vertical-align: middle;
            }
          </style>
        </head>
        <body>
          ${labelContent}
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
              <DialogTitle>Job Details - {(selectedJob as any)?.jobNumber || selectedJob?.trackingNumber}</DialogTitle>
              <DialogDescription>
                Created on {selectedJob && formatDate(selectedJob.createdAt)}
              </DialogDescription>
            </DialogHeader>
            {selectedJob && (
              <div className="space-y-6 overflow-y-auto flex-1 pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <h4 className="font-semibold mb-2">Pickup</h4>
                    {selectedJob.pickupBuildingName && (
                      <p className="text-sm font-medium" data-testid="text-pickup-building">{selectedJob.pickupBuildingName}</p>
                    )}
                    <p className="text-sm" data-testid="text-pickup-address">{selectedJob.pickupAddress}</p>
                    <p className="text-sm font-mono text-muted-foreground" data-testid="text-pickup-postcode">{selectedJob.pickupPostcode}</p>
                    {selectedJob.pickupContactName && (
                      <div className="pt-1 text-sm text-muted-foreground" data-testid="text-pickup-contact">
                        <span className="font-medium text-foreground">{selectedJob.pickupContactName}</span>
                        {selectedJob.pickupContactPhone && (
                          <span className="ml-2">{selectedJob.pickupContactPhone}</span>
                        )}
                      </div>
                    )}
                    {selectedJob.pickupInstructions && (
                      <p className="text-xs text-muted-foreground italic pt-1" data-testid="text-pickup-instructions">{selectedJob.pickupInstructions}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold mb-2">Delivery</h4>
                    {selectedJob.deliveryBuildingName && (
                      <p className="text-sm font-medium" data-testid="text-delivery-building">{selectedJob.deliveryBuildingName}</p>
                    )}
                    <p className="text-sm" data-testid="text-delivery-address">{selectedJob.deliveryAddress}</p>
                    <p className="text-sm font-mono text-muted-foreground" data-testid="text-delivery-postcode">{selectedJob.deliveryPostcode}</p>
                    {selectedJob.recipientName && (
                      <div className="pt-1 text-sm text-muted-foreground" data-testid="text-delivery-contact">
                        <span className="font-medium text-foreground">{selectedJob.recipientName}</span>
                        {selectedJob.recipientPhone && (
                          <span className="ml-2">{selectedJob.recipientPhone}</span>
                        )}
                      </div>
                    )}
                    {selectedJob.deliveryInstructions && (
                      <p className="text-xs text-muted-foreground italic pt-1" data-testid="text-delivery-instructions">{selectedJob.deliveryInstructions}</p>
                    )}
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
                {/* Multi-Drop Stops Section */}
                <MultiDropStopsSection jobId={selectedJob.id} isMultiDrop={selectedJob.isMultiDrop ?? false} />
                
                {/* Proof of Delivery Section */}
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
                        data-testid="input-pod-upload"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => podFileInputRef.current?.click()}
                        disabled={uploadingPod}
                        data-testid="button-upload-pod"
                      >
                        {uploadingPod ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Upload className="h-4 w-4 mr-1" />
                        )}
                        {(selectedJob.podPhotos?.length || selectedJob.podPhotoUrl) ? 'Add Photo' : 'Upload Photo'}
                      </Button>
                    </div>
                  </div>
                  
                  {(() => {
                    const allPhotos: string[] = [];
                    if (selectedJob.podPhotos?.length) {
                      allPhotos.push(...selectedJob.podPhotos);
                    }
                    if (selectedJob.podPhotoUrl && !allPhotos.includes(selectedJob.podPhotoUrl)) {
                      allPhotos.push(selectedJob.podPhotoUrl);
                    }
                    const hasContent = allPhotos.length > 0 || selectedJob.podSignatureUrl || selectedJob.podRecipientName;
                    
                    if (!hasContent) {
                      return (
                        <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 p-4 rounded-lg">
                          <Camera className="h-5 w-5" />
                          <p className="text-sm">
                            {selectedJob.isMultiDrop
                              ? 'For multi-drop jobs, POD is managed per stop above. You can also upload a global POD here.'
                              : 'No proof of delivery photo uploaded yet. Click "Upload Photo" to add one.'}
                          </p>
                        </div>
                      );
                    }
                    
                    return (
                      <>
                        {allPhotos.length > 0 && (
                          <div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {allPhotos.map((photoUrl, index) => (
                                <div key={photoUrl} className="relative group">
                                  <a
                                    href={photoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                    data-testid={`link-pod-photo-${index}`}
                                  >
                                    <img
                                      src={photoUrl}
                                      alt={`Proof of Delivery ${index + 1}`}
                                      className="rounded-lg border max-h-48 w-full object-cover hover:opacity-90 transition-opacity cursor-pointer"
                                      data-testid={`img-pod-photo-${index}`}
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
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDeletingPodUrl(photoUrl);
                                      try {
                                        const { data: { session } } = await supabase.auth.getSession();
                                        if (!session?.access_token) return;
                                        const resp = await fetch(`/api/jobs/${selectedJob.id}/pod/photo`, {
                                          method: 'DELETE',
                                          headers: {
                                            'Authorization': `Bearer ${session.access_token}`,
                                            'Content-Type': 'application/json',
                                          },
                                          body: JSON.stringify({ photoUrl }),
                                        });
                                        if (resp.ok) {
                                          const result = await resp.json();
                                          setSelectedJob({ ...selectedJob, podPhotoUrl: result.podPhotoUrl, podPhotos: result.podPhotos });
                                          queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
                                          toast({ title: 'Photo removed', description: 'POD photo has been removed' });
                                        } else {
                                          toast({ title: 'Error', description: 'Failed to remove photo', variant: 'destructive' });
                                        }
                                      } catch (err) {
                                        toast({ title: 'Error', description: 'Failed to remove photo', variant: 'destructive' });
                                      } finally {
                                        setDeletingPodUrl(null);
                                      }
                                    }}
                                    data-testid={`button-delete-pod-photo-${index}`}
                                  >
                                    {deletingPodUrl === photoUrl ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-start gap-4 mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                          <div className="flex-1 space-y-2">
                            <div>
                              <p className="text-xs text-muted-foreground">Received By</p>
                              <p className="font-semibold text-base text-green-700 dark:text-green-400" data-testid="text-pod-recipient">
                                {selectedJob.podRecipientName || selectedJob.recipientName || 'Not recorded'}
                              </p>
                            </div>
                            {selectedJob.podNotes && (
                              <div>
                                <p className="text-xs text-muted-foreground">Driver Notes</p>
                                <p className="text-sm" data-testid="text-pod-notes">{selectedJob.podNotes}</p>
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
                              <a
                                href={selectedJob.podSignatureUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={selectedJob.podSignatureUrl}
                                  alt="Recipient Signature"
                                  className="rounded-md border bg-white p-1 h-16 w-28 object-contain hover:opacity-90 transition-opacity cursor-pointer"
                                  data-testid="img-pod-signature"
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
                <span className="font-mono font-bold text-foreground">{(jobToEdit as any)?.jobNumber || ''}</span>
                {(jobToEdit as any)?.jobNumber && <span className="text-xs text-muted-foreground ml-2">({jobToEdit?.trackingNumber})</span>}
                {!(jobToEdit as any)?.jobNumber && <span className="font-mono font-bold text-foreground">{jobToEdit?.trackingNumber}</span>}
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
                      <PostcodeAutocomplete
                        value={editPickupPostcode}
                        onChange={(postcode, fullAddress) => {
                          setEditPickupPostcode(postcode.toUpperCase());
                          if (fullAddress && !editPickupAddress) {
                            setEditPickupAddress(fullAddress);
                          }
                        }}
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
                      <PostcodeAutocomplete
                        value={editDeliveryPostcode}
                        onChange={(postcode, fullAddress) => {
                          setEditDeliveryPostcode(postcode.toUpperCase());
                          if (fullAddress && !editDeliveryAddress) {
                            setEditDeliveryAddress(fullAddress);
                          }
                        }}
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

                {/* Delivery Options Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Route className="h-4 w-4" />
                    Delivery Options
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label>Multi-Drop Delivery</Label>
                        <p className="text-xs text-muted-foreground">Add multiple delivery stops</p>
                      </div>
                      <Switch 
                        checked={editIsMultiDrop} 
                        onCheckedChange={setEditIsMultiDrop}
                        data-testid="switch-edit-multi-drop"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label>Return Trip</Label>
                        <p className="text-xs text-muted-foreground">Driver returns to pickup</p>
                      </div>
                      <Switch 
                        checked={editIsReturnTrip} 
                        onCheckedChange={setEditIsReturnTrip}
                        data-testid="switch-edit-return-trip"
                      />
                    </div>
                  </div>
                  
                  {editIsMultiDrop && (
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Additional Drop Stops</h4>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setEditMultiDropStops([...editMultiDropStops, { address: '', postcode: '', recipientName: '', recipientPhone: '', deliveryInstructions: '' }])}
                          data-testid="button-add-drop-stop"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Stop
                        </Button>
                      </div>
                      
                      {editMultiDropStops.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          No additional stops. Click "Add Stop" to add more delivery locations.
                        </p>
                      )}
                      
                      {editMultiDropStops.map((stop, index) => (
                        <div key={index} className="p-3 bg-background border rounded-lg space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">Stop {index + 2}</span>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6 text-destructive"
                              onClick={() => setEditMultiDropStops(editMultiDropStops.filter((_, i) => i !== index))}
                              data-testid={`button-remove-stop-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1 col-span-2">
                              <Label className="text-xs">Address</Label>
                              <Input
                                placeholder="Full address"
                                value={stop.address}
                                onChange={(e) => {
                                  const updated = [...editMultiDropStops];
                                  updated[index].address = e.target.value;
                                  setEditMultiDropStops(updated);
                                }}
                                data-testid={`input-stop-address-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Postcode</Label>
                              <PostcodeAutocomplete
                                placeholder="e.g. EC1A 1BB"
                                className="font-mono"
                                value={stop.postcode}
                                onChange={(postcode, fullAddress) => {
                                  const updated = [...editMultiDropStops];
                                  updated[index].postcode = postcode.toUpperCase();
                                  if (fullAddress && !updated[index].address) {
                                    updated[index].address = fullAddress;
                                  }
                                  setEditMultiDropStops(updated);
                                }}
                                data-testid={`input-stop-postcode-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Recipient Name</Label>
                              <Input
                                placeholder="Recipient name"
                                value={stop.recipientName || ''}
                                onChange={(e) => {
                                  const updated = [...editMultiDropStops];
                                  updated[index].recipientName = e.target.value;
                                  setEditMultiDropStops(updated);
                                }}
                                data-testid={`input-stop-recipient-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Recipient Phone</Label>
                              <Input
                                placeholder="Phone number"
                                value={stop.recipientPhone || ''}
                                onChange={(e) => {
                                  const updated = [...editMultiDropStops];
                                  updated[index].recipientPhone = e.target.value;
                                  setEditMultiDropStops(updated);
                                }}
                                data-testid={`input-stop-phone-${index}`}
                              />
                            </div>
                            <div className="space-y-1 col-span-2">
                              <Label className="text-xs">Delivery Instructions</Label>
                              <Input
                                placeholder="Special instructions..."
                                value={stop.deliveryInstructions || ''}
                                onChange={(e) => {
                                  const updated = [...editMultiDropStops];
                                  updated[index].deliveryInstructions = e.target.value;
                                  setEditMultiDropStops(updated);
                                }}
                                data-testid={`input-stop-instructions-${index}`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
            <div className="py-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-auto" style={{ maxHeight: '55vh' }}>
              {loadingStops ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading multi-drop stops...</span>
                </div>
              ) : jobForLabel && jobForLabel.isMultiDrop && multiDropStops.length > 0 ? (
                <div className="flex justify-center">
                  <div style={{ transform: 'scale(0.55)', transformOrigin: 'top center', marginBottom: '-45%' }}>
                    <MultiDropShippingLabels 
                      ref={labelRef} 
                      job={jobForLabel} 
                      stops={multiDropStops}
                      driverCode={getDriverCode(jobForLabel.driverId)} 
                    />
                  </div>
                </div>
              ) : jobForLabel ? (
                <div className="flex justify-center">
                  <div style={{ transform: 'scale(0.65)', transformOrigin: 'top center', marginBottom: '-35%' }}>
                    <ShippingLabel 
                      ref={labelRef} 
                      job={jobForLabel} 
                      driverCode={getDriverCode(jobForLabel.driverId)} 
                    />
                  </div>
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
