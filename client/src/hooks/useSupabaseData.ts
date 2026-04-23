import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { Job, Driver, User, Notification, DriverApplication } from '@/lib/data/base';
import {
  listJobs,
  getJobById,
  getJobByTrackingNumber,
  createJob,
  updateJob,
  updateJobStatus,
  assignJobToDriver,
  subscribeToJobs,
  type JobFilters,
} from '@/lib/data/jobs';
import {
  listDrivers,
  getDriverById,
  getDriverByUserId,
  getDriverByCode,
  updateDriver,
  updateDriverLocation,
  updateDriverAvailability,
  deactivateDriver,
  reactivateDriver,
  subscribeToDrivers,
  type DriverFilters,
} from '@/lib/data/drivers';
import {
  listUsers,
  getUserById,
  getUserByEmail,
  updateUser,
  deactivateUser,
  reactivateUser,
  type UserFilters,
} from '@/lib/data/users';
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  subscribeToNotifications,
} from '@/lib/data/notifications';
import {
  listDriverApplications,
  getApplicationById,
  createDriverApplication,
  updateApplicationStatus,
} from '@/lib/data/applications';
import { supabase } from '@/lib/supabase';
import type { JobStatus, VehicleType, DriverApplicationStatus } from '@shared/schema';
import { useEffect } from 'react';

export function useJobs(filters: JobFilters = {}) {
  return useQuery({
    queryKey: ['supabase', 'jobs', filters],
    queryFn: () => listJobs(filters),
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'jobs', id],
    queryFn: () => (id ? getJobById(id) : null),
    enabled: !!id,
  });
}

export function useJobByTrackingNumber(trackingNumber: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'jobs', 'tracking', trackingNumber],
    queryFn: () => (trackingNumber ? getJobByTrackingNumber(trackingNumber) : null),
    enabled: !!trackingNumber,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (jobData: Partial<Job>) => createJob(jobData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
      toast({ title: 'Job created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create job', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Job> }) => updateJob(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
      toast({ title: 'Job updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update job', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, status, rejectionReason }: { id: string; status: JobStatus; rejectionReason?: string }) =>
      updateJobStatus(id, status, rejectionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
      toast({ title: 'Job status updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
    },
  });
}

export function useAssignJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ jobId, driverId, driverPrice }: { jobId: string; driverId: string; driverPrice?: string }) =>
      assignJobToDriver(jobId, driverId, driverPrice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
      toast({ title: 'Driver assigned successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to assign driver', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDrivers(filters: DriverFilters = {}) {
  return useQuery({
    queryKey: ['supabase', 'drivers', filters],
    queryFn: () => listDrivers(filters),
  });
}

export function useDriver(id: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'drivers', id],
    queryFn: () => (id ? getDriverById(id) : null),
    enabled: !!id,
  });
}

export function useDriverByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'drivers', 'user', userId],
    queryFn: () => (userId ? getDriverByUserId(userId) : null),
    enabled: !!userId,
  });
}

export function useDriverByCode(driverCode: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'drivers', 'code', driverCode],
    queryFn: () => (driverCode ? getDriverByCode(driverCode) : null),
    enabled: !!driverCode,
  });
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Driver> }) => updateDriver(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: 'Driver updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update driver', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateDriverLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, latitude, longitude }: { id: string; latitude: number; longitude: number }) =>
      updateDriverLocation(id, latitude, longitude),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
    },
  });
}

export function useToggleDriverAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      updateDriverAvailability(id, isAvailable),
    onSuccess: (_, { isAvailable }) => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: isAvailable ? 'You are now available' : 'You are now offline' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update availability', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeactivateDriver() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deactivateDriver(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: 'Driver deactivated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to deactivate driver', description: error.message, variant: 'destructive' });
    },
  });
}

export function useReactivateDriver() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => reactivateDriver(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: 'Driver reactivated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to reactivate driver', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: ['supabase', 'users', filters],
    queryFn: () => listUsers(filters),
  });
}

export function useCustomers(limit?: number) {
  return useQuery({
    queryKey: ['supabase', 'users', { role: 'customer', limit }],
    queryFn: () => listUsers({ role: 'customer', limit }),
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'users', id],
    queryFn: () => (id ? getUserById(id) : null),
    enabled: !!id,
  });
}

export function useUserByEmail(email: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'users', 'email', email],
    queryFn: () => (email ? getUserByEmail(email) : null),
    enabled: !!email,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<User> }) => updateUser(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'users'] });
      toast({ title: 'User updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update user', description: error.message, variant: 'destructive' });
    },
  });
}

export function useNotifications(userId: string | undefined, unreadOnly = false) {
  return useQuery({
    queryKey: ['supabase', 'notifications', userId, { unreadOnly }],
    queryFn: () => (userId ? listNotifications(userId, unreadOnly) : []),
    enabled: !!userId,
  });
}

export function useUnreadNotificationCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'notifications', userId, 'unread-count'],
    queryFn: () => (userId ? getUnreadCount(userId) : 0),
    enabled: !!userId,
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'notifications'] });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => markAllNotificationsAsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'notifications'] });
    },
  });
}

export function useDriverApplications(status?: DriverApplicationStatus) {
  return useQuery({
    queryKey: ['supabase', 'driver-applications', status],
    queryFn: () => listDriverApplications(status),
  });
}

export function useDriverApplication(id: string | undefined) {
  return useQuery({
    queryKey: ['supabase', 'driver-applications', id],
    queryFn: () => (id ? getApplicationById(id) : null),
    enabled: !!id,
  });
}

export function useCreateDriverApplication() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (applicationData: Parameters<typeof createDriverApplication>[0]) =>
      createDriverApplication(applicationData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'driver-applications'] });
      toast({ title: 'Application submitted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit application', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateApplicationStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      id,
      status,
      reviewedBy,
      reviewNotes,
    }: {
      id: string;
      status: DriverApplicationStatus;
      reviewedBy: string;
      reviewNotes?: string;
    }) => updateApplicationStatus(id, status, reviewedBy, reviewNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'driver-applications'] });
      toast({ title: 'Application status updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
    },
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['supabase', 'admin-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [jobsData, driversData] = await Promise.all([
        supabase.from('jobs').select('id, status, total_price, created_at'),
        supabase.from('drivers').select('id, online_status, is_verified'),
      ]);

      const jobs = jobsData.data || [];
      const drivers = driversData.data || [];

      const todaysJobs = jobs.filter((j) => new Date(j.created_at) >= today).length;
      const pendingJobs = jobs.filter((j) => j.status === 'pending').length;
      const completedToday = jobs.filter(
        (j) => j.status === 'delivered' && new Date(j.created_at) >= today
      ).length;

      const totalRevenue = jobs
        .filter((j) => j.status === 'delivered')
        .reduce((sum, j) => sum + parseFloat(j.total_price || '0'), 0);

      const todayRevenue = jobs
        .filter((j) => j.status === 'delivered' && new Date(j.created_at) >= today)
        .reduce((sum, j) => sum + parseFloat(j.total_price || '0'), 0);

      return {
        todaysJobs,
        activeDrivers: drivers.filter((d) => d.online_status === 'online').length,
        totalDrivers: drivers.length,
        pendingJobs,
        completedToday,
        totalRevenue,
        todayRevenue,
        totalJobs: jobs.length,
      };
    },
  });
}

export function useJobsRealtime(onUpdate: (payload: { eventType: string; new: Job | null; old: Job | null }) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = subscribeToJobs((payload) => {
      onUpdate(payload);
      queryClient.invalidateQueries({ queryKey: ['supabase', 'jobs'] });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [onUpdate, queryClient]);
}

export function useDriversRealtime(onUpdate: (payload: { eventType: string; new: Driver | null; old: Driver | null }) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = subscribeToDrivers((payload) => {
      onUpdate(payload);
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [onUpdate, queryClient]);
}

export function useNotificationsRealtime(userId: string, onUpdate: (payload: { eventType: string; new: Notification | null }) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = subscribeToNotifications(userId, (payload) => {
      onUpdate(payload);
      queryClient.invalidateQueries({ queryKey: ['supabase', 'notifications'] });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [userId, onUpdate, queryClient]);
}

export function usePendingDocuments() {
  return useQuery({
    queryKey: ['supabase', 'documents', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('status', 'pending')
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

export function useReviewDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status, reviewedBy, reviewNotes }: { 
      id: string; 
      status: 'approved' | 'rejected';
      reviewedBy: string;
      reviewNotes?: string;
    }) => {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status,
          reviewed_by: reviewedBy,
          review_notes: reviewNotes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase', 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: 'Document reviewed successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to review document', description: error.message, variant: 'destructive' });
    },
  });
}
