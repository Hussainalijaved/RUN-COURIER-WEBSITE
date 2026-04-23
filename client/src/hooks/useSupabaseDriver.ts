import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Driver, Document as DriverDocument } from '@shared/schema';
import type { DriverJob } from '@/lib/data/base';

function resolveProfilePictureUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/api/uploads/')) return url;
  if (url.startsWith('http')) {
    const supabaseMatch = url.match(/\/storage\/v1\/object\/(?:public\/)?(?:driver-documents|DRIVER-DOCUMENTS)\/(.+?)(?:\?.*)?$/i);
    if (supabaseMatch) return `/api/uploads/documents/${decodeURIComponent(supabaseMatch[1])}`;
    return url;
  }
  return `/api/uploads/documents/${url}`;
}

export function useDriver() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['supabase', 'driver', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const response = await fetch(`/api/drivers/user/${user.id}`);
      if (response.ok) {
        const driver = await response.json();
        if (driver.profilePictureUrl) {
          driver.profilePictureUrl = resolveProfilePictureUrl(driver.profilePictureUrl);
        }
        return driver as Driver;
      }
      
      // If REST API fails, try Supabase directly as fallback
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Failed to fetch driver from Supabase:', error);
        return null;
      }

      // Return Supabase data with user.id as fallback for missing ID
      return {
        id: data.id || user.id,
        userId: data.user_id,
        driverCode: data.driver_code,
        fullName: data.full_name,
        email: data.email,
        phone: data.phone,
        postcode: data.postcode,
        address: data.address,
        nationality: data.nationality,
        isBritish: data.is_british,
        nationalInsuranceNumber: data.national_insurance_number,
        rightToWorkShareCode: data.right_to_work_share_code,
        dbsChecked: data.dbs_checked,
        dbsCertificateUrl: data.dbs_certificate_url,
        dbsCheckDate: data.dbs_check_date,
        vehicleType: data.vehicle_type,
        vehicleRegistration: data.vehicle_registration,
        vehicleMake: data.vehicle_make,
        vehicleModel: data.vehicle_model,
        vehicleColor: data.vehicle_color,
        // Supabase uses online_status column ('online'/'offline') not is_available boolean
        isAvailable: data.is_available === true,
        isVerified: data.is_verified,
        currentLatitude: data.current_latitude,
        currentLongitude: data.current_longitude,
        lastLocationUpdate: data.last_location_update,
        rating: data.rating,
        totalJobs: data.total_jobs,
        profilePictureUrl: resolveProfilePictureUrl(data.profile_picture_url),
        bankName: data.bank_name,
        accountHolderName: data.account_holder_name,
        sortCode: data.sort_code,
        accountNumber: data.account_number,
        createdAt: data.created_at,
      } as Driver;
    },
    enabled: !!user?.id && user?.role === 'driver',
  });
}

export function useDriverJobs(driverId: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'jobs', { driverId }],
    queryFn: async () => {
      if (!driverId) return [];
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`/api/driver/${driverId}/jobs`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      });
      
      if (!response.ok) {
        console.error('[useDriverJobs] API error:', response.status, await response.text());
        return [];
      }
      
      const jobs = await response.json();
      console.log(`[useDriverJobs] Fetched ${jobs.length} jobs from API for driver ${driverId}`);
      return jobs as DriverJob[];
    },
    enabled: !!driverId,
  });
}

export function useAvailableJobs(enabled: boolean) {
  return useQuery({
    queryKey: ['supabase', 'jobs', { status: 'pending' }],
    queryFn: async () => {
      // CRITICAL: Only select driver-safe columns for available jobs
      // NOTE: Available jobs may not have driver_price set yet, but we still must NOT expose total_price
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id,
          tracking_number,
          customer_id,
          driver_id,
          status,
          vehicle_type,
          pickup_address,
          pickup_postcode,
          delivery_address,
          delivery_postcode,
          recipient_name,
          recipient_phone,
          weight,
          distance,
          driver_price,
          created_at
        `)
        .eq('status', 'pending')
        .is('driver_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // SECURITY: Return DriverJob type - never cast to Job which includes customer pricing fields
      return (data || []).map(job => ({
        id: job.id,
        trackingNumber: job.tracking_number,
        customerId: job.customer_id,
        driverId: job.driver_id,
        dispatcherId: null,
        vendorId: null,
        status: job.status,
        vehicleType: job.vehicle_type,
        pickupAddress: job.pickup_address,
        pickupPostcode: job.pickup_postcode,
        pickupLatitude: null,
        pickupLongitude: null,
        pickupInstructions: null,
        pickupContactName: null,
        pickupContactPhone: null,
        deliveryAddress: job.delivery_address,
        deliveryPostcode: job.delivery_postcode,
        deliveryLatitude: null,
        deliveryLongitude: null,
        deliveryInstructions: null,
        recipientName: job.recipient_name,
        recipientPhone: job.recipient_phone,
        senderName: null,
        senderPhone: null,
        parcelDescription: null,
        parcelWeight: null,
        parcelDimensions: null,
        weight: job.weight,
        distance: job.distance,
        distanceMiles: null,
        isMultiDrop: false,
        isReturnTrip: false,
        isUrgent: false,
        isFragile: false,
        requiresSignature: false,
        // CRITICAL: Use driver_price ONLY - NEVER expose total_price
        driverPrice: job.driver_price,
        scheduledPickupTime: null,
        estimatedDeliveryTime: null,
        actualPickupTime: null,
        actualDeliveryTime: null,
        podSignatureUrl: null,
        podPhotoUrl: null,
        podNotes: null,
        createdAt: job.created_at,
        updatedAt: job.created_at, // Use created_at as fallback since updated_at not fetched
      })) as DriverJob[];
    },
    enabled,
  });
}

export function useDriverDocuments(driverId: string | undefined) {
  return useQuery({
    queryKey: ['/api/documents', { driverId }],
    queryFn: async () => {
      if (!driverId) return [];
      
      const response = await fetch(`/api/documents?driverId=${driverId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      
      const data = await response.json();
      return data as DriverDocument[];
    },
    enabled: !!driverId,
  });
}

export function useUpdateDriverAvailability() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ driverId, isAvailable }: { driverId: string; isAvailable: boolean }) => {
      // Supabase uses online_status column with 'online'/'offline' string values
      const { data, error } = await supabase
        .from('drivers')
        .update({ online_status: isAvailable ? 'online' : 'offline' })
        .eq('id', driverId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'driver', user?.id] });
    },
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: string }) => {
      const updateData: Record<string, any> = { status };
      
      if (status === 'delivered') {
        updateData.delivered_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', jobId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
    },
  });
}

export function useAcceptJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, driverId }: { jobId: string; driverId: string }) => {
      const { data, error } = await supabase
        .from('jobs')
        .update({ 
          driver_id: driverId, 
          status: 'assigned' 
        })
        .eq('id', jobId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
    },
  });
}

export function useUpdateDriverProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ driverId, data }: { driverId: string; data: Partial<Driver> }) => {
      const response = await fetch(`/api/drivers/${driverId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update profile');
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['supabase', 'driver', user?.id] });
      await queryClient.refetchQueries({ queryKey: ['supabase', 'driver', user?.id] });
    },
  });
}

export function useDriverStats(driverId: string | undefined) {
  const { data: jobs } = useDriverJobs(driverId);
  // Type safety: jobs is DriverJob[] which only contains driverPrice, not totalPrice

  const stats = {
    totalJobs: jobs?.length || 0,
    completedJobs: jobs?.filter((j: DriverJob) => j.status === 'delivered').length || 0,
    activeJobs: jobs?.filter((j: DriverJob) => !['delivered', 'cancelled', 'pending'].includes(j.status)).length || 0,
    todaysJobs: jobs?.filter((j: DriverJob) => {
      const today = new Date();
      const jobDate = new Date(j.createdAt || '');
      return jobDate.toDateString() === today.toDateString();
    }).length || 0,
    // CRITICAL: Use driverPrice for earnings - DriverJob type ensures totalPrice is never available
    totalEarnings: jobs?.filter((j: DriverJob) => j.status === 'delivered')
      .reduce((sum: number, j: DriverJob) => sum + parseFloat(j.driverPrice?.toString() || '0'), 0) || 0,
  };

  return stats;
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      driverId, 
      file, 
      documentType,
      expiryDate,
    }: { 
      driverId: string; 
      file: File; 
      documentType: string;
      expiryDate?: string;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('driverId', driverId);
      formData.append('documentType', documentType);
      if (expiryDate) {
        formData.append('expiryDate', expiryDate);
      }

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload document');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });
}

export interface JobAssignment {
  id: string;
  jobId: string;
  driverId: string;
  assignedBy: string;
  driverPrice: string;
  status: 'pending' | 'sent' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  sentAt: Date | null;
  respondedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  expiresAt: Date | null;
  createdAt: Date | null;
}

export function useDriverAssignments(driverId: string | undefined) {
  return useQuery({
    queryKey: ['/api/job-assignments', { driverId }],
    queryFn: async () => {
      if (!driverId) return [];
      
      const response = await fetch(`/api/job-assignments?driverId=${driverId}&status=sent`);
      if (!response.ok) {
        throw new Error('Failed to fetch assignments');
      }
      
      return response.json() as Promise<JobAssignment[]>;
    },
    enabled: !!driverId,
    refetchInterval: 30000,
  });
}

export function useRespondToAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assignmentId, accepted, rejectionReason }: { assignmentId: string; accepted: boolean; rejectionReason?: string }) => {
      const response = await fetch(`/api/job-assignments/${assignmentId}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted, rejectionReason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to respond to assignment');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/job-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
    },
  });
}

export function useDeclineJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, rejectionReason }: { jobId: string; rejectionReason: string }) => {
      const response = await fetch(`/api/jobs/${jobId}/decline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to decline job');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
    },
  });
}
