import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { supabase, Job } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export function CompletedJobsScreen() {
  const { theme } = useTheme();
  const { user, driver } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);

  // CRITICAL: Use both driver.id AND user.id to catch jobs assigned with either ID
  const driverRecordId = driver?.id;
  const authUserId = user?.id;
  const driverId = driverRecordId || authUserId;
  const allDriverIds = [...new Set([driverRecordId, authUserId].filter(Boolean))] as string[];

  const fetchCompletedJobs = useCallback(async () => {
    if (!driverId || allDriverIds.length === 0) return;

    try {
      // SECURITY: Query driver_jobs_view instead of jobs table to hide customer pricing
      const { data, error } = await supabase
        .from('driver_jobs_view')
        .select('*')
        .in('driver_id', allDriverIds)
        .in('status', ['delivered', 'failed'])
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const completedJobs: Job[] = data || [];
      setJobs(completedJobs);
      const deliveredJobs = completedJobs.filter(j => j.status === 'delivered');
      // SECURITY: Use driver_price ONLY - never show customer pricing to drivers
      const earnings = deliveredJobs.reduce((sum: number, job: Job) => sum + (job.driver_price ?? 0), 0);
      setTotalEarnings(earnings);
    } catch (error) {
      console.error('Error fetching completed jobs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driverId, allDriverIds.join(',')]);

  useEffect(() => {
    fetchCompletedJobs();
  }, [fetchCompletedJobs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCompletedJobs();
  }, [fetchCompletedJobs]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="body" color="secondary" style={{ marginTop: Spacing.md }}>
            Loading completed jobs...
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenScrollView 
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      hasTabBar
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      <View style={styles.content}>
        <Card variant="glass" style={styles.earningsCard}>
          <View style={styles.earningsHeader}>
            <View style={[styles.earningsIcon, { backgroundColor: theme.success + '15' }]}>
              <Feather name="trending-up" size={24} color={theme.success} />
            </View>
            <ThemedText type="caption" color="secondary">Total Earnings</ThemedText>
          </View>
          <ThemedText type="largeTitle" style={{ color: theme.success, marginBottom: Spacing.xs }}>
            £{totalEarnings.toFixed(2)}
          </ThemedText>
          <ThemedText type="caption" color="secondary">
            {jobs.filter(j => j.status === 'delivered').length} delivered, {jobs.filter(j => j.status === 'failed').length} failed
          </ThemedText>
        </Card>
        
        {jobs.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.success + '12' }]}>
              <Feather name="check-circle" size={32} color={theme.success} />
            </View>
            <ThemedText type="h3" style={styles.emptyTitle}>No Completed Jobs</ThemedText>
            <ThemedText type="subhead" color="secondary" style={styles.emptySubtext}>
              Complete deliveries to see them here
            </ThemedText>
          </View>
        ) : (
          <View style={styles.jobsList}>
            {jobs.map((job) => {
              const isFailed = job.status === 'failed';
              const statusColor = isFailed ? theme.error : theme.success;
              const dateToShow = job.delivered_at || job.updated_at;
              
              return (
                <Card key={job.id} variant="glass" style={styles.jobCard}>
                  <View style={styles.cardHeader}>
                    <View>
                      <ThemedText type="bodyMedium">
                        {dateToShow ? formatDate(dateToShow) : 'N/A'}
                      </ThemedText>
                      <ThemedText type="caption" color="secondary">
                        {dateToShow ? formatTime(dateToShow) : ''}
                      </ThemedText>
                    </View>
                    {isFailed ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.error + '15' }]}>
                        <Feather name="x-circle" size={14} color={theme.error} />
                        <ThemedText type="caption" style={{ color: theme.error, marginLeft: 4 }}>
                          Failed
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={[styles.earningsBadge, { backgroundColor: theme.success + '15' }]}>
                        <ThemedText type="h4" style={{ color: theme.success }}>
                          £{(job.driver_price ?? 0).toFixed(2)}
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  {isFailed && job.failure_reason ? (
                    <View style={[styles.failureReason, { backgroundColor: theme.error + '10' }]}>
                      <Feather name="alert-circle" size={14} color={theme.error} />
                      <ThemedText type="small" style={{ color: theme.error, flex: 1, marginLeft: 8 }}>
                        {job.failure_reason}
                      </ThemedText>
                    </View>
                  ) : null}

                  <View style={styles.routeContainer}>
                    <View style={styles.routePoint}>
                      <View style={[styles.routeDot, { backgroundColor: theme.primary }]} />
                      <ThemedText type="small" numberOfLines={1} style={styles.routeAddress}>
                        {job.pickup_address || job.pickup_postcode || 'Pickup'}
                      </ThemedText>
                    </View>
                    <View style={[styles.routeLine, { borderLeftColor: theme.border }]} />
                    <View style={styles.routePoint}>
                      <View style={[styles.routeDot, { backgroundColor: statusColor }]} />
                      <ThemedText type="small" numberOfLines={1} style={styles.routeAddress}>
                        {job.dropoff_address || job.delivery_address || 'Delivery'}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                    <View style={styles.footerItem}>
                      <Feather name="navigation" size={12} color={theme.secondaryText} />
                      <ThemedText type="caption" color="secondary">
                        {job.distance ?? 0} miles
                      </ThemedText>
                    </View>
                    <ThemedText type="caption" color="secondary">
                      #{job.job_number || job.tracking_number || String(job.id).slice(0, 8).toUpperCase()}
                    </ThemedText>
                  </View>

                  {job.pod_notes ? (
                    <View style={[styles.podNotes, { backgroundColor: theme.backgroundSecondary }]}>
                      <ThemedText type="caption" color="secondary">Notes:</ThemedText>
                      <ThemedText type="small">{job.pod_notes}</ThemedText>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["3xl"],
  },
  earningsCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  earningsHeader: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  earningsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptySubtext: {
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  jobsList: {
    gap: Spacing.md,
  },
  jobCard: {
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  earningsBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  failureReason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  routeContainer: {
    marginBottom: Spacing.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    marginLeft: 4,
    height: 16,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  routeAddress: {
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  podNotes: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
});
