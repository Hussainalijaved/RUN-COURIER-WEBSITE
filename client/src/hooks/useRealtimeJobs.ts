import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function useRealtimeJobs() {
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel('jobs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
        },
        (payload) => {
          console.log('[Realtime] Job change detected:', payload.eventType, payload.new);
          
          queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
          queryClient.invalidateQueries({ queryKey: ['/api/admin/jobs'] });
          queryClient.invalidateQueries({ queryKey: ['/api/dispatcher/jobs'] });
          
          if (payload.eventType === 'INSERT') {
            const newJob = payload.new as { tracking_number?: string; status?: string };
            toast({
              title: 'New Job Created',
              description: `Job ${newJob.tracking_number || 'N/A'} has been created`,
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedJob = payload.new as { tracking_number?: string; status?: string };
            const oldJob = payload.old as { status?: string };
            
            if (updatedJob.status !== oldJob?.status) {
              toast({
                title: 'Job Status Updated',
                description: `Job ${updatedJob.tracking_number || 'N/A'} is now ${updatedJob.status}`,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Jobs subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);
}

export function useRealtimeDriverJobs() {
  useEffect(() => {
    const channel = supabase
      .channel('driver-jobs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
        },
        (payload) => {
          console.log('[Realtime] Driver job change detected:', payload.eventType);
          
          queryClient.invalidateQueries({ queryKey: ['driver-jobs'] });
          queryClient.invalidateQueries({ queryKey: ['driver-active-jobs'] });
          queryClient.invalidateQueries({ queryKey: ['driver-pending-offers'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

export function useRealtimeJobAssignments() {
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel('job-assignments-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_assignments',
        },
        (payload) => {
          console.log('[Realtime] Job assignment change detected:', payload.eventType);
          
          queryClient.invalidateQueries({ queryKey: ['job-assignments'] });
          queryClient.invalidateQueries({ queryKey: ['driver-assignments'] });
          
          if (payload.eventType === 'INSERT') {
            toast({
              title: 'New Job Offer',
              description: 'You have a new job offer!',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);
}
