import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

type PendingJobsContextType = {
  pendingJobCount: number;
  refreshPendingJobs: () => Promise<void>;
};

const PendingJobsContext = createContext<PendingJobsContextType | undefined>(undefined);

export function PendingJobsProvider({ children }: { children: ReactNode }) {
  const { user, driver } = useAuth();
  const [pendingJobCount, setPendingJobCount] = useState(0);

  // CRITICAL: Use both driver.id AND user.id to catch jobs assigned with either ID
  const driverId = driver?.id;
  const authUserId = user?.id;
  
  // Get all possible IDs to search for (handles website vs mobile ID mismatch)
  const possibleDriverIds = [driverId, authUserId].filter((id): id is string => !!id && id !== driverId);
  const primaryDriverId = driverId || authUserId;

  const fetchPendingJobs = useCallback(async () => {
    if (!primaryDriverId) {
      setPendingJobCount(0);
      return;
    }

    try {
      // Query jobs assigned to either the driver's ID or auth user's ID
      const idsToSearch = [primaryDriverId, ...possibleDriverIds.filter(id => id !== primaryDriverId)];
      const uniqueIds = [...new Set(idsToSearch)];
      
      const { count, error } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .in('driver_id', uniqueIds)
        .in('status', ['assigned', 'offered']);

      if (error) throw error;
      setPendingJobCount(count || 0);
    } catch (error) {
      console.error('Error fetching pending jobs count:', error);
    }
  }, [primaryDriverId, possibleDriverIds.join(',')]);

  useEffect(() => {
    fetchPendingJobs();

    if (!primaryDriverId) return;

    // Subscribe to changes for both driver.id and auth user.id
    const subscriptions: any[] = [];
    const uniqueIds = [...new Set([driverId, authUserId].filter(Boolean))];
    
    uniqueIds.forEach((id, index) => {
      const sub = supabase
        .channel(`pending-jobs-count-${index}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'jobs',
            filter: `driver_id=eq.${id}`,
          },
          () => {
            fetchPendingJobs();
          }
        )
        .subscribe();
      subscriptions.push(sub);
    });

    return () => {
      subscriptions.forEach(sub => sub.unsubscribe());
    };
  }, [primaryDriverId, driverId, authUserId, fetchPendingJobs]);

  const refreshPendingJobs = async () => {
    await fetchPendingJobs();
  };

  return (
    <PendingJobsContext.Provider value={{ pendingJobCount, refreshPendingJobs }}>
      {children}
    </PendingJobsContext.Provider>
  );
}

export function usePendingJobs() {
  const context = useContext(PendingJobsContext);
  if (context === undefined) {
    throw new Error('usePendingJobs must be used within a PendingJobsProvider');
  }
  return context;
}
