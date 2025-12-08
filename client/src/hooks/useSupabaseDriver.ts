import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Driver, Job, Document as DriverDocument } from '@shared/schema';

export function useDriver() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['supabase', 'driver', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Always use REST API first - it ensures proper driver record creation and sync
      const response = await fetch(`/api/drivers/user/${user.id}`);
      if (response.ok) {
        const driver = await response.json();
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
        isAvailable: data.is_available,
        isVerified: data.is_verified,
        currentLatitude: data.current_latitude,
        currentLongitude: data.current_longitude,
        lastLocationUpdate: data.last_location_update,
        rating: data.rating,
        totalJobs: data.total_jobs,
        profilePictureUrl: data.profile_picture_url,
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
      
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(job => ({
        id: job.id,
        trackingNumber: job.tracking_number,
        customerId: job.customer_id,
        driverId: job.driver_id,
        dispatcherId: job.dispatcher_id,
        vendorId: job.vendor_id,
        status: job.status,
        vehicleType: job.vehicle_type,
        pickupAddress: job.pickup_address,
        pickupPostcode: job.pickup_postcode,
        pickupLatitude: job.pickup_latitude,
        pickupLongitude: job.pickup_longitude,
        pickupInstructions: job.pickup_instructions,
        deliveryAddress: job.delivery_address,
        deliveryPostcode: job.delivery_postcode,
        deliveryLatitude: job.delivery_latitude,
        deliveryLongitude: job.delivery_longitude,
        deliveryInstructions: job.delivery_instructions,
        recipientName: job.recipient_name,
        recipientPhone: job.recipient_phone,
        weight: job.weight,
        distance: job.distance,
        isMultiDrop: job.is_multi_drop,
        isReturnTrip: job.is_return_trip,
        basePrice: job.base_price,
        distancePrice: job.distance_price,
        weightSurcharge: job.weight_surcharge,
        totalPrice: job.total_price,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      })) as Job[];
    },
    enabled: !!driverId,
  });
}

export function useAvailableJobs(enabled: boolean) {
  return useQuery({
    queryKey: ['supabase', 'jobs', { status: 'pending' }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending')
        .is('driver_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(job => ({
        id: job.id,
        trackingNumber: job.tracking_number,
        customerId: job.customer_id,
        driverId: job.driver_id,
        status: job.status,
        vehicleType: job.vehicle_type,
        pickupAddress: job.pickup_address,
        pickupPostcode: job.pickup_postcode,
        deliveryAddress: job.delivery_address,
        deliveryPostcode: job.delivery_postcode,
        recipientName: job.recipient_name,
        recipientPhone: job.recipient_phone,
        weight: job.weight,
        distance: job.distance,
        totalPrice: job.total_price,
        createdAt: job.created_at,
      })) as Job[];
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
      const { data, error } = await supabase
        .from('drivers')
        .update({ is_available: isAvailable })
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

  const stats = {
    totalJobs: jobs?.length || 0,
    completedJobs: jobs?.filter(j => j.status === 'delivered').length || 0,
    activeJobs: jobs?.filter(j => !['delivered', 'cancelled', 'pending'].includes(j.status)).length || 0,
    todaysJobs: jobs?.filter(j => {
      const today = new Date();
      const jobDate = new Date(j.createdAt || '');
      return jobDate.toDateString() === today.toDateString();
    }).length || 0,
    totalEarnings: jobs?.filter(j => j.status === 'delivered')
      .reduce((sum, j) => sum + parseFloat(j.totalPrice?.toString() || '0'), 0) || 0,
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
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['/api/documents', { driverId: variables.driverId }] });
      await queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      await queryClient.refetchQueries({ queryKey: ['/api/documents', { driverId: variables.driverId }] });
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
