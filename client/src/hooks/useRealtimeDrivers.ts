import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';

interface SupabaseDriverRow {
  id: string;
  user_id: string;
  driver_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_available: boolean;
  is_verified: boolean;
  is_active: boolean;
  vehicle_type: string | null;
  current_latitude: string | null;
  current_longitude: string | null;
  last_location_update: string | null;
  rating: string | null;
  total_jobs: number | null;
  created_at: string;
}

export function useRealtimeDrivers() {
  const { user } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) return;

    const userRole = user.user_metadata?.role;
    if (userRole !== 'admin' && userRole !== 'dispatcher') return;

    const channel = supabase
      .channel('realtime-drivers')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drivers',
        },
        (payload) => {
          console.log('[Realtime] Driver change:', payload.eventType, payload.new);

          queryClient.invalidateQueries({ queryKey: ['/api/supabase-drivers'] });
          queryClient.invalidateQueries({ queryKey: ['/api/drivers'] });

          if (payload.eventType === 'UPDATE' && payload.new) {
            const newDriver = payload.new as SupabaseDriverRow;
            
            queryClient.setQueryData<SupabaseDriverRow[]>(
              ['/api/supabase-drivers'],
              (oldData) => {
                if (!oldData) return oldData;
                return oldData.map((driver) =>
                  driver.id === newDriver.id
                    ? { ...driver, ...newDriver }
                    : driver
                );
              }
            );
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Drivers subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user]);
}
