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
      
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const response = await fetch(`/api/drivers/user/${user.id}`);
          if (response.ok) {
            const driver = await response.json();
            return driver as Driver;
          }
          return null;
        }
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        driverCode: data.driver_code,
        fullName: data.full_name,
        email: data.email,
        phone: data.phone,
        postcode: data.postcode,
        address: data.address,
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
      const updateData: Record<string, any> = {};
      
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.postcode !== undefined) updateData.postcode = data.postcode;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.vehicleType !== undefined) updateData.vehicle_type = data.vehicleType;
      if (data.vehicleRegistration !== undefined) updateData.vehicle_registration = data.vehicleRegistration;
      if (data.vehicleMake !== undefined) updateData.vehicle_make = data.vehicleMake;
      if (data.vehicleModel !== undefined) updateData.vehicle_model = data.vehicleModel;
      if (data.vehicleColor !== undefined) updateData.vehicle_color = data.vehicleColor;

      const { data: result, error } = await supabase
        .from('drivers')
        .update(updateData)
        .eq('id', driverId)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'driver', user?.id] });
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
      documentType 
    }: { 
      driverId: string; 
      file: File; 
      documentType: string; 
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('driverId', driverId);
      formData.append('documentType', documentType);

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
      queryClient.invalidateQueries({ queryKey: ['/api/documents', { driverId: variables.driverId }] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });
}
